"""
Defines the FunctionTools and LongRunningFunctionTools for the genomics agent.
Uses Google Cloud Firestore for task tracking and Google Cloud Tasks
to trigger background VEP processing and knowledge retrieval.
"""

import json
import uuid
import re
import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional

import structlog
from google.cloud import firestore_v1, tasks_v2

from google.adk.tools import FunctionTool, LongRunningFunctionTool, ToolContext

from ..core.acmg_genes import is_acmg_gene
from ..core.config import settings
from ..core.exceptions import AgentExecutionError
from ..core import clients
from ..models.variant import serialize_data_to_artifact, deserialize_data_from_artifact
from ..services.gcs_client import GCSClient
from ..services.vcf_parser import VCFParser
from ..services.session_metadata_service import SessionMetadataService

logger = structlog.get_logger(__name__)

# Create a thread pool for blocking I/O operations
executor = ThreadPoolExecutor(max_workers=4)


def extract_json_from_response(response_text: str) -> Optional[Dict]:
    """Extract JSON from response text with multiple fallback strategies."""
    if not response_text:
        logger.warning("Empty response text")
        return None

    # Strategy 1: Direct parse (if it's already clean JSON)
    try:
        cleaned = response_text.strip()
        if cleaned.startswith('\ufeff'):  # Remove BOM if present
            cleaned = cleaned[1:]

        result = json.loads(cleaned)
        return result
    except json.JSONDecodeError as e:
        logger.debug(f"Direct parse failed: {e}")

    # Strategy 2: Remove common prefixes and suffixes
    cleaned = response_text.strip()

    # Common prefixes to remove
    prefixes_to_remove = [
        "Here's the analysis:",
        "Here is the analysis:",
        "Here's the JSON:",
        "```json",
        "```JSON",
        "```",
    ]

    for prefix in prefixes_to_remove:
        if cleaned.lower().startswith(prefix.lower()):
            cleaned = cleaned[len(prefix):].strip()

    # Common suffixes to remove
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()

    # Try parsing after cleaning
    try:
        result = json.loads(cleaned)
        return result
    except json.JSONDecodeError:
        pass

    # Strategy 3: Extract from Markdown code blocks
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
                        result = json.loads(match_cleaned)
                        return result
                except json.JSONDecodeError:
                    continue

    # Strategy 4: Find JSON object boundaries with improved parsing
    start_idx = -1
    end_idx = -1
    brace_count = 0
    in_string = False
    escape_next = False

    for i, char in enumerate(response_text):
        if not escape_next:
            if char == '\\' and in_string:
                escape_next = True
                continue
            elif char == '"':
                in_string = not in_string
        else:
            escape_next = False
            continue

        if not in_string:
            if char == '{':
                if brace_count == 0:
                    start_idx = i
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0 and start_idx != -1:
                    end_idx = i + 1
                    try:
                        json_str = response_text[start_idx:end_idx]
                        result = json.loads(json_str)

                        # Validate it has expected structure for clinical assessment
                        expected_keys = ["clinical_summary", "actionable_recommendations", "critical_key_findings"]
                        if any(key in result for key in expected_keys):
                            return result
                    except json.JSONDecodeError:
                        pass
                    start_idx = -1

    # Strategy 5: Fix common JSON errors
    json_start = response_text.find('{')
    json_end = response_text.rfind('}')

    if json_start != -1 and json_end != -1 and json_end > json_start:
        potential_json = response_text[json_start:json_end + 1]

        # Fix common issues
        fixed_json = potential_json

        # Remove trailing commas
        fixed_json = re.sub(r',\s*}', '}', fixed_json)
        fixed_json = re.sub(r',\s*]', ']', fixed_json)

        # Fix unescaped newlines in strings
        fixed_json = re.sub(r'("(?:[^"\\]|\\.)*")', lambda m: m.group(1).replace('\n', '\\n'), fixed_json)

        try:
            result = json.loads(fixed_json)
            return result
        except json.JSONDecodeError:
            pass

    logger.error("All JSON extraction strategies failed")
    logger.debug(f"Response length: {len(response_text)}")
    logger.debug(f"Response starts with: {response_text[:200]}")
    return None


