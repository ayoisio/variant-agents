"""
Defines the FastAPI worker endpoints that are triggered by Cloud Tasks
to execute long-running background jobs like VEP annotation and report generation.
"""
import structlog
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from ..core import adk
from ..services.vep_runner import VepRunnerService
from ..services.report_generation_service import ReportGenerationService
from ..core import clients

logger = structlog.get_logger(__name__)
router = APIRouter()


class VepTaskRequest(BaseModel):
    """The request body sent by Cloud Tasks to trigger a VEP job."""
    task_id: str


class ReportTaskRequest(BaseModel):
    """The request body sent by Cloud Tasks to trigger report generation."""
    task_id: str


@router.post("/worker/run-vep", status_code=202)
async def run_vep_task(request: VepTaskRequest, background_tasks: BackgroundTasks):
    """
    This endpoint is called by Google Cloud Tasks to start a VEP annotation job.

    The VEP annotation process:
    1. Loads parsed variants from artifact storage
    2. Runs VEP annotation (60-70 minutes for ~7.8M variants)
    3. Saves annotated variants back to artifact storage
    4. Updates task status in Firestore

    Args:
        request: Contains the task_id for tracking in Firestore
        background_tasks: FastAPI's background task handler

    Returns:
        Status message indicating task acceptance
    """
    task_logger = logger.bind(task_id=request.task_id)
    task_logger.info("Worker received request to run VEP task.")

    # Get the live, initialized client from the main thread
    db_client = clients.db

    if not db_client:
        task_logger.error("Firestore client not initialized in main thread")
        return {"status": "error", "message": "Database client not available"}

    # Pass the live client to the VepRunnerService
    vep_runner = VepRunnerService(
        db_client=db_client,
        artifact_service=adk.artifact_service
    )

    background_tasks.add_task(
        vep_runner.run,
        task_id=request.task_id,
    )

    return {"status": "task accepted", "message": f"VEP task {request.task_id} accepted for processing"}


@router.post("/worker/generate-report", status_code=202)
async def run_report_generation(
    request: ReportTaskRequest,
    background_tasks: BackgroundTasks
):
    """
    This endpoint is called by Google Cloud Tasks to generate the final clinical report.

    The report generation process:
    1. Loads VEP-annotated variants from artifact storage
    2. Retrieves ClinVar and gnomAD annotations (2-3 minutes)
    3. Performs ACMG classification for unannotated variants
    4. Generates clinical assessment using LLM
    5. Saves annotations artifact and report data
    6. Updates task status in Firestore

    Args:
        request: Contains the task_id for tracking in Firestore
        background_tasks: FastAPI's background task handler

    Returns:
        Status message indicating task acceptance
    """
    task_logger = logger.bind(task_id=request.task_id)
    task_logger.info("Worker received request to generate report")

    # Get the live, initialized clients from the main thread
    db_client = clients.db
    artifact_service = adk.artifact_service

    if not db_client:
        task_logger.error("Firestore client not initialized")
        return {"status": "error", "message": "Database client not available"}

    if not artifact_service:
        task_logger.error("Artifact service not initialized")
        return {"status": "error", "message": "Artifact service not available"}

    report_service = ReportGenerationService(
        db_client=db_client,
        artifact_service=artifact_service
    )

    background_tasks.add_task(
        report_service.run,
        task_id=request.task_id
    )

    return {
        "status": "task accepted",
        "message": f"Report generation task {request.task_id} accepted for processing"
    }


@router.get("/worker/health")
async def worker_health():
    """
    Health check endpoint for worker processes.

    Returns:
        Health status and service availability
    """
    return {
        "status": "healthy",
        "service": "genomic-worker",
        "capabilities": ["vep-annotation", "report-generation"],
        "firestore_available": clients.db is not None,
        "artifact_service_available": adk.artifact_service is not None
    }
