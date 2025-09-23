"""Google Cloud Storage client for VCF file access."""

import gzip
from google.cloud import storage
from google.cloud.exceptions import NotFound
import structlog

from ..core.config import settings
from ..core.exceptions import GCSAccessError

logger = structlog.get_logger(__name__)


class GCSClient:
    """Client for accessing VCF files in Google Cloud Storage."""

    def __init__(self):
        """Initialize GCS client."""
        self.client = None
        try:
            self.client = storage.Client()
            logger.info("GCS client initialized successfully")
        except Exception as e:
            logger.warning(f"Could not initialize GCS client: {e}. Check credentials.")
            if settings.demo_mode:
                logger.info("Demo mode is enabled, will use mock data as a fallback.")
            else:
                raise GCSAccessError("GCS client failed to initialize outside of demo mode.")

    def _parse_gcs_path(self, gcs_path: str) -> tuple[str, str]:
        """Parse GCS path into bucket and blob name."""
        if not gcs_path.startswith("gs://"):
            raise ValueError(f"Invalid GCS path format: {gcs_path}")
        path_parts = gcs_path[5:].split("/", 1)
        if len(path_parts) != 2:
            raise ValueError(f"Invalid GCS path format: {gcs_path}")
        return path_parts[0], path_parts[1]

    def read_vcf(self, gcs_path: str) -> str:
        """Read VCF file content from GCS, with decompression if needed."""
        logger.info(f"Attempting to read VCF from GCS", gcs_path=gcs_path)

        if not self.client:
            raise GCSAccessError("GCS client is not available.")

        try:
            bucket_name, blob_name = self._parse_gcs_path(gcs_path)
            bucket = self.client.bucket(bucket_name)
            blob = bucket.blob(blob_name)

            content_bytes = blob.download_as_bytes()
            logger.info(f"Successfully downloaded VCF file from GCS.", size_bytes=len(content_bytes))

            if gcs_path.endswith(".gz"):
                decompressed_content = gzip.decompress(content_bytes)
                return decompressed_content.decode('utf-8')
            else:
                return content_bytes.decode('utf-8')

        except NotFound:
            logger.error(f"File not found in GCS", gcs_path=gcs_path)
            raise GCSAccessError(f"File not found at GCS path: {gcs_path}")
        except Exception as e:
            logger.exception("Error reading VCF file from GCS.")
            raise GCSAccessError(f"An unexpected error occurred while reading from GCS: {e}")