async def set_analysis_mode(mode: str, tool_context: ToolContext) -> Dict[str, Any]:
    """
    Set the analysis mode for the entire pipeline.

    Args:
        mode: Either 'clinical' or 'research'
        tool_context: The tool context for state management
    """
    tool_logger = logger.bind(tool="set_analysis_mode")

    # Validate mode
    if mode not in ['clinical', 'research']:
        tool_logger.warning(f"Invalid mode '{mode}', defaulting to 'clinical'")
        mode = 'clinical'

    # Set in state
    tool_context.state['analysis_mode'] = mode
    tool_logger.info(f"Analysis mode set to: {mode}")

    # Update session metadata if available
    session_id = tool_context.state.get('session:id')
    if session_id and clients.db:
        metadata_service = SessionMetadataService(clients.db)
        await metadata_service.update_metadata(
            session_id=session_id,
            analysis_mode=mode
        )

    return {
        "status": "success",
        "mode": mode,
        "message": f"Analysis mode set to {mode.upper()}"
    }


async def load_and_parse_vcf(gcs_path: str, tool_context: ToolContext) -> Dict[str, Any]:
    """
    Loads a VCF file from a GCS path, parses it, and saves the variant list
    as a session artifact.
    """
    tool_logger = logger.bind(tool="load_and_parse_vcf", invocation_id=tool_context.invocation_id)
    tool_logger.info("Executing tool", gcs_path=gcs_path)

    try:
        # Run the blocking GCS operations in a thread pool
        loop = asyncio.get_event_loop()

        # Define a function to run in thread
        def download_and_parse():
            gcs_client = GCSClient()
            vcf_content = gcs_client.read_vcf(gcs_path)
            vcf_parser = VCFParser()
            variants = list(vcf_parser.parse_vcf_content(vcf_content))
            stats = vcf_parser.get_summary_stats(variants)  # Calculate stats here
            return variants, stats

        # Run in thread pool to avoid blocking
        tool_logger.info("Downloading and parsing VCF file in background thread...")
        variants, stats = await loop.run_in_executor(executor, download_and_parse)
        tool_logger.info(f"Successfully parsed {len(variants)} variants")

        # Yield control after heavy operation completes
        await asyncio.sleep(0)  # Allow other tasks to run

        # Now continue with async operations
        artifact_name = f"parsed_variants_{tool_context.invocation_id}.pkl"
        await tool_context.save_artifact(filename=artifact_name, artifact=serialize_data_to_artifact(variants))

        # Yield again after saving large artifact
        await asyncio.sleep(0)

        tool_context.state['vcf_artifact_name'] = artifact_name
        tool_context.state['vcf_gcs_path'] = gcs_path

        # Update session metadata with VCF info and variant count
        session_id = tool_context.state.get('session:id')
        if session_id:
            metadata_service = SessionMetadataService(clients.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                vcf_path=gcs_path,
                variant_count=len(variants),
                status="parsing_complete"
            )

        return {"status": "success", "message": f"Successfully parsed {len(variants)} variants.",
                "artifact_name": artifact_name, "statistics": stats}

    except Exception as e:
        tool_logger.exception("Error in load_and_parse_vcf")

        # Update metadata with error status
        session_id = tool_context.state.get('session:id')
        if session_id:
            metadata_service = SessionMetadataService(clients.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                status="error",
                error_message=str(e)
            )

        return {"status": "error", "message": f"An unexpected error occurred: {str(e)}"}


