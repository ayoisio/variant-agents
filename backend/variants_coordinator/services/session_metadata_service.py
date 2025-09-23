"""Session metadata management service using Firestore."""

import structlog
from datetime import datetime
from typing import Dict, List, Optional, Any
from google.cloud import firestore

logger = structlog.get_logger(__name__)


class SessionMetadataService:
    """
    Manages user-facing session metadata in Firestore.
    Complements ADK SessionService by storing display/query metadata.
    """

    def __init__(self, db_client):
        self.db = db_client
        self.collection = "user_sessions"

    async def create_metadata(
            self,
            session_id: str,
            firebase_uid: str,
            vcf_path: Optional[str] = None,
            title: Optional[str] = None,
            analysis_mode: str = "clinical"
    ) -> Dict[str, Any]:
        """Create metadata record for a new session."""
        doc_ref = self.db.collection(self.collection).document(session_id)

        metadata = {
            "session_id": session_id,
            "firebase_uid": firebase_uid,
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "status": "active",
            "vcf_path": vcf_path,
            "vep_task_id": None,
            "vep_status": None,
            "report_task_id": None,
            "report_status": None,
            "analysis_mode": analysis_mode,
            "title": title or f"Analysis {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            "summary": None,
            "variant_count": None,
            "pathogenic_count": None,
            "annotations_count": None,
            "error_message": None,
            "notes": None,
            "tags": []
        }

        await doc_ref.set(metadata)
        logger.info("Created session metadata", session_id=session_id, analysis_mode=analysis_mode)
        return metadata

    async def update_metadata(
            self,
            session_id: str,
            **updates
    ) -> None:
        """Update specific fields in session metadata."""
        doc_ref = self.db.collection(self.collection).document(session_id)
        updates["updated_at"] = firestore.SERVER_TIMESTAMP

        # Log if analysis mode is being updated
        if "analysis_mode" in updates:
            logger.info(
                "Updating analysis mode for session",
                session_id=session_id,
                new_mode=updates["analysis_mode"]
            )

        await doc_ref.update(updates)
        logger.debug("Updated session metadata", session_id=session_id, fields=list(updates.keys()))

    async def get_metadata(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get metadata for a specific session."""
        doc_ref = self.db.collection(self.collection).document(session_id)
        doc = await doc_ref.get()

        if doc.exists:
            metadata = doc.to_dict()
            # Ensure analysis_mode is present (for backwards compatibility)
            if "analysis_mode" not in metadata:
                metadata["analysis_mode"] = "clinical"
            return metadata

        return None

    async def list_user_sessions(
            self,
            firebase_uid: str,
            limit: int = 20,
            offset: int = 0
    ) -> List[Dict[str, Any]]:
        """List sessions for a user, ordered by creation date."""
        query = (
            self.db.collection(self.collection)
            .where("firebase_uid", "==", firebase_uid)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .offset(offset)
        )

        docs = query.stream()
        sessions = []
        async for doc in docs:
            session_data = doc.to_dict()

            # Ensure analysis_mode is present for backwards compatibility
            if "analysis_mode" not in session_data:
                session_data["analysis_mode"] = "clinical"

            # Include key fields in listing for better UI display
            session_summary = {
                "session_id": session_data.get("session_id"),
                "title": session_data.get("title"),
                "created_at": session_data.get("created_at"),
                "updated_at": session_data.get("updated_at"),
                "status": session_data.get("status"),
                "analysis_mode": session_data.get("analysis_mode", "clinical"),
                "vcf_path": session_data.get("vcf_path"),
                "variant_count": session_data.get("variant_count"),
                "pathogenic_count": session_data.get("pathogenic_count"),
                "vep_status": session_data.get("vep_status"),
                "report_status": session_data.get("report_status"),
                "summary": session_data.get("summary"),
                "tags": session_data.get("tags", [])
            }
            sessions.append(session_summary)

        return sessions

    async def delete_metadata(self, session_id: str) -> None:
        """Delete session metadata."""
        doc_ref = self.db.collection(self.collection).document(session_id)
        await doc_ref.delete()
        logger.info("Deleted session metadata", session_id=session_id)

    async def get_sessions_by_mode(
            self,
            firebase_uid: str,
            analysis_mode: str,
            limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Get sessions filtered by analysis mode."""
        query = (
            self.db.collection(self.collection)
            .where("firebase_uid", "==", firebase_uid)
            .where("analysis_mode", "==", analysis_mode)
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(limit)
        )

        docs = query.stream()
        sessions = []
        async for doc in docs:
            sessions.append(doc.to_dict())

        logger.info(
            f"Retrieved {len(sessions)} {analysis_mode} mode sessions for user",
            firebase_uid=firebase_uid
        )
        return sessions

    async def update_analysis_stats(
            self,
            session_id: str,
            mode_stats: Dict[str, Any]
    ) -> None:
        """Update session with mode-specific analysis statistics."""
        updates = {
            "updated_at": firestore.SERVER_TIMESTAMP
        }

        # Add mode-specific stats
        if "acmg_genes_analyzed" in mode_stats:
            updates["acmg_genes_analyzed"] = mode_stats["acmg_genes_analyzed"]
        if "total_variants_analyzed" in mode_stats:
            updates["total_variants_analyzed"] = mode_stats["total_variants_analyzed"]

        doc_ref = self.db.collection(self.collection).document(session_id)
        await doc_ref.update(updates)

        logger.info(
            "Updated session with analysis statistics",
            session_id=session_id,
            stats=list(mode_stats.keys())
        )

    async def get_session_summary_stats(
            self,
            firebase_uid: str
    ) -> Dict[str, Any]:
        """Get summary statistics for all user sessions."""
        query = self.db.collection(self.collection).where("firebase_uid", "==", firebase_uid)

        docs = query.stream()

        stats = {
            "total_sessions": 0,
            "clinical_sessions": 0,
            "research_sessions": 0,
            "completed_sessions": 0,
            "failed_sessions": 0,
            "total_variants_analyzed": 0,
            "total_pathogenic_found": 0
        }

        async for doc in docs:
            data = doc.to_dict()
            stats["total_sessions"] += 1

            # Count by mode
            mode = data.get("analysis_mode", "clinical")
            if mode == "clinical":
                stats["clinical_sessions"] += 1
            else:
                stats["research_sessions"] += 1

            # Count by status
            if data.get("status") == "completed":
                stats["completed_sessions"] += 1
            elif data.get("status") == "error":
                stats["failed_sessions"] += 1

            # Accumulate variant counts
            if data.get("variant_count"):
                stats["total_variants_analyzed"] += data["variant_count"]
            if data.get("pathogenic_count"):
                stats["total_pathogenic_found"] += data["pathogenic_count"]

        return stats
