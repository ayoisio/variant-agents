"""
This service contains the core, long-running logic for VEP annotation.
It is designed to be called by a background worker (e.g., triggered by Cloud Tasks).
"""

import asyncio
import os
import json
import structlog
from google.cloud import firestore_v1

from ..core.exceptions import AgentExecutionError
from ..models.variant import serialize_data_to_artifact, deserialize_data_from_artifact
from ..services.session_metadata_service import SessionMetadataService

logger = structlog.get_logger(__name__)


class VepRunnerService:
    """Encapsulates the logic to execute a VEP annotation task."""

    def __init__(self, db_client, artifact_service=None):
        """
        Initialize the VEP runner with an explicit database client.

        Args:
            db_client: An initialized Firestore AsyncClient instance
        """
        if not db_client:
            raise ValueError("VepRunnerService requires a valid Firestore client.")
        if not artifact_service:
            raise ValueError("VepRunnerService requires a valid artifact service.")
        self.db = db_client
        self.artifact_service = artifact_service

    async def run(self, task_id: str):
        """The main execution method for a VEP task."""
        task_logger = logger.bind(task_id=task_id)

        # Use the instance-level client
        task_ref = self.db.collection("background_tasks").document(task_id)

        # Determine fork count
        fork_count = int(os.environ.get('VEP_FORK_COUNT', '4'))

        try:
            # 1. Fetch the full task context from Firestore
            doc = await task_ref.get()
            if not doc.exists:
                task_logger.error("Task document not found in Firestore. Aborting.")
                return

            task_data = doc.to_dict()
            context = task_data.get("context", {})
            session_id = context.get("session_id")
            user_id = context.get("user_id")
            app_name = context.get("app_name")

            # Log the context for debugging
            task_logger.info("Task context retrieved",
                             session_id=session_id,
                             user_id=user_id,
                             app_name=app_name)

            if not all([session_id, user_id, app_name]):
                raise AgentExecutionError("Incomplete context in Firestore task document.")

            task_logger = task_logger.bind(session_id=session_id)

            # 2. Update Firestore: Mark task as "running"
            await task_ref.update({"status": "running", "updatedAt": firestore_v1.SERVER_TIMESTAMP})
            task_logger.info("VEP task started.")

            input_artifact = task_data['input_artifact']
            output_artifact = task_data['output_artifact']

            # 3. Load variants from the input artifact
            task_logger.info("Loading variants from artifact...",
                             artifact_name=input_artifact,
                             app_name=app_name,
                             user_id=user_id,
                             session_id=session_id)

            try:
                variants_artifact = await self.artifact_service.load_artifact(
                    app_name=app_name, user_id=user_id, session_id=session_id, filename=input_artifact
                )

                # Log artifact details
                if variants_artifact:
                    task_logger.info("Artifact loaded successfully",
                                     artifact_type=type(variants_artifact).__name__,
                                     has_inline_data=hasattr(variants_artifact, 'inline_data'),
                                     inline_data_size=len(variants_artifact.inline_data.data) if hasattr(
                                         variants_artifact, 'inline_data') and variants_artifact.inline_data else 0)
                else:
                    task_logger.error("Artifact loaded but is None")

                variants = deserialize_data_from_artifact(variants_artifact)
                task_logger.info(f"Deserialized {len(variants)} variants from artifact")

            except Exception as e:
                task_logger.error("Failed to load input artifact",
                                  error=str(e),
                                  artifact_name=input_artifact)
                raise

            # 4. Execute the VEP annotation logic using the installed VEP
            batch_size = 5000
            total_variants = len(variants)
            variant_map = {f"{v.chrom.replace('chr', '')}:{v.pos}": v for v in variants}

            task_logger.info(
                f"Starting VEP annotation for {total_variants} variants in {-(-total_variants // batch_size)} batches")

            total_annotations = 0
            total_am_scores = 0

            for i in range(0, total_variants, batch_size):
                batch_end = min(i + batch_size, total_variants)
                batch = variants[i:batch_end]
                batch_num = i // batch_size + 1
                total_batches = -(-total_variants // batch_size)  # Ceiling division
                task_logger.info(f"Processing VEP batch {batch_num}/{total_batches}",
                                 batch_size=len(batch),
                                 batch_start_idx=i,
                                 batch_end_idx=batch_end)

                # Create VCF content for this batch
                vcf_content = "##fileformat=VCFv4.2\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\n"
                for variant in batch:
                    chrom = variant.chrom.replace('chr', '')
                    vcf_content += f"{chrom}\t{variant.pos}\t.\t{variant.ref}\t{','.join(variant.alt)}\t.\tPASS\t.\n"

                # Use the VEP installed directly in the container
                cmd = [
                    '/opt/ensembl-vep/vep',
                    '--cache',
                    '--offline',
                    '--dir_cache', '/mnt/cache',  # Using the mounted persistent disk
                    '--dir_plugins', '/opt/ensembl-vep/Plugins',
                    '--assembly', 'GRCh38',
                    '--format', 'vcf',
                    '--json',
                    '--symbol',
                    '--no_stats',
                    '--fork', str(fork_count),
                    '--plugin', 'AlphaMissense,file=/app/data/AlphaMissense_hg38.tsv.gz',
                    '-o', 'STDOUT'
                ]

                # Execute VEP
                process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                stdout, stderr = await process.communicate(input=vcf_content.encode())

                if process.returncode != 0:
                    error_msg = stderr.decode()
                    task_logger.error("VEP process failed", error=error_msg)
                    raise AgentExecutionError(f"VEP process failed: {error_msg}")

                # Parse VEP JSON output
                annotations_in_batch = 0
                am_scores_in_batch = 0
                for line in stdout.decode().split('\n'):
                    if not line.strip() or line.startswith('#'):
                        continue

                    try:
                        data = json.loads(line)

                        # Extract location from input field
                        loc_parts = data.get('input', '').split('\t')[:2]
                        if len(loc_parts) < 2:
                            continue

                        key = f"{loc_parts[0]}:{loc_parts[1]}"
                        if key in variant_map:
                            variant = variant_map[key]
                            gene = None
                            consequences = []
                            impact = None
                            # AlphaMissense variables
                            am_score = None
                            am_class = None

                            # Extract annotations from transcript consequences
                            for tc in data.get('transcript_consequences', []):
                                if tc.get('gene_symbol'):
                                    gene = tc.get('gene_symbol')
                                if tc.get('consequence_terms'):
                                    consequences.extend(tc['consequence_terms'])
                                if tc.get('impact'):
                                    impact = tc.get('impact')

                                # Extract AlphaMissense data from nested structure
                                # VEP outputs lowercase key: {"alphamissense": {"am_pathogenicity": ..., "am_class": ...}}
                                am_data = tc.get('alphamissense', {})
                                if am_score is None and am_data.get('am_pathogenicity') is not None:
                                    am_score = float(am_data['am_pathogenicity'])
                                if am_class is None and am_data.get('am_class'):
                                    am_class = am_data['am_class']

                                # Fallback: flat fields directly on the transcript consequence
                                if am_score is None and tc.get('am_pathogenicity') is not None:
                                    am_score = float(tc['am_pathogenicity'])
                                if am_class is None and tc.get('am_class'):
                                    am_class = tc['am_class']

                            # Update variant with VEP annotations
                            if gene:
                                variant.info['GENE'] = gene
                                annotations_in_batch += 1
                            if consequences:
                                variant.info['VEP_consequence'] = list(set(consequences))
                            if impact:
                                variant.info['VEP_impact'] = impact

                            # Store AlphaMissense data in variant info
                            if am_score is not None:
                                variant.info['AM_score'] = am_score
                                am_scores_in_batch += 1
                            if am_class:
                                variant.info['AM_class'] = am_class

                    except json.JSONDecodeError as e:
                        task_logger.warning("Failed to parse VEP JSON line", line=line[:100], error=str(e))
                        continue

                task_logger.info(f"Completed VEP batch {batch_num}/{total_batches}",
                                 annotations_added=annotations_in_batch,
                                 am_scores_found=am_scores_in_batch)

                total_annotations += annotations_in_batch
                total_am_scores += am_scores_in_batch

                # Update Firestore progress every 25 batches
                if batch_num % 25 == 0 or batch_num == total_batches:
                    progress_pct = round(batch_num / total_batches * 100, 1)
                    try:
                        await task_ref.update({
                            "progress": {
                                "current_batch": batch_num,
                                "total_batches": total_batches,
                                "progress_pct": progress_pct,
                                "annotations_added": total_annotations,
                                "am_scores_found": total_am_scores,
                            },
                            "updatedAt": firestore_v1.SERVER_TIMESTAMP
                        })
                    except Exception as progress_err:
                        task_logger.warning("Failed to update Firestore progress",
                                           error=str(progress_err),
                                           batch_num=batch_num)

            task_logger.info("VEP annotation complete for all batches.")

            # 5. Save the annotated variants to the output artifact
            task_logger.info("Preparing to save annotated variants",
                             output_artifact=output_artifact,
                             variant_count=len(variants))

            try:
                # Serialize the data
                final_artifact = serialize_data_to_artifact(variants)

                # Log serialized artifact details
                task_logger.info("Artifact serialized",
                                 artifact_type=type(final_artifact).__name__,
                                 has_inline_data=hasattr(final_artifact, 'inline_data'),
                                 inline_data_size=len(final_artifact.inline_data.data) if hasattr(final_artifact,
                                                                                                  'inline_data') and final_artifact.inline_data else 0)

                # Save to artifact service
                version = await self.artifact_service.save_artifact(
                    app_name=app_name,
                    user_id=user_id,
                    session_id=session_id,
                    filename=output_artifact,
                    artifact=final_artifact
                )

                task_logger.info("Artifact save completed",
                                 artifact_name=output_artifact,
                                 version=version,
                                 expected_path=f"{app_name}/{user_id}/{session_id}/{output_artifact}/{version}")

                # Verify the save by attempting to load
                task_logger.info("Verifying saved artifact can be loaded...")
                try:
                    verify_artifact = await self.artifact_service.load_artifact(
                        app_name=app_name,
                        user_id=user_id,
                        session_id=session_id,
                        filename=output_artifact
                    )
                    if verify_artifact:
                        verify_data = deserialize_data_from_artifact(verify_artifact)
                        task_logger.info("Artifact verification successful",
                                         loaded_variant_count=len(verify_data))
                    else:
                        task_logger.error("Artifact verification failed - loaded artifact is None")

                except Exception as verify_error:
                    task_logger.error("Artifact verification failed",
                                      error=str(verify_error),
                                      artifact_name=output_artifact)

            except Exception as save_error:
                task_logger.error("Failed to save artifact",
                                  error=str(save_error),
                                  artifact_name=output_artifact)

                # Log additional debugging info
                import traceback
                task_logger.error("Full traceback",
                                  traceback=traceback.format_exc())
                raise

            # 6. Update Firestore: Mark task as "completed"
            await task_ref.update({
                "status": "completed",
                "updatedAt": firestore_v1.SERVER_TIMESTAMP,
                "output_artifact": output_artifact
            })
            task_logger.info("VEP task finished successfully.")

            # 7. Update session metadata to reflect VEP completion
            metadata_service = SessionMetadataService(self.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                vep_status="completed",
                status="analyzing"  # Ready for report generation
            )
            task_logger.info("Updated session metadata with VEP completion status")

        except Exception as e:
            task_logger.exception("VEP background task failed.")
            await task_ref.update({
                "status": "failed",
                "error": str(e),
                "updatedAt": firestore_v1.SERVER_TIMESTAMP
            })

            # Update session metadata to reflect failure
            if 'session_id' in locals():
                try:
                    metadata_service = SessionMetadataService(self.db)
                    await metadata_service.update_metadata(
                        session_id=session_id,
                        vep_status="failed",
                        status="error",
                        error_message=f"VEP failed: {str(e)}"
                    )
                    task_logger.info("Updated session metadata with VEP failure status")
                except Exception as meta_error:
                    task_logger.error(f"Failed to update session metadata: {meta_error}")