async def start_vep_annotation(tool_context: ToolContext) -> Dict[str, Any]:
    """
    Initiates a long-running VEP annotation process by creating a record in
    Firestore and dispatching a task to Cloud Tasks.
    """
    tool_logger = logger.bind(tool="start_vep_annotation", invocation_id=tool_context.invocation_id)
    tool_logger.info("Executing tool to start background VEP task.")

    if not clients.db or not clients.tasks_client:
        msg = "Backend services (Firestore/Cloud Tasks) are not initialized."
        tool_logger.error(msg)
        return {"status": "error", "message": msg}

    try:
        input_artifact_name = tool_context.state.get('vcf_artifact_name')
        if not input_artifact_name:
            raise AgentExecutionError("VCF artifact not found. Run intake first.")

        task_id = str(uuid.uuid4())
        output_artifact_name = f"vep_annotated_{task_id}.pkl"

        session_id = tool_context.state.get('session:id')
        user_id = tool_context.state.get('session:user_id')
        app_name = tool_context.state.get('session:app_name')

        if not all([session_id, user_id, app_name]):
            raise AgentExecutionError("Session identifiers not found in state. Cannot create task.")

        task_ref = clients.db.collection("background_tasks").document(task_id)
        task_data = {
            "status": "pending",
            "createdAt": firestore_v1.SERVER_TIMESTAMP,
            "updatedAt": firestore_v1.SERVER_TIMESTAMP,
            "input_artifact": input_artifact_name,
            "output_artifact": output_artifact_name,
            "context": {"session_id": session_id, "user_id": user_id, "app_name": app_name}
        }
        await task_ref.set(task_data)
        tool_logger.info("Created task document in Firestore.", task_id=task_id)

        tool_context.state['vep_task_id'] = task_id
        tool_context.state['vep_started_at'] = time.time()

        parent = clients.tasks_client.queue_path(
            settings.gcp_project_id, settings.tasks_queue_location, settings.tasks_queue_name
        )

        task_payload = {"task_id": task_id}
        task = {
            'http_request': {
                'http_method': tasks_v2.HttpMethod.POST,
                'url': settings.worker_url,
                'body': json.dumps(task_payload).encode(),
                'headers': {'Content-type': 'application/json'}
            }
        }

        response = clients.tasks_client.create_task(request={'parent': parent, 'task': task})
        tool_logger.info("Dispatched task to Cloud Tasks.", task_name=response.name)

        # Update session metadata with VEP task info
        if session_id:
            metadata_service = SessionMetadataService(clients.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                vep_task_id=task_id,
                vep_status="pending",
                status="processing"
            )

        return {"status": "pending", "task_id": task_id,
                "message": "VEP annotation has been dispatched for background processing."}

    except Exception as e:
        tool_logger.exception("Failed to start VEP annotation.")

        # Update metadata with error
        session_id = tool_context.state.get('session:id')
        if session_id:
            metadata_service = SessionMetadataService(clients.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                status="error",
                error_message=f"VEP start failed: {str(e)}"
            )

        return {"status": "error", "message": f"Failed to start VEP task: {str(e)}"}


