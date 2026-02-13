"""
Service to handle report generation (knowledge retrieval + clinical assessment) as a background task.
"""
import asyncio
import json
import time
import pickle
from collections import Counter
from typing import Dict, Any, List, Optional, Tuple
import structlog
from google.cloud import firestore_v1
from google.genai.types import GenerateContentConfig

from ..models.variant import serialize_data_to_artifact, deserialize_data_from_artifact, VariantAnnotation
from ..services.clinvar_client import ClinVarClient
from ..services.gnomad_client import GnomADClient
from ..services.acmg_classifier import ACMGClassifier
from ..services.session_metadata_service import SessionMetadataService
from ..core.exceptions import AgentExecutionError
from ..core import clients
from ..core.acmg_genes import (
    filter_variants_to_acmg_genes,
    apply_acmg_reporting_rules,
    is_acmg_gene,
    get_gene_category,
    get_acmg_stats
)

logger = structlog.get_logger(__name__)


class ReportGenerationService:
    """Handles the complete report generation pipeline as a background task."""

    def __init__(self, db_client, artifact_service):
        """
        Initialize the report generation service.

        Args:
            db_client: Firestore AsyncClient instance
            artifact_service: ADK artifact service for saving/loading artifacts
        """
        if not db_client:
            raise ValueError("ReportGenerationService requires a valid Firestore client")
        if not artifact_service:
            raise ValueError("ReportGenerationService requires a valid artifact service")

        self.db = db_client
        self.artifact_service = artifact_service

    async def run(self, task_id: str):
        """
        Execute the complete report generation task.

        This includes:
        1. Knowledge retrieval from ClinVar and gnomAD
        2. ACMG classification for unannotated variants
        3. Clinical assessment generation using LLM
        4. Saving all artifacts and updating task status
        """
        task_logger = logger.bind(task_id=task_id)
        task_ref = self.db.collection("background_tasks").document(task_id)

        try:
            # 1. Fetch task context from Firestore
            task_logger.info("Fetching task context from Firestore")
            doc = await task_ref.get()
            if not doc.exists:
                task_logger.error("Task document not found in Firestore")
                return

            task_data = doc.to_dict()
            context = task_data.get("context", {})
            session_id = context.get("session_id")
            user_id = context.get("user_id")
            app_name = context.get("app_name")
            vep_artifact = task_data.get("vep_artifact")

            # Get analysis mode from context (default to clinical)
            analysis_mode = context.get("analysis_mode", "clinical")

            task_logger.info(
                f"Starting report generation in {analysis_mode.upper()} mode",
                session_id=session_id,
                analysis_mode=analysis_mode
            )

            if not all([session_id, user_id, app_name, vep_artifact]):
                raise AgentExecutionError(
                    f"Incomplete context: session_id={session_id}, user_id={user_id}, "
                    f"app_name={app_name}, vep_artifact={vep_artifact}"
                )

            task_logger = task_logger.bind(session_id=session_id, user_id=user_id, analysis_mode=analysis_mode)

            # 2. Update status to running
            await task_ref.update({
                "status": "running",
                "phase": "loading_variants",
                "analysis_mode": analysis_mode,
                "updatedAt": firestore_v1.SERVER_TIMESTAMP
            })

            # 3. Load VEP-annotated variants with yielding
            task_logger.info("Loading VEP-annotated variants", artifact=vep_artifact)
            try:
                variants_artifact = await self.artifact_service.load_artifact(
                    app_name=app_name,
                    user_id=user_id,
                    session_id=session_id,
                    filename=vep_artifact
                )

                # Deserialize with periodic yielding
                if hasattr(variants_artifact, 'inline_data') and variants_artifact.inline_data:
                    data_bytes = variants_artifact.inline_data.data
                    task_logger.info("Deserializing large variant dataset...")
                    variants = pickle.loads(data_bytes)
                    await asyncio.sleep(0.01)  # 10ms yield

                    if isinstance(variants, list) and len(variants) > 100000:
                        await asyncio.sleep(0.05)  # 50ms yield for very large datasets
                else:
                    variants = deserialize_data_from_artifact(variants_artifact)
                    await asyncio.sleep(0.01)

                task_logger.info(f"Successfully loaded {len(variants)} variants from VEP artifact")
                await asyncio.sleep(0.1)

            except Exception as e:
                task_logger.error("Failed to load VEP artifact", error=str(e))
                raise AgentExecutionError(f"Could not load VEP artifact: {str(e)}")

            # 4. Apply ACMG filtering if in clinical mode
            if analysis_mode == "clinical":
                task_logger.info("Clinical mode: Applying ACMG gene filtering")

                # Log ACMG stats
                acmg_stats = get_acmg_stats()
                task_logger.info(
                    "Using ACMG SF v3.3 gene list",
                    version=acmg_stats["version"],
                    total_genes=acmg_stats["total_genes"]
                )

                # Filter to ACMG genes only
                variants_to_annotate = filter_variants_to_acmg_genes(variants)

                task_logger.info(
                    f"Filtered {len(variants)} total variants to {len(variants_to_annotate)} "
                    f"in ACMG reportable genes"
                )

                if not variants_to_annotate:
                    task_logger.warning("No variants found in ACMG genes")
            else:
                # Research mode - analyze all variants
                task_logger.info("Research mode: Analyzing all variants genome-wide")
                variants_to_annotate = variants
                task_logger.info(f"Processing all {len(variants_to_annotate)} variants")

            # 5. Knowledge Retrieval Phase
            task_logger.info("Starting knowledge retrieval phase")
            await task_ref.update({
                "phase": "knowledge_retrieval",
                "variants_being_analyzed": len(variants_to_annotate),
                "updatedAt": firestore_v1.SERVER_TIMESTAMP
            })

            # Initialize clients
            clinvar = ClinVarClient()
            gnomad = GnomADClient()
            acmg = ACMGClassifier()

            try:
                # Get ClinVar annotations (only for filtered variants)
                task_logger.info(
                    f"Querying ClinVar for {len(variants_to_annotate)} variants "
                    f"({analysis_mode} mode)"
                )
                annotations = await clinvar.batch_annotate(variants_to_annotate)
                task_logger.info(f"Retrieved {len(annotations)} annotations from ClinVar")

                await asyncio.sleep(0)

                # Update gene symbols for annotated variants
                gene_update_count = 0
                CHUNK_SIZE = 1000

                # Only update genes for the variants we're analyzing
                for i in range(0, len(variants_to_annotate), CHUNK_SIZE):
                    chunk_end = min(i + CHUNK_SIZE, len(variants_to_annotate))
                    for j in range(i, chunk_end):
                        v = variants_to_annotate[j]
                        if v.variant_id in annotations and annotations[v.variant_id].gene_symbol:
                            v.info["GENE"] = annotations[v.variant_id].gene_symbol
                            gene_update_count += 1

                    await asyncio.sleep(0)
                    if i % 10000 == 0 and i > 0:
                        await asyncio.sleep(0.01)

                task_logger.info(f"Updated gene symbols for {gene_update_count} variants")

                # Get gnomAD population frequencies (only for filtered variants)
                task_logger.info(
                    f"Querying gnomAD for population frequencies ({len(variants_to_annotate)} variants)"
                )
                frequencies = await gnomad.batch_query_frequencies(variants_to_annotate)
                task_logger.info(f"Retrieved frequency data for {len(frequencies)} variants")

                await asyncio.sleep(0)

                # ACMG classification for unannotated variants
                task_logger.info("Performing ACMG classification for unannotated variants...")
                acmg_classified_count = 0
                am_classified_count = 0  # Track AM classifications

                CHUNK_SIZE = 1000
                for i in range(0, len(variants_to_annotate), CHUNK_SIZE):
                    chunk_end = min(i + CHUNK_SIZE, len(variants_to_annotate))
                    for j in range(i, chunk_end):
                        v = variants_to_annotate[j]

                        # Get AlphaMissense data from variant info
                        am_score = v.info.get('AM_score')
                        am_class = v.info.get('AM_class')

                        if v.variant_id not in annotations:
                            freq = frequencies.get(v.variant_id)

                            # Check AlphaMissense FIRST for unannotated variants
                            if am_class == 'likely_pathogenic' or (am_score and am_score > 0.564):
                                annotations[v.variant_id] = VariantAnnotation(
                                    variant_id=v.variant_id,
                                    source="AlphaMissense",
                                    clinical_significance="Likely Pathogenic (AI Predicted)",
                                    gene_symbol=v.info.get("GENE"),
                                    am_pathogenicity=am_score,
                                    am_class=am_class
                                )
                                am_classified_count += 1
                            else:
                                # Fall back to ACMG classifier
                                classification, criteria, rationale = acmg.classify_variant(v, None, freq)

                                if classification in ["Pathogenic", "Likely pathogenic"]:
                                    annotations[v.variant_id] = VariantAnnotation(
                                        variant_id=v.variant_id,
                                        source="ACMG_Classifier",
                                        clinical_significance=classification,
                                        acmg_criteria=criteria,
                                        gene_symbol=v.info.get("GENE"),
                                        am_pathogenicity=am_score,
                                        am_class=am_class
                                    )
                                    acmg_classified_count += 1
                        else:
                            # Add AM data to existing ClinVar annotations
                            existing_ann = annotations[v.variant_id]
                            if am_score is not None and existing_ann.am_pathogenicity is None:
                                existing_ann.am_pathogenicity = am_score
                                existing_ann.am_class = am_class

                    await asyncio.sleep(0)
                    if i % 10000 == 0 and i > 0:
                        await asyncio.sleep(0.01)

                task_logger.info(f"ACMG classified {acmg_classified_count} pathogenic variants")
                task_logger.info(f"AlphaMissense classified {am_classified_count} pathogenic variants")

            finally:
                await clinvar.close()
                await gnomad.close()

            # 6. Apply ACMG reporting rules if in clinical mode
            if analysis_mode == "clinical":
                task_logger.info("Applying ACMG reporting rules (filtering VUS, checking recessive genes)")

                # Group annotations by gene
                annotations_by_gene = {}
                for variant_id, ann in annotations.items():
                    if ann.gene_symbol:
                        if ann.gene_symbol not in annotations_by_gene:
                            annotations_by_gene[ann.gene_symbol] = []
                        annotations_by_gene[ann.gene_symbol].append(ann)

                # Apply ACMG-specific reporting rules
                filtered_annotations_by_gene = apply_acmg_reporting_rules(annotations_by_gene)

                # Rebuild annotations dict with only reportable variants
                filtered_annotations = {}
                for gene, anns in filtered_annotations_by_gene.items():
                    for ann in anns:
                        filtered_annotations[ann.variant_id] = ann

                task_logger.info(
                    f"After ACMG filtering: {len(filtered_annotations)} reportable variants "
                    f"from {len(annotations)} total annotations"
                )

                # Use filtered annotations for clinical mode
                annotations = filtered_annotations

            # Save annotations artifact
            annotations_data = {
                'annotations': annotations,
                'frequencies': frequencies,
                'analysis_mode': analysis_mode,
                'total_variants_analyzed': len(variants_to_annotate)
            }
            annotations_artifact_name = f"annotations_{task_id}.pkl"

            task_logger.info("Saving annotations artifact", artifact_name=annotations_artifact_name)
            await self.artifact_service.save_artifact(
                app_name=app_name,
                user_id=user_id,
                session_id=session_id,
                filename=annotations_artifact_name,
                artifact=serialize_data_to_artifact(annotations_data)
            )
            task_logger.info(
                f"Saved annotations artifact with {len(annotations)} annotations "
                f"(mode: {analysis_mode})"
            )

            await asyncio.sleep(0)

            # 7. Clinical Assessment Phase
            task_logger.info("Starting clinical assessment phase")
            await task_ref.update({
                "phase": "clinical_assessment",
                "updatedAt": firestore_v1.SERVER_TIMESTAMP
            })

            # Extract pathogenic variants for assessment
            pathogenic_variants = []
            for variant_id, ann in annotations.items():
                if ann.clinical_significance and "pathogenic" in ann.clinical_significance.lower():
                    condition_text = ann.condition
                    if isinstance(condition_text, list):
                        condition_text = "; ".join(condition_text) if condition_text else None

                    category_obj = get_gene_category(ann.gene_symbol) if ann.gene_symbol else None
                    pathogenic_variants.append({
                        "variant_id": ann.variant_id,
                        "gene": ann.gene_symbol,
                        "significance": ann.clinical_significance,
                        "condition": condition_text,
                        "category": category_obj.value if category_obj else "Other"
                    })

            task_logger.info(
                f"Found {len(pathogenic_variants)} pathogenic/likely pathogenic variants "
                f"for clinical assessment"
            )

            # Generate clinical assessment based on mode
            if not pathogenic_variants:
                if analysis_mode == "clinical":
                    clinical_summary = "No pathogenic or likely pathogenic variants were identified in ACMG secondary findings genes."
                    recommendations = ["No secondary findings requiring immediate action.",
                                     "Continue clinical management based on primary indication for testing."]
                else:
                    clinical_summary = "No pathogenic or likely pathogenic variants were identified in this comprehensive genomic analysis."
                    recommendations = ["Continue clinical management based on phenotype."]
                key_findings = ["No pathogenic variants detected."]
            else:
                clinical_summary, recommendations, key_findings = await self._generate_clinical_assessment(
                    pathogenic_variants, task_logger, analysis_mode
                )

            # 8. Save final report data
            report_data = {
                "annotations_artifact": annotations_artifact_name,
                "vep_variants_artifact": vep_artifact,
                "analysis_mode": analysis_mode,
                "pathogenic_count": len(pathogenic_variants),
                "total_annotations": len(annotations),
                "total_variants": len(variants),
                "total_variants_analyzed": len(variants_to_annotate),
                "clinical_summary": clinical_summary,
                "recommendations": recommendations,
                "key_findings": key_findings,
                "completed_at": time.time()
            }

            if analysis_mode == "clinical":
                report_data["acmg_version"] = "SF v3.3"
                report_data["acmg_genes_analyzed"] = len(set(ann.gene_symbol for ann in annotations.values() if ann.gene_symbol))

            # 9. Update task as completed
            await task_ref.update({
                "status": "completed",
                "phase": "complete",
                "updatedAt": firestore_v1.SERVER_TIMESTAMP,
                "output": report_data
            })

            # 10. Update session metadata
            metadata_service = SessionMetadataService(self.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                status="completed",
                report_status="completed",
                analysis_mode=analysis_mode,
                pathogenic_count=len(pathogenic_variants),
                annotations_count=len(annotations),
                summary=clinical_summary[:500] if clinical_summary else None
            )

            task_logger.info(
                "Report generation completed successfully",
                analysis_mode=analysis_mode,
                pathogenic_count=len(pathogenic_variants),
                total_annotations=len(annotations),
                variants_analyzed=len(variants_to_annotate)
            )

        except Exception as e:
            task_logger.exception("Report generation failed", error=str(e))

            await task_ref.update({
                "status": "failed",
                "error": str(e),
                "updatedAt": firestore_v1.SERVER_TIMESTAMP
            })

            if 'session_id' in locals():
                try:
                    metadata_service = SessionMetadataService(self.db)
                    await metadata_service.update_metadata(
                        session_id=session_id,
                        status="error",
                        report_status="failed",
                        error_message=f"Report generation failed: {str(e)}"
                    )
                except:
                    pass

    async def _generate_clinical_assessment(
            self,
            pathogenic_variants: List[Dict[str, Any]],
            task_logger,
            analysis_mode: str
    ) -> Tuple[str, List[str], List[str]]:
        """
        Generate clinical assessment using LLM analysis.
        Adapted for different analysis modes.
        """
        task_logger.info(f"Generating clinical assessment for {analysis_mode} mode")

        if not clients.genai_client:
            task_logger.warning("Gemini client not available, using fallback assessment")
            return self._generate_fallback_assessment(pathogenic_variants, analysis_mode)

        # Calculate statistics for pattern detection
        gene_list = [v.get('gene') for v in pathogenic_variants if v.get('gene')]
        gene_frequency = Counter(gene_list)
        genes_with_multiple_variants = {gene: count for gene, count in gene_frequency.items() if count > 1}

        condition_list = [v.get('condition') for v in pathogenic_variants if v.get('condition')]
        condition_frequency = Counter(condition_list)

        # Group variants by gene
        variants_by_gene = {}
        for v in pathogenic_variants:
            gene = v.get('gene')
            if gene:
                if gene not in variants_by_gene:
                    variants_by_gene[gene] = []
                variants_by_gene[gene].append(v)

        # Process in batches for better performance
        async def process_batch(batch, batch_num, total_batches):
            """Process a single batch of variants."""
            if analysis_mode == "clinical":
                context = "You are analyzing ACMG secondary findings (SF v3.3) - medically actionable incidental findings."
            else:
                context = "You are performing comprehensive genomic analysis for research purposes."

            prompt = f"""{context}

            **Pathogenic Variants in batch {batch_num} of {total_batches}:**
            {json.dumps(batch, indent=2)}

            Provide your response as a JSON object with these keys: 
            - "clinical_findings": List of important clinical findings from this batch
            - "genes_in_batch": List of unique genes in this batch
            - "conditions_in_batch": List of conditions associated with variants in this batch
            - "actionable_items": List of actionable recommendations from this batch
            - "variant_interactions": Any notable interactions or patterns within this batch"""

            try:
                response = await clients.genai_client.aio.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                    config=GenerateContentConfig(
                        response_mime_type="application/json",
                        max_output_tokens=65535,
                        temperature=0.1
                    )
                )

                if response.text:
                    return self._extract_json_from_response(response.text)
                else:
                    task_logger.warning(f"Empty response for batch {batch_num}")
                    return None

            except Exception as e:
                task_logger.error(f"Error processing batch {batch_num}: {e}")
                return None

        # Batch the variants
        batch_size = 50
        batches = [pathogenic_variants[i:i + batch_size]
                   for i in range(0, len(pathogenic_variants), batch_size)]

        task_logger.info(f"Processing {len(batches)} batches of variants...")

        # Process batches concurrently with a limit
        max_concurrent = 5
        semaphore = asyncio.Semaphore(max_concurrent)

        async def process_with_semaphore(batch, batch_num, total_batches):
            async with semaphore:
                result = await process_batch(batch, batch_num, total_batches)
                await asyncio.sleep(0)
                return result

        tasks = [process_with_semaphore(batch, i + 1, len(batches))
                 for i, batch in enumerate(batches)]

        batch_results = await asyncio.gather(*tasks)

        # Merge results
        all_findings = []
        all_genes = set()
        all_conditions = set()
        all_actionable = []
        all_interactions = []

        for result in batch_results:
            if result:
                all_findings.extend(result.get("clinical_findings", []))
                all_genes.update(result.get("genes_in_batch", []))
                all_conditions.update(result.get("conditions_in_batch", []))
                all_actionable.extend(result.get("actionable_items", []))
                all_interactions.extend(result.get("variant_interactions", []))

        successful_batches = len([r for r in batch_results if r])
        task_logger.info(f"Processed {successful_batches}/{len(batches)} batches successfully")

        if successful_batches == 0:
            task_logger.error("All batch processing failed, using fallback")
            return self._generate_fallback_assessment(pathogenic_variants, analysis_mode)

        # Generate final summary with mode-specific prompts
        if analysis_mode == "clinical":
            summary_prompt = self._get_clinical_mode_prompt(
                pathogenic_variants, gene_frequency, condition_frequency,
                genes_with_multiple_variants, all_findings, all_genes,
                all_interactions, all_actionable
            )
        else:
            summary_prompt = self._get_research_mode_prompt(
                pathogenic_variants, gene_frequency, condition_frequency,
                genes_with_multiple_variants, all_findings, all_genes,
                all_interactions, all_actionable
            )

        try:
            final_response = await clients.genai_client.aio.models.generate_content(
                model='gemini-2.5-flash',
                contents=summary_prompt,
                config=GenerateContentConfig(
                    response_mime_type="application/json",
                    max_output_tokens=65535,
                    temperature=0.1
                )
            )

            if final_response.text:
                assessment = self._extract_json_from_response(final_response.text)
                if assessment:
                    return (
                        assessment.get("clinical_summary", ""),
                        assessment.get("actionable_recommendations", []),
                        assessment.get("critical_key_findings", [])
                    )

        except Exception as e:
            task_logger.error(f"Failed to generate final summary: {e}")

        return self._generate_fallback_assessment(pathogenic_variants, analysis_mode)

    def _get_clinical_mode_prompt(self, pathogenic_variants, gene_frequency, condition_frequency,
                                  genes_with_multiple_variants, all_findings, all_genes,
                                  all_interactions, all_actionable):
        """Generate prompt for clinical mode (ACMG secondary findings)."""
        return f"""You are a clinical geneticist reporting ACMG Secondary Findings (SF v3.3).
    These are medically actionable incidental findings from clinical sequencing.
    
    **EVIDENCE HIERARCHY (in order of confidence):**
    1. **ClinVar:** Expert-validated clinical assertions (Gold Standard)
       - Pathogenic/Likely Pathogenic = confirmed clinical finding
       - Always report the review status (e.g., "reviewed by expert panel")
    
    2. **AlphaMissense:** AI-predicted pathogenicity from Google DeepMind (Silver Standard)
       - Score > 0.564: Likely Pathogenic
       - Score < 0.34: Likely Benign  
       - Score 0.34-0.564: Ambiguous (treat as VUS)
       - 90% precision validated against ClinVar
       - NOT trained on ClinVar, so predictions are independent
    
    3. **ACMG Classifier:** Rule-based computational classification (Bronze Standard)
       - Based on population frequency and variant type rules
       - Use when neither ClinVar nor AlphaMissense provides clear signal
    
    **INTERPRETATION GUIDELINES:**
    - If ClinVar says Pathogenic → Report as CONFIRMED finding
    - If NO ClinVar but AlphaMissense score > 0.9 → Flag as "High-Priority Novel Candidate"
    - If AlphaMissense conflicts with ClinVar → Defer to ClinVar but NOTE the discordance
    - Always clearly state the evidence SOURCE when reporting pathogenicity
    - Include AlphaMissense score when discussing AI-predicted variants
    
    **ACMG SECONDARY FINDINGS ANALYSIS:**
    - Total pathogenic/likely pathogenic variants in ACMG genes: {len(pathogenic_variants)}
    - Unique ACMG genes with findings: {len(gene_frequency)}
    - Genes with multiple variants (possible compound heterozygosity): {json.dumps(genes_with_multiple_variants, indent=2)}
    
    **KEY PATTERNS:**
    - Most common conditions: {json.dumps(condition_frequency.most_common(5), indent=2)}
    - Genes requiring immediate action: {json.dumps([gene for gene, count in gene_frequency.items() if count > 1], indent=2)}
    
    **BATCH ANALYSIS RESULTS:**
    - Clinical findings: {len(all_findings)} total findings
    - Sample findings: {json.dumps(all_findings[:10], indent=2)}
    - Actionable items identified: {json.dumps(all_actionable[:10], indent=2)}
    
    **YOUR TASK:**
    Generate a clinical report that:
    1. Clearly distinguishes CONFIRMED (ClinVar) vs PREDICTED (AlphaMissense) findings
    2. Prioritizes immediate medical actions for confirmed pathogenic findings
    3. Flags high-confidence AlphaMissense predictions (score > 0.9) as research candidates
    4. Recommends cascade testing for family members
    5. Notes any discordance between ClinVar and AlphaMissense
    
    Return as JSON with three keys:
    - "clinical_summary": Brief summary with evidence sources noted for each major finding
    - "actionable_recommendations": Specific, prioritized clinical actions
    - "critical_key_findings": Most urgent findings with their evidence source and confidence"""

    def _get_research_mode_prompt(self, pathogenic_variants, gene_frequency, condition_frequency,
                                  genes_with_multiple_variants, all_findings, all_genes,
                                  all_interactions, all_actionable):
        """Generate prompt for research mode (comprehensive analysis)."""
        return f"""You are performing comprehensive genomic analysis for research purposes.
    
    **EVIDENCE SOURCES:**
    1. **ClinVar:** Expert-validated clinical assertions
    2. **AlphaMissense:** AI-predicted pathogenicity (Google DeepMind)
       - Covers 89% of all 71 million possible human missense variants
       - Score > 0.564 = likely pathogenic, < 0.34 = likely benign
       - Enables analysis of novel variants not yet in clinical databases
    3. **ACMG Classifier:** Rule-based classification for remaining variants
    
    **RESEARCH VALUE OF ALPHAMISSENSE:**
    - Novel variants (not in ClinVar) with high AM scores = discovery opportunities
    - Discordance between ClinVar and AlphaMissense may indicate evolving understanding
    - AM scores enable prioritization for functional validation studies
    - Population-specific variants can be assessed even without clinical reports
    
    **COMPREHENSIVE GENOME ANALYSIS:**
    - Total pathogenic/likely pathogenic variants: {len(pathogenic_variants)}
    - Total unique genes affected: {len(gene_frequency)}
    - Total unique conditions: {len(condition_frequency)}
    
    **CRITICAL PATTERN ANALYSIS:**
    - Genes with multiple pathogenic variants: {json.dumps(genes_with_multiple_variants, indent=2)}
    - Most frequent conditions (top 10): {json.dumps(condition_frequency.most_common(10), indent=2)}
    - High-burden genes (>2 variants): {json.dumps([gene for gene, count in gene_frequency.items() if count > 2], indent=2)}
    
    **BATCH ANALYSIS SYNTHESIS:**
    - Total findings: {len(all_findings)}
    - Unique genes: {len(all_genes)}
    - Variant interactions: {json.dumps(all_interactions[:10], indent=2)}
    - Research insights: {json.dumps(all_actionable[:20], indent=2)}
    
    **YOUR TASK:**
    Provide a comprehensive research assessment including:
    1. Novel high-confidence AlphaMissense predictions NOT in ClinVar (discovery candidates)
    2. Overall genetic burden and disease risk profile
    3. Gene pathway analysis and potential interactions
    4. ClinVar vs AlphaMissense concordance analysis
    5. Variants warranting functional validation studies
    
    Note: This is for RESEARCH purposes - be comprehensive but indicate this is not for clinical use.
    
    Return as JSON with three keys:
    - "clinical_summary": Comprehensive overview with evidence source breakdown
    - "actionable_recommendations": Research priorities and suggested investigations  
    - "critical_key_findings": Most significant discoveries including novel AM predictions"""

    def _generate_fallback_assessment(self, pathogenic_variants: List[Dict[str, Any]],
                                      analysis_mode: str) -> Tuple[str, List[str], List[str]]:
        """Generate a basic assessment without LLM."""
        gene_list = [v.get('gene') for v in pathogenic_variants if v.get('gene')]
        gene_frequency = Counter(gene_list)
        genes_with_multiple = {gene: count for gene, count in gene_frequency.items() if count > 1}

        if analysis_mode == "clinical":
            summary = (
                f"ACMG Secondary Findings Analysis: Identified {len(pathogenic_variants)} "
                f"pathogenic/likely pathogenic variants in {len(gene_frequency)} ACMG-reportable genes. "
            )

            if genes_with_multiple:
                summary += f"Genes with multiple variants requiring special attention: {', '.join(list(genes_with_multiple.keys())[:5])}. "

            summary += "These findings require clinical follow-up as they represent medically actionable incidental findings."

            recommendations = [
                "1. Immediate genetic counseling for all ACMG secondary findings",
                "2. Initiate surveillance protocols for cancer predisposition genes if present",
                "3. Cardiology referral for cardiovascular gene variants",
                "4. Cascade testing for first-degree relatives",
                "5. Document findings in medical record for longitudinal care"
            ]

            key_findings = [
                f"Total ACMG secondary findings: {len(pathogenic_variants)} variants",
                f"Genes requiring action: {', '.join(list(gene_frequency.keys())[:10])}",
                "Medical follow-up required per ACMG SF v3.3 guidelines"
            ]
        else:
            # Research mode
            summary = (
                f"Comprehensive Genomic Analysis: Identified {len(pathogenic_variants)} "
                f"pathogenic/likely pathogenic variants across {len(gene_frequency)} genes. "
            )

            if genes_with_multiple:
                summary += f"Genes with multiple variants: {', '.join(list(genes_with_multiple.keys())[:10])}. "

            summary += "This research-level analysis requires expert interpretation and is not for clinical use."

            recommendations = [
                f"1. Priority investigation for genes with multiple variants: {', '.join(list(genes_with_multiple.keys())[:5])}",
                "2. Consider pathway analysis for affected gene networks",
                "3. Evaluate variant burden against population databases",
                "4. Research consultation for novel findings",
                "5. Further functional studies may be warranted"
            ]

            key_findings = [
                f"{len(genes_with_multiple)} genes have multiple pathogenic variants",
                f"Total genetic burden: {len(pathogenic_variants)} pathogenic variants",
                f"Affected genes span {len(set(v.get('category', 'Other') for v in pathogenic_variants))} categories"
            ]

        return summary, recommendations, key_findings

    def _extract_json_from_response(self, response_text: str) -> Optional[Dict]:
        """Extract JSON from LLM response text."""
        if not response_text:
            return None

        # Try direct parse
        try:
            cleaned = response_text.strip()
            if cleaned.startswith('\ufeff'):
                cleaned = cleaned[1:]
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # Try extracting from code blocks
        import re
        json_patterns = [
            r"```(?:json|JSON)?\s*\n?([\s\S]*?)```",
            r"```(?:json|JSON)?\s*([\s\S]*?)```",
        ]

        for pattern in json_patterns:
            matches = re.findall(pattern, response_text, re.DOTALL | re.IGNORECASE)
            if matches:
                for match in matches:
                    try:
                        match_cleaned = match.strip()
                        if match_cleaned.startswith('{') and match_cleaned.endswith('}'):
                            return json.loads(match_cleaned)
                    except json.JSONDecodeError:
                        continue

        # Try finding JSON boundaries
        json_start = response_text.find('{')
        json_end = response_text.rfind('}')

        if json_start != -1 and json_end != -1 and json_end > json_start:
            try:
                potential_json = response_text[json_start:json_end + 1]
                fixed_json = re.sub(r',\s*}', '}', potential_json)
                fixed_json = re.sub(r',\s*]', ']', fixed_json)
                return json.loads(fixed_json)
            except json.JSONDecodeError:
                pass

        return None
