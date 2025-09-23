"""
SSE event enhancement utilities.
Adds metadata and progress information to ADK events.
"""
import time
from typing import Dict, Any, Optional
from google.adk.events import Event

from ..core import clients
from ..services.session_metadata_service import SessionMetadataService


class SSEEventEnhancer:
    """Enhances ADK events with additional metadata for UI consumption."""

    def __init__(self, session_id: str, user_id: str, firebase_uid: str):
        self.session_id = session_id
        self.user_id = user_id
        self.firebase_uid = firebase_uid
        self.metadata_service = SessionMetadataService(clients.db) if clients.db else None
        self._last_metadata_update = 0
        self._metadata_cache = None
        self._metadata_update_interval = 5  # Seconds between metadata refreshes

    async def enhance_event(self, event: Event) -> Dict[str, Any]:
        """
        Enhance an ADK event with additional metadata.
        Returns a dictionary with the original event and metadata.
        """
        enhanced: Dict[str, Any] = {
            "event": event.model_dump_json(),
            "metadata": {
                "session_id": self.session_id,
                "user_id": self.user_id,
                "firebase_uid": self.firebase_uid,
                "timestamp": time.time(),
                "session": None,  # Pre-declare the session field
                "event_type": None,  # Pre-declare event_type
                "progress": None  # Pre-declare progress
            }
        }

        # Add session metadata (with caching to avoid too many DB calls)
        session_metadata = await self._get_cached_metadata()
        if session_metadata:
            enhanced["metadata"]["session"] = {
                "status": session_metadata.get("status"),
                "vep_status": session_metadata.get("vep_status"),
                "vep_task_id": session_metadata.get("vep_task_id"),
                "variant_count": session_metadata.get("variant_count"),
                "pathogenic_count": session_metadata.get("pathogenic_count")
            }

        # Detect and flag specific event types for UI
        enhanced["metadata"]["event_type"] = self._classify_event(event)

        # Add progress information for VEP-related events
        if enhanced["metadata"]["event_type"] in ["vep_started", "vep_status_check"]:
            enhanced["metadata"]["progress"] = await self._get_vep_progress(event)

        return enhanced

    async def _get_cached_metadata(self) -> Optional[Dict[str, Any]]:
        """Get session metadata with caching."""
        if not self.metadata_service:
            return None

        current_time = time.time()
        if (not self._metadata_cache or
                current_time - self._last_metadata_update > self._metadata_update_interval):
            try:
                self._metadata_cache = await self.metadata_service.get_metadata(self.session_id)
                self._last_metadata_update = current_time
            except Exception:
                # Don't break the stream if metadata fetch fails
                pass

        return self._metadata_cache

    def _classify_event(self, event: Event) -> str:
        """Classify event type for UI handling."""
        # Check for VEP-related events
        if event.content and event.content.parts:
            for part in event.content.parts:
                if hasattr(part, 'function_call') and part.function_call:
                    if part.function_call.name == "start_vep_annotation":
                        return "vep_started"
                    elif part.function_call.name == "check_vep_status":
                        return "vep_status_check"
                elif hasattr(part, 'function_response') and part.function_response:
                    if part.function_response.name == "start_vep_annotation":
                        return "vep_start_response"
                    elif part.function_response.name == "check_vep_status":
                        return "vep_status_response"
                    elif part.function_response.name == "perform_clinical_assessment":
                        return "clinical_assessment_complete"

        # Check for final responses
        if event.is_final_response():
            return "final_response"

        # Check for streaming text
        if event.partial:
            return "streaming_text"

        # Check for state updates
        if event.actions and event.actions.state_delta:
            return "state_update"

        return "general"

    async def _get_vep_progress(self, event: Event) -> Optional[Dict[str, Any]]:
        """Get VEP progress information."""
        if not event.actions or not event.actions.state_delta:
            return None

        vep_task_id = event.actions.state_delta.get("vep_task_id")
        if not vep_task_id and self._metadata_cache:
            vep_task_id = self._metadata_cache.get("vep_task_id")

        if not vep_task_id or not clients.db:
            return None

        try:
            # Check VEP task status
            doc_ref = clients.db.collection("background_tasks").document(vep_task_id)
            doc = await doc_ref.get()

            if doc.exists:
                task_data = doc.to_dict()
                status = task_data.get("status", "unknown")

                # Estimate progress based on typical timing
                created_at = task_data.get("createdAt")
                if created_at and status == "running":
                    elapsed = time.time() - created_at.timestamp()
                    # Assume ~60 minutes typical duration
                    estimated_progress = min(95, int((elapsed / 3600) * 100))
                else:
                    estimated_progress = 0 if status == "pending" else 100

                return {
                    "status": status,
                    "estimated_progress": estimated_progress,
                    "message": self._get_progress_message(status, estimated_progress)
                }
        except Exception:
            # Don't break the stream if progress check fails
            pass

        return None

    def _get_progress_message(self, status: str, progress: int) -> str:
        """Generate user-friendly progress message."""
        if status == "pending":
            return "VEP annotation queued, will start soon..."
        elif status == "running":
            if progress < 30:
                return f"VEP annotation started ({progress}% complete)"
            elif progress < 60:
                return f"Processing variants ({progress}% complete)"
            elif progress < 90:
                return f"Finalizing annotations ({progress}% complete)"
            else:
                return "VEP annotation nearly complete..."
        elif status == "completed":
            return "VEP annotation completed successfully"
        elif status == "failed":
            return "VEP annotation failed - please retry"
        else:
            return "Processing..."