async def check_vep_status(task_id: str, tool_context: ToolContext) -> Dict[str, Any]:
    """Checks the status of a VEP annotation task by querying Firestore."""
    tool_logger = logger.bind(tool="check_vep_status", task_id=task_id)
    tool_logger.info("Executing tool")

    if not task_id and tool_context:
        task_id = tool_context.state.get('vep_task_id')

    if not clients.db:
        return {"status": "error", "message": "Firestore service is not initialized."}

    try:
        doc_ref = clients.db.collection("background_tasks").document(task_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return {"status": "error", "message": "Task ID not found."}

        task_data = doc.to_dict()
        status = task_data.get("status")
        session_id = tool_context.state.get('session:id')

        if status == "completed":
            output_artifact = task_data.get("output_artifact")
            tool_logger.info("Task completed.", output_artifact=output_artifact)

            if tool_context:
                tool_context.state['vep_completed'] = True
                tool_context.state['vep_artifact_name'] = output_artifact

            # Update session metadata
            if session_id:
                metadata_service = SessionMetadataService(clients.db)
                await metadata_service.update_metadata(
                    session_id=session_id,
                    vep_status="completed",
                    status="analyzing"
                )

            return {"status": "completed", "output_artifact": output_artifact}

        elif status == "failed":
            error = task_data.get("error", "An unknown error occurred.")
            tool_logger.error("Task failed.", error=error)

            if tool_context:
                tool_context.actions.escalate = True

            # Update metadata with failure
            if session_id:
                metadata_service = SessionMetadataService(clients.db)
                await metadata_service.update_metadata(
                    session_id=session_id,
                    vep_status="failed",
                    status="error",
                    error_message=error
                )

            return {"status": "failed", "error": error}
        else:
            tool_logger.info("Task is still pending or running.")

            if tool_context:
                tool_context.state['vep_completed'] = False
                tool_context.actions.escalate = True

            # Update metadata with current status
            if session_id:
                metadata_service = SessionMetadataService(clients.db)
                await metadata_service.update_metadata(
                    session_id=session_id,
                    vep_status=status
                )

            return {"status": status, "message": f"The task is currently in the '{status}' state."}

    except Exception as e:
        tool_logger.exception("Failed to check VEP status.")
        return {"status": "error", "message": f"Failed to check task status: {str(e)}"}


async def start_report_generation(tool_context: ToolContext, analysis_mode: str = "clinical") -> Dict[str, Any]:
    """
    Start report generation (knowledge retrieval + clinical assessment) as a background task.
    This runs after VEP completes to avoid blocking the main application.

    Args:
        tool_context: The tool context containing state and artifacts
        analysis_mode: Either "clinical" (ACMG genes only) or "research" (all genes)
    """
    tool_logger = logger.bind(tool="start_report_generation", invocation_id=tool_context.invocation_id)
    tool_logger.info(f"Starting report generation background task in {analysis_mode} mode")

    if not clients.db or not clients.tasks_client:
        return {"status": "error", "message": "Backend services not initialized"}

    try:
        vep_artifact = tool_context.state.get('vep_artifact_name')
        if not vep_artifact:
            raise AgentExecutionError("VEP artifact not found. VEP must complete first.")

        task_id = str(uuid.uuid4())
        session_id = tool_context.state.get('session:id')
        user_id = tool_context.state.get('session:user_id')
        app_name = tool_context.state.get('session:app_name')

        # Get analysis mode from state if not explicitly provided
        if not analysis_mode:
            analysis_mode = tool_context.state.get('analysis_mode', 'clinical')

        if not all([session_id, user_id, app_name]):
            raise AgentExecutionError("Session identifiers not found in state.")

        # Create task in Firestore with analysis mode
        task_ref = clients.db.collection("background_tasks").document(task_id)
        task_data = {
            "type": "report_generation",
            "status": "pending",
            "createdAt": firestore_v1.SERVER_TIMESTAMP,
            "updatedAt": firestore_v1.SERVER_TIMESTAMP,
            "vep_artifact": vep_artifact,
            "context": {
                "session_id": session_id,
                "user_id": user_id,
                "app_name": app_name,
                "analysis_mode": analysis_mode  # Pass analysis mode to background task
            }
        }
        await task_ref.set(task_data)
        tool_logger.info(f"Created report generation task in Firestore with {analysis_mode} mode", task_id=task_id)

        # Update state
        tool_context.state['report_task_id'] = task_id
        tool_context.state['report_started_at'] = time.time()
        tool_context.state['analysis_mode'] = analysis_mode

        # Create Cloud Tasks task
        parent = clients.tasks_client.queue_path(
            settings.gcp_project_id,
            settings.tasks_queue_location,
            settings.tasks_queue_name
        )

        # Use a different endpoint for report generation
        worker_url = settings.worker_url.replace('/run-vep', '/generate-report')

        task = {
            'http_request': {
                'http_method': tasks_v2.HttpMethod.POST,
                'url': worker_url,
                'body': json.dumps({"task_id": task_id}).encode(),
                'headers': {'Content-type': 'application/json'}
            }
        }

        response = clients.tasks_client.create_task(
            request={'parent': parent, 'task': task}
        )
        tool_logger.info("Dispatched report generation to Cloud Tasks", task_name=response.name)

        # Update session metadata with mode
        if session_id:
            metadata_service = SessionMetadataService(clients.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                report_task_id=task_id,
                report_status="pending",
                analysis_mode=analysis_mode,
                status="generating_report"
            )

        # Construct message based on analysis mode
        if analysis_mode == "clinical":
            mode_message = "Report will focus on ACMG secondary findings (84 medically actionable genes)."
        else:
            mode_message = "Comprehensive genome-wide analysis will be performed (all variants)."

        return {
            "status": "started",
            "task_id": task_id,
            "analysis_mode": analysis_mode,
            "message": f"Report generation has been started in {analysis_mode.upper()} mode. {mode_message} This will take approximately 3-5 minutes for knowledge retrieval and clinical assessment."
        }

    except Exception as e:
        tool_logger.exception("Failed to start report generation")

        # Update metadata with error
        session_id = tool_context.state.get('session:id')
        if session_id:
            metadata_service = SessionMetadataService(clients.db)
            await metadata_service.update_metadata(
                session_id=session_id,
                status="error",
                error_message=f"Report generation start failed: {str(e)}"
            )

        return {"status": "error", "message": f"Failed to start report generation: {str(e)}"}


async def check_report_status(task_id: str, tool_context: ToolContext) -> Dict[str, Any]:
    """Check the status of report generation task."""
    tool_logger = logger.bind(tool="check_report_status", task_id=task_id)
    tool_logger.info("Checking report generation status")

    if not task_id and tool_context:
        task_id = tool_context.state.get('report_task_id')

    if not task_id:
        return {"status": "error", "message": "No report task ID found"}

    if not clients.db:
        return {"status": "error", "message": "Firestore not initialized"}

    try:
        doc_ref = clients.db.collection("background_tasks").document(task_id)
        doc = await doc_ref.get()

        if not doc.exists:
            return {"status": "error", "message": "Task not found"}

        task_data = doc.to_dict()
        status = task_data.get("status")
        session_id = tool_context.state.get('session:id')

        if status == "completed":
            output = task_data.get("output", {})
            analysis_mode = output.get("analysis_mode", "clinical")
            tool_logger.info(f"Report generation completed in {analysis_mode} mode",
                           pathogenic_count=output.get("pathogenic_count"))

            # Update state with results
            tool_context.state['annotations_artifact_name'] = output.get("annotations_artifact")
            tool_context.state['report_complete'] = True
            tool_context.state['annotations_complete'] = True  # For query_gene compatibility
            tool_context.state['clinical_summary'] = output.get("clinical_summary")
            tool_context.state['recommendations'] = output.get("recommendations")
            tool_context.state['key_findings'] = output.get("key_findings")
            tool_context.state['analysis_mode'] = analysis_mode

            # Update session metadata
            if session_id:
                metadata_service = SessionMetadataService(clients.db)
                await metadata_service.update_metadata(
                    session_id=session_id,
                    report_status="completed",
                    status="completed",
                    analysis_mode=analysis_mode
                )

            # Add mode-specific information to response
            mode_info = ""
            if analysis_mode == "clinical":
                mode_info = f" (ACMG SF v3.3 - {output.get('acmg_genes_analyzed', 0)} genes analyzed)"
            else:
                mode_info = f" (Comprehensive - {output.get('total_variants_analyzed', 0)} variants analyzed)"

            return {
                "status": "completed",
                "analysis_mode": analysis_mode,
                "summary": output.get("clinical_summary"),
                "recommendations": output.get("recommendations"),
                "key_findings": output.get("key_findings"),
                "pathogenic_count": output.get("pathogenic_count"),
                "total_annotations": output.get("total_annotations"),
                "mode_info": mode_info
            }

        elif status == "failed":
            error = task_data.get("error", "Unknown error")
            tool_logger.error("Report generation failed", error=error)

            if session_id:
                metadata_service = SessionMetadataService(clients.db)
                await metadata_service.update_metadata(
                    session_id=session_id,
                    report_status="failed",
                    status="error",
                    error_message=error
                )

            return {"status": "failed", "error": error}

        else:
            # Still running or pending
            phase = task_data.get("phase", "")
            message = f"Report generation is {status}"
            if phase:
                message += f" (currently: {phase})"

            tool_logger.info("Report generation in progress", status=status, phase=phase)

            if session_id:
                metadata_service = SessionMetadataService(clients.db)
                await metadata_service.update_metadata(
                    session_id=session_id,
                    report_status=status
                )

            return {"status": status, "message": message}

    except Exception as e:
        tool_logger.exception("Failed to check report status")
        return {"status": "error", "message": f"Failed to check report status: {str(e)}"}


async def retrieve_knowledge(tool_context: ToolContext) -> Dict[str, Any]:
    """
    DEPRECATED: This function is replaced by background report generation.
    Kept for backward compatibility only.
    """
    tool_logger = logger.bind(tool="retrieve_knowledge", invocation_id=tool_context.invocation_id)
    tool_logger.warning("DEPRECATED: retrieve_knowledge called directly. Should use start_report_generation instead.")

    # Return a message directing to use the new background approach
    return {
        "status": "deprecated",
        "message": "Knowledge retrieval should be done via background report generation to avoid blocking."
    }


async def perform_clinical_assessment(tool_context: ToolContext) -> Dict[str, Any]:
    """
    DEPRECATED: This function is replaced by background report generation.
    Kept for backward compatibility only.
    """
    tool_logger = logger.bind(tool="perform_clinical_assessment", invocation_id=tool_context.invocation_id)
    tool_logger.warning("DEPRECATED: perform_clinical_assessment called directly. Should use start_report_generation instead.")

    # Return a message directing to use the new background approach
    return {
        "status": "deprecated",
        "message": "Clinical assessment should be done via background report generation to avoid blocking."
    }


async def query_variant_by_gene(gene_name: str, tool_context: ToolContext,
                                max_variants: int = 100,
                                detail_level: str = "full") -> Dict[str, Any]:
    """
    Query specific gene variants from the annotations artifact.
    Enhanced to include population-specific frequency data and respect analysis mode.

    Args:
        gene_name: The gene symbol to search for (e.g., "APOB", "BRCA1")
        tool_context: The tool context containing state and artifacts
        max_variants: Maximum number of variants to return (default 100)
        detail_level: Level of detail - "full" (includes population frequencies) or "summary" (basic info only)

    Returns:
        Dictionary containing the query results with variant details
    """
    tool_logger = logger.bind(tool="query_variant_by_gene", gene=gene_name)
    tool_logger.info("Executing query for gene", gene_name=gene_name, detail_level=detail_level)

    # Check if annotations are available
    annotations_artifact_name = tool_context.state.get('annotations_artifact_name')
    if not annotations_artifact_name:
        return {
            "status": "error",
            "message": "No annotations available. Please complete the analysis first."
        }

    try:
        # Load the annotations artifact
        tool_logger.info("Loading annotations artifact", artifact_name=annotations_artifact_name)
        annotations_artifact = await tool_context.load_artifact(filename=annotations_artifact_name)
        annotations_data = deserialize_data_from_artifact(annotations_artifact)
        annotations = annotations_data.get('annotations', {})
        frequencies = annotations_data.get('frequencies', {})
        analysis_mode = annotations_data.get('analysis_mode', 'unknown')

        # Find variants for the specified gene
        gene_variants = []
        gene_name_upper = gene_name.upper()

        for variant_id, ann in annotations.items():
            if ann.gene_symbol and ann.gene_symbol.upper() == gene_name_upper:
                # Get frequency data if available
                freq_data = frequencies.get(variant_id, {})

                variant_info = {
                    "variant_id": ann.variant_id,
                    "gene": ann.gene_symbol,
                    "clinical_significance": ann.clinical_significance,
                    "condition": ann.condition,
                    "source": ann.source,
                    # Include AlphaMissense data
                    "am_pathogenicity": ann.am_pathogenicity,
                    "am_class": ann.am_class,
                }

                # Add frequency information based on detail level
                if freq_data:
                    # Always include basic frequency info
                    variant_info["population_frequency"] = freq_data.get("af", "Not available")
                    variant_info["frequency_source"] = freq_data.get("source", "Not available")

                    # Add detailed frequency information if requested
                    if detail_level == "full":
                        variant_info["allele_count"] = freq_data.get("ac", "Not available")
                        variant_info["allele_number"] = freq_data.get("an", "Not available")
                        variant_info["homozygote_count"] = freq_data.get("hom_count", "Not available")

                        # Population-specific frequencies (including zeros - they're clinically relevant)
                        population_frequencies = {}

                        # Map the population codes to readable names
                        population_mapping = {
                            "af_afr": "African/African American",
                            "af_amr": "Latino/Admixed American",
                            "af_asj": "Ashkenazi Jewish",
                            "af_eas": "East Asian",
                            "af_fin": "Finnish",
                            "af_nfe": "Non-Finnish European",
                            "af_sas": "South Asian",
                            "af_oth": "Other"
                        }

                        for pop_code, pop_name in population_mapping.items():
                            if pop_code in freq_data and freq_data.get(pop_code) is not None:
                                # Include all frequencies, even zeros (clinically relevant)
                                population_frequencies[pop_name] = freq_data.get(pop_code)

                        if population_frequencies:
                            variant_info["population_frequencies"] = population_frequencies

                            # Identify which population has highest frequency (excluding zeros for this)
                            non_zero_pops = {k: v for k, v in population_frequencies.items() if v > 0}
                            if non_zero_pops:
                                max_pop = max(non_zero_pops.items(), key=lambda x: x[1])
                                variant_info["highest_frequency_population"] = {
                                    "population": max_pop[0],
                                    "frequency": max_pop[1]
                                }

                            # Also note populations where variant is absent (frequency = 0)
                            absent_pops = [k for k, v in population_frequencies.items() if v == 0]
                            if absent_pops:
                                variant_info["absent_in_populations"] = absent_pops

                # Add ACMG criteria if available
                if hasattr(ann, 'acmg_criteria') and ann.acmg_criteria:
                    variant_info["acmg_criteria"] = ann.acmg_criteria

                gene_variants.append(variant_info)

        # Prepare the response
        if gene_variants:
            # Sort variants by clinical significance (pathogenic first)
            def significance_sort_key(v):
                sig = v.get("clinical_significance", "").lower()
                if "pathogenic" in sig and "likely" not in sig:
                    return 0
                elif "likely pathogenic" in sig:
                    return 1
                elif "uncertain" in sig:
                    return 2
                elif "likely benign" in sig:
                    return 3
                elif "benign" in sig:
                    return 4
                else:
                    return 5

            gene_variants.sort(key=significance_sort_key)

            # Apply max_variants limit if specified
            total_variants = len(gene_variants)
            if len(gene_variants) > max_variants:
                gene_variants = gene_variants[:max_variants]
                truncated = True
            else:
                truncated = False

            # Create summary statistics
            pathogenic_count = sum(
                1 for v in gene_variants if 'pathogenic' in v.get('clinical_significance', '').lower())

            # Analyze population distribution for pathogenic variants (only in full detail mode)
            population_summary = None
            if detail_level == "full":
                population_summary = {}
                for v in gene_variants:
                    if 'pathogenic' in v.get('clinical_significance', '').lower():
                        pop_freqs = v.get('population_frequencies', {})
                        for pop, freq in pop_freqs.items():
                            if pop not in population_summary:
                                population_summary[pop] = {"frequencies": [], "zero_count": 0, "non_zero_count": 0}
                            population_summary[pop]["frequencies"].append(freq)
                            if freq == 0:
                                population_summary[pop]["zero_count"] += 1
                            else:
                                population_summary[pop]["non_zero_count"] += 1

            tool_logger.info(f"Found {total_variants} variants in {gene_name}, returning {len(gene_variants)}")

            # Include analysis mode information
            mode_context = ""
            if analysis_mode == "clinical":
                mode_context = " (ACMG Secondary Findings analysis)"
            elif analysis_mode == "research":
                mode_context = " (Comprehensive genome-wide analysis)"

            response = {
                "status": "success",
                "gene": gene_name,
                "analysis_mode": analysis_mode,
                "variant_count": len(gene_variants),
                "total_variant_count": total_variants,
                "pathogenic_count": pathogenic_count,
                "variants": gene_variants,
                "detail_level": detail_level,
                "summary": f"Found {total_variants} variant(s) in {gene_name}{mode_context}. "
                           f"{pathogenic_count} are pathogenic or likely pathogenic."
            }

            if truncated:
                response["truncated"] = True
                response["message"] = f"Results limited to {max_variants} variants. Total: {total_variants}"

            # Add population distribution summary if available (full detail mode only)
            if population_summary and detail_level == "full":
                response["population_distribution"] = {}
                for pop, data in population_summary.items():
                    freqs = data["frequencies"]
                    non_zero_freqs = [f for f in freqs if f > 0]
                    response["population_distribution"][pop] = {
                        "total_variants": len(freqs),
                        "present_in_population": data["non_zero_count"],
                        "absent_in_population": data["zero_count"],
                        "average_frequency": sum(non_zero_freqs) / len(non_zero_freqs) if non_zero_freqs else 0,
                        "max_frequency": max(freqs) if freqs else 0
                    }

            return response

        else:
            tool_logger.info(f"No variants found in {gene_name}")

            # Check if gene is outside of analysis scope
            mode_message = ""
            if analysis_mode == "clinical":
                if not is_acmg_gene(gene_name):
                    mode_message = f" Note: {gene_name} is not in the ACMG SF v3.3 gene list and was not analyzed in clinical mode."

            return {
                "status": "success",
                "gene": gene_name,
                "analysis_mode": analysis_mode,
                "variant_count": 0,
                "message": f"No variants found in {gene_name} in this analysis.{mode_message}",
                "variants": []
            }

    except Exception as e:
        tool_logger.exception(f"Error querying variants for gene {gene_name}")
        return {
            "status": "error",
            "message": f"An error occurred while querying variants: {str(e)}"
        }


async def query_novel_alphamissense_candidates(
    tool_context: ToolContext,
    min_score: float = 0.564,
    max_results: int = 50
) -> Dict[str, Any]:
    """
    Find variants with high AlphaMissense scores that are NOT in ClinVar.
    These represent novel pathogenic candidates for research validation.

    Args:
        tool_context: The tool context containing state and artifacts
        min_score: Minimum AlphaMissense score threshold (default 0.564 = likely pathogenic)
        max_results: Maximum number of variants to return

    Returns:
        Dictionary containing novel AlphaMissense candidates
    """
    tool_logger = logger.bind(tool="query_novel_alphamissense_candidates")
    tool_logger.info(f"Searching for novel AM candidates with score >= {min_score}")

    annotations_artifact_name = tool_context.state.get('annotations_artifact_name')
    if not annotations_artifact_name:
        return {
            "status": "error",
            "message": "No annotations available. Please complete the analysis first."
        }

    try:
        # Load annotations
        annotations_artifact = await tool_context.load_artifact(filename=annotations_artifact_name)
        annotations_data = deserialize_data_from_artifact(annotations_artifact)
        annotations = annotations_data.get('annotations', {})
        analysis_mode = annotations_data.get('analysis_mode', 'unknown')

        novel_candidates = []

        for variant_id, ann in annotations.items():
            # In report_generation_service, we set source="AlphaMissense" ONLY if
            # it wasn't already in ClinVar. This is the perfect filter.
            if ann.source == "AlphaMissense":
                # Ensure we have a score and it meets the threshold
                score = ann.am_pathogenicity
                if score is not None and score >= min_score:
                    novel_candidates.append({
                        "variant_id": ann.variant_id,
                        "gene": ann.gene_symbol,
                        "am_pathogenicity": score,
                        "am_class": ann.am_class,
                        "clinical_significance": ann.clinical_significance,
                        "source": ann.source,
                        "condition": ann.condition
                    })

        # Sort by score descending (highest confidence first)
        novel_candidates.sort(key=lambda x: x.get('am_pathogenicity', 0), reverse=True)

        # Apply limit
        total_found = len(novel_candidates)
        truncated = False
        if len(novel_candidates) > max_results:
            novel_candidates = novel_candidates[:max_results]
            truncated = True

        tool_logger.info(f"Found {total_found} novel AM candidates, returning {len(novel_candidates)}")

        response = {
            "status": "success",
            "total_novel_candidates": total_found,
            "returned_count": len(novel_candidates),
            "min_score_threshold": min_score,
            "analysis_mode": analysis_mode,
            "variants": novel_candidates,
            "message": f"Found {total_found} novel AlphaMissense candidates (score >= {min_score}) not in ClinVar."
        }

        if truncated:
            response["truncated"] = True
            response["note"] = f"Results limited to top {max_results} by score. Use max_results parameter to see more."

        if total_found == 0:
            response["message"] = f"No novel AlphaMissense candidates found with score >= {min_score}. All pathogenic predictions may already be in ClinVar, or try lowering the min_score threshold."

        return response

    except Exception as e:
        tool_logger.exception("Error querying novel candidates")
        return {
            "status": "error",
            "message": f"Error: {str(e)}"
        }


# Tool instantiations with updated descriptions
set_mode_tool = FunctionTool(func=set_analysis_mode)
vcf_intake_tool = FunctionTool(func=load_and_parse_vcf)
vep_annotation_tool = LongRunningFunctionTool(func=start_vep_annotation)
vep_status_tool = FunctionTool(func=check_vep_status)
report_generation_tool = LongRunningFunctionTool(func=start_report_generation)
report_status_tool = FunctionTool(func=check_report_status)
query_gene_tool = FunctionTool(func=query_variant_by_gene)
novel_am_candidates_tool = FunctionTool(func=query_novel_alphamissense_candidates)
# DEPRECATED TOOLS (kept for backwards compatibility)
knowledge_retrieval_tool = FunctionTool(func=retrieve_knowledge)
clinical_assessment_tool = FunctionTool(func=perform_clinical_assessment)
