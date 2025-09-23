"""
Handles the explicit initialization of shared application resources,
such as Google Cloud clients and the ADK Runner.
"""
import structlog
from google.cloud import tasks_v2
from google.adk.runners import Runner
from google.adk.artifacts import GcsArtifactService
from google.adk.sessions import InMemorySessionService
from google import genai

from .config import settings
from . import clients, adk
from .auth import initialize_firebase_and_clients
from ..agent import root_agent

logger = structlog.get_logger(__name__)


def initialize_clients_and_runner():
    """
    Initializes shared clients and the ADK Runner, assigning them to
    their respective global instances. This should be called once at startup.
    """
    try:
        # 1. Initialize firebase and clients
        initialize_firebase_and_clients()

        # 2. Initialize the remaining Google Cloud clients
        clients.tasks_client = tasks_v2.CloudTasksClient()
        logger.info("Successfully initialized Cloud Tasks client.")

        # 3. Initialize the Gemini client
        if settings.gemini_api_key:
            clients.genai_client = genai.Client(api_key=settings.gemini_api_key, vertexai=False)
            logger.info("Successfully initialized Gemini API client.")
        else:
            logger.warning("GEMINI_API_KEY not found in settings. Gemini-based tools may fail.")

        # 4. Initialize ADK services
        # Initialize artifact service (always uses GCS)
        adk.artifact_service = GcsArtifactService(
            bucket_name=settings.shared_vcf_bucket.replace("gs://", "")
        )
        logger.info(f"Initialized GCS artifact service with bucket: {settings.shared_vcf_bucket}")

        # Initialize session service based on configuration
        logger.info(f"AGENT_ENGINE_ID: {settings.agent_engine_id}")
        logger.info(f"USE_VERTEX_AI_SESSIONS: {settings.use_vertex_ai_sessions}")
        logger.info(f"should_use_vertex_ai: {settings.should_use_vertex_ai}")

        if settings.should_use_vertex_ai:
            try:
                from google.adk.sessions import VertexAiSessionService
                adk.session_service = VertexAiSessionService(
                    project=settings.gcp_project_id,
                    location=settings.vertex_ai_location,
                    agent_engine_id=settings.agent_engine_id
                )
                logger.info(f"Using VertexAI SessionService for persistence (project: {settings.gcp_project_id})")
            except Exception as e:
                logger.error(f"Failed to initialize VertexAI SessionService: {e}")
                logger.warning("Falling back to InMemorySessionService")
                adk.session_service = InMemorySessionService()
        else:
            logger.info("Using InMemorySessionService (data will not persist)")
            adk.session_service = InMemorySessionService()

        # 5. Initialize the ADK Runner
        adk.runner = Runner(
            agent=root_agent,
            app_name="genomic-variant-agent",
            session_service=adk.session_service,
            artifact_service=adk.artifact_service
        )
        logger.info("Successfully initialized ADK Runner.")

    except Exception as e:
        logger.error(
            "FATAL: Failed during application initialization.",
            error=str(e),
            hint="Check GCP_PROJECT_ID, authentication, and service permissions."
        )
        clients.db = None
        clients.tasks_client = None
        clients.genai_client = None
        adk.runner = None
        adk.artifact_service = None
        adk.session_service = None
        raise
