"""Application configuration."""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings."""

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8080
    log_level: str = "INFO"

    # Google Cloud Configuration
    google_application_credentials: Optional[str] = None
    gcp_project_id: Optional[str] = "variant-intake-agents"
    shared_vcf_bucket: str = "gs://brain-genomics"
    demo_mode: bool = False

    # Cloud Tasks & Worker Configuration
    tasks_queue_location: str = "us-central1"
    tasks_queue_name: str = "background"
    worker_url: str = ""

    # API Configuration
    clinvar_api_key: Optional[str] = None
    gnomad_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None

    # Agent Configuration
    max_variants_per_batch: int = 1000
    enable_caching: bool = True

    # External API URLs
    clinvar_api_url: str = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    gnomad_api_url: str = "https://gnomad.broadinstitute.org/api"

    # VertexAI Configuration for Session Persistence
    agent_engine_id: Optional[str] = None
    vertex_ai_location: str = "us-central1"
    use_vertex_ai_sessions: bool = False  # Set to True when agent_engine_id is configured

    # Firebase Configuration
    firebase_project_id: Optional[str] = None  # Defaults to gcp_project_id if not set

    @property
    def effective_firebase_project_id(self) -> str:
        """Returns Firebase project ID, defaulting to GCP project ID."""
        return self.firebase_project_id or self.gcp_project_id

    @property
    def effective_vertex_ai_project(self) -> str:
        """Returns VertexAI project ID, defaulting to GCP project ID."""
        return self.gcp_project_id

    @property
    def should_use_vertex_ai(self) -> bool:
        """Determines if VertexAI should be used based on configuration."""
        return bool(self.agent_engine_id and self.use_vertex_ai_sessions)

    class Config:
        # Pydantic-settings will automatically look for a .env file
        # in the directory where the application is run.
        env_file = ".env"
        case_sensitive = False


# Create a global settings instance for easy access across the application
settings = Settings()
