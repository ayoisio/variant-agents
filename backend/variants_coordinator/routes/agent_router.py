"""
API routes for interacting with the ADK agent.
"""
import uuid
import re
from typing import Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from google.genai.types import Content, Part
from google.adk.events import Event, EventActions

from ..core import adk, clients
from ..core.auth import get_current_user, map_firebase_to_adk_user
from ..utils.sse_enhancer import SSEEventEnhancer
from ..services.session_metadata_service import SessionMetadataService

from ..models.visualization import VisualizationType
from ..models.variant import deserialize_data_from_artifact
from ..services.chart_data_service import ChartDataService

router = APIRouter()


class RunRequest(BaseModel):
    session_id: Optional[str] = None
    input_text: str
    analysis_mode: Optional[str] = None


async def event_stream_generator(event_stream, session_id: str, user_id: str, firebase_uid: str):
    """Enhanced generator that yields enriched ADK events as server-sent events."""
    enhancer = SSEEventEnhancer(session_id, user_id, firebase_uid)

    async for event in event_stream:
        # Enhance the event with metadata
        enhanced_event = await enhancer.enhance_event(event)

        # Yield as SSE format
        import json
        yield f"data: {json.dumps(enhanced_event)}\n\n"


@router.post("/run")
async def run_agent(
        request: RunRequest,
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Receives a user prompt and streams the ADK agent's events back.
    """
    if not adk.runner:
        raise RuntimeError("ADK Runner has not been initialized. Check application startup logs.")

    firebase_uid = current_user.get("uid")
    user_id = map_firebase_to_adk_user(firebase_uid)
    app_name = adk.runner.app_name

    # Validate analysis mode if provided
    if request.analysis_mode and request.analysis_mode not in ['clinical', 'research']:
        raise HTTPException(
            status_code=400,
            detail="Invalid analysis_mode. Must be 'clinical' or 'research'"
        )

    # For new sessions, we need to create first
    if not request.session_id or not request.session_id.strip():
        # Create a new session - VertexAI will generate the ID
        session = await adk.runner.session_service.create_session(
            app_name=app_name,
            user_id=user_id
        )
        session_id = session.id  # Get the generated ID
        is_new_session = True
    else:
        # Try to get existing session
        session_id = request.session_id
        try:
            session = await adk.runner.session_service.get_session(
                app_name=app_name,
                user_id=user_id,
                session_id=session_id
            )
            is_new_session = False
        except:
            # Session doesn't exist, create it with this ID
            session = await adk.runner.session_service.create_session(
                app_name=app_name,
                user_id=user_id,
            )
            is_new_session = True
            session_id = session.id

    if is_new_session:
        # Create initial state event with user context
        initial_state_delta = {
            'session:id': session.id,
            'session:user_id': user_id,
            'session:app_name': app_name,
            'user:firebase_uid': firebase_uid,
            'user:email': current_user.get('email', ''),
            'user:display_name': current_user.get('name', ''),
            # Analysis preferences (user-scoped)
            'user:preferred_output_format': 'detailed',
            'user:notification_enabled': True,
        }

        # Add analysis mode to initial state if provided
        if request.analysis_mode:
            initial_state_delta['analysis_mode'] = request.analysis_mode

        # Create a simple event whose only job is to carry the state update
        setup_event = Event(
            author="system",
            invocation_id=str(uuid.uuid4()),
            actions=EventActions(state_delta=initial_state_delta)
        )
        await adk.runner.session_service.append_event(session=session, event=setup_event)

        # Create Firestore metadata for new session
        metadata_service = SessionMetadataService(clients.db)

        # Extract VCF path if present
        vcf_path = None
        if "gs://" in request.input_text:
            vcf_match = re.search(r'(gs://[^\s]+\.vcf(?:\.gz)?)', request.input_text)
            if vcf_match:
                vcf_path = vcf_match.group(1)

        # Create metadata with analysis mode if provided
        metadata_kwargs = {
            "session_id": session.id,
            "firebase_uid": firebase_uid,
            "vcf_path": vcf_path
        }
        if request.analysis_mode:
            metadata_kwargs["analysis_mode"] = request.analysis_mode

        await metadata_service.create_metadata(**metadata_kwargs)

    else:
        # For existing sessions, update analysis mode if provided
        if request.analysis_mode:
            # Update state with new analysis mode
            mode_update_event = Event(
                author="system",
                invocation_id=str(uuid.uuid4()),
                actions=EventActions(state_delta={'analysis_mode': request.analysis_mode})
            )
            await adk.runner.session_service.append_event(session=session, event=mode_update_event)

            # Update metadata
            metadata_service = SessionMetadataService(clients.db)
            await metadata_service.update_metadata(
                session_id=session.id,
                analysis_mode=request.analysis_mode
            )

    user_message = Content(parts=[Part(text=request.input_text)], role="user")
    event_stream = adk.runner.run_async(
        user_id=user_id,
        session_id=session.id,
        new_message=user_message
    )

    return StreamingResponse(
        event_stream_generator(event_stream, session.id, user_id, firebase_uid),
        media_type="text/event-stream",
        headers={
            "X-Session-ID": session.id,
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.get("/sessions")
async def list_sessions(
        limit: int = Query(default=20, ge=1, le=100),
        offset: int = Query(default=0, ge=0),
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List all sessions for the authenticated user with metadata."""
    firebase_uid = current_user.get("uid")

    metadata_service = SessionMetadataService(clients.db)
    sessions = await metadata_service.list_user_sessions(
        firebase_uid=firebase_uid,
        limit=limit,
        offset=offset
    )

    return {
        "status": "success",
        "sessions": sessions,
        "count": len(sessions),
        "limit": limit,
        "offset": offset
    }


@router.get("/sessions/{session_id}")
async def get_session_details(
        session_id: str,
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get details for a specific session including metadata."""
    firebase_uid = current_user.get("uid")
    user_id = map_firebase_to_adk_user(firebase_uid)

    # Get metadata first (includes ownership check)
    metadata_service = SessionMetadataService(clients.db)
    metadata = await metadata_service.get_metadata(session_id)

    if not metadata or metadata.get("firebase_uid") != firebase_uid:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get ADK session for state info
    session = await adk.runner.session_service.get_session(
        app_name=adk.runner.app_name,
        user_id=user_id,
        session_id=session_id
    )

    # Include analysis mode in response
    response_data = {
        "status": "success",
        "session_id": session_id,
        "metadata": metadata,
        "state": dict(session.state) if session else {},
        "events_count": len(session.events) if session and session.events else 0
    }

    # Ensure analysis mode is visible
    if metadata:
        response_data["analysis_mode"] = metadata.get("analysis_mode", "clinical")

    return response_data


@router.get("/sessions/{session_id}/visualization/{chart_type}")
async def get_visualization_data(
        session_id: str,
        chart_type: str,
        dimension: Optional[str] = Query(None, description="Data dimension for the chart"),
        limit: Optional[int] = Query(None, ge=1, le=100, description="Limit number of data points"),
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get visualization data for a specific chart type.

    This endpoint provides direct access to chart data without going through the chat interface.
    Useful for refreshing charts or accessing visualizations programmatically.

    Args:
        session_id: Session identifier
        chart_type: Type of chart (bar, pie, histogram, heatmap, scatter)
        dimension: Data dimension (gene, chromosome, significance, etc.)
        limit: Maximum number of data points
        current_user: Authenticated user from dependency

    Returns:
        Chart data in a format ready for frontend visualization
    """
    firebase_uid = current_user.get("uid")
    user_id = map_firebase_to_adk_user(firebase_uid)

    # Verify session ownership via metadata
    metadata_service = SessionMetadataService(clients.db)
    metadata = await metadata_service.get_metadata(session_id)

    if not metadata or metadata.get("firebase_uid") != firebase_uid:
        raise HTTPException(status_code=404, detail="Session not found")

    # Validate chart type
    try:
        viz_type = VisualizationType(chart_type.upper())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid chart type: {chart_type}. Valid types: {[e.value for e in VisualizationType]}"
        )

    # Get the ADK session to access state and artifacts
    try:
        session = await adk.runner.session_service.get_session(
            app_name=adk.runner.app_name,
            user_id=user_id,
            session_id=session_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=f"Session not found in ADK store: {str(e)}"
        )

    # Check if annotations artifact exists in session state
    annotations_artifact_name = session.state.get('annotations_artifact_name') if session else None

    if not annotations_artifact_name:
        raise HTTPException(
            status_code=400,
            detail="Analysis not complete. Please wait for the report to finish generating before accessing visualizations."
        )

    try:
        # Load the annotations artifact
        annotations_artifact = await adk.artifact_service.load_artifact(
            app_name=adk.runner.app_name,
            user_id=user_id,
            session_id=session_id,
            filename=annotations_artifact_name
        )

        # Deserialize the data
        annotations_data = deserialize_data_from_artifact(annotations_artifact)

        # Extract components
        annotations = annotations_data.get('annotations', {})
        frequencies = annotations_data.get('frequencies', {})
        analysis_mode = annotations_data.get('analysis_mode', 'clinical')
        total_variants_analyzed = annotations_data.get('total_variants_analyzed', 0)

        # Initialize chart service
        chart_service = ChartDataService(
            annotations=annotations,
            frequencies=frequencies,
            analysis_mode=analysis_mode
        )

        # Generate chart data based on type and dimension
        chart_data = None

        if viz_type == VisualizationType.BAR:
            if dimension == "chromosome":
                chart_data = chart_service.get_chromosome_distribution(limit=limit)
            elif dimension == "gene":
                chart_data = chart_service.get_gene_distribution(limit=limit or 20)
            elif dimension == "impact":
                chart_data = chart_service.get_impact_distribution()
            elif dimension == "category" and analysis_mode == "clinical":
                chart_data = chart_service.get_acmg_category_distribution()
            else:
                # Default to gene distribution
                chart_data = chart_service.get_gene_distribution(limit=limit or 10)

        elif viz_type == VisualizationType.PIE:
            if dimension == "significance":
                chart_data = chart_service.get_significance_distribution()
            elif dimension == "category" and analysis_mode == "clinical":
                chart_data = chart_service.get_acmg_category_distribution()
            else:
                # Default to significance
                chart_data = chart_service.get_significance_distribution()

        elif viz_type == VisualizationType.HISTOGRAM:
            chart_data = chart_service.get_frequency_histogram()

        elif viz_type == VisualizationType.HEATMAP:
            chart_data = chart_service.get_population_heatmap(limit=limit or 50)

        elif viz_type == VisualizationType.SCATTER:
            chart_data = chart_service.get_frequency_vs_significance_scatter()

        if not chart_data:
            raise HTTPException(
                status_code=400,
                detail=f"Unable to generate {chart_type} chart for dimension {dimension}"
            )

        # Build response with metadata
        response = {
            "status": "success",
            "session_id": session_id,
            "chart_type": chart_type,
            "dimension": dimension,
            "analysis_mode": analysis_mode,
            "data": chart_data,
            "metadata": {
                "total_annotations": len(annotations),
                "total_variants_analyzed": total_variants_analyzed,
                "data_points": len(chart_data) if isinstance(chart_data, list) else 1,
                "generated_at": metadata.get("updated_at")
            }
        }

        # Add mode-specific context
        if analysis_mode == "clinical":
            response["metadata"]["context"] = "ACMG Secondary Findings (84 genes)"
        else:
            response["metadata"]["context"] = "Comprehensive genome-wide analysis"

        return response

    except HTTPException:
        raise
    except Exception as e:
        import structlog
        logger = structlog.get_logger(__name__)
        logger.exception(f"Error generating visualization: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate visualization: {str(e)}"
        )


@router.delete("/sessions/{session_id}")
async def delete_session(
        session_id: str,
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Delete a session and its metadata."""
    firebase_uid = current_user.get("uid")
    user_id = map_firebase_to_adk_user(firebase_uid)

    # Verify ownership via metadata
    metadata_service = SessionMetadataService(clients.db)
    metadata = await metadata_service.get_metadata(session_id)

    if not metadata or metadata.get("firebase_uid") != firebase_uid:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete from both stores
    try:
        await adk.runner.session_service.delete_session(
            app_name=adk.runner.app_name,
            user_id=user_id,
            session_id=session_id
        )
    except Exception as e:
        # Log but continue - session might not exist in ADK store
        import structlog
        logger = structlog.get_logger(__name__)
        logger.warning("Failed to delete ADK session", session_id=session_id, error=str(e))

    await metadata_service.delete_metadata(session_id)

    return {
        "status": "success",
        "message": f"Session {session_id} deleted successfully"
    }


@router.post("/sessions/{session_id}/resume")
async def resume_session(
        session_id: str,
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Resume an existing session."""
    firebase_uid = current_user.get("uid")
    user_id = map_firebase_to_adk_user(firebase_uid)

    # Verify ownership via metadata
    metadata_service = SessionMetadataService(clients.db)
    metadata = await metadata_service.get_metadata(session_id)

    if not metadata or metadata.get("firebase_uid") != firebase_uid:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify session exists in ADK
    session = await adk.runner.session_service.get_session(
        app_name=adk.runner.app_name,
        user_id=user_id,
        session_id=session_id
    )

    if not session:
        raise HTTPException(status_code=404, detail="Session not found in ADK store")

    # Update metadata to mark as active
    await metadata_service.update_metadata(
        session_id=session_id,
        status="active"
    )

    return {
        "status": "success",
        "session_id": session_id,
        "metadata": metadata,
        "state": dict(session.state),
        "events_count": len(session.events) if session.events else 0,
        "analysis_mode": metadata.get("analysis_mode", "clinical"),
        "message": "Session resumed successfully. You can now send messages to this session."
    }


@router.get("/sessions/{session_id}/events")
async def get_session_events(
        session_id: str,
        limit: int = Query(default=50, ge=1, le=200),
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get the event history for a specific session."""
    firebase_uid = current_user.get("uid")
    user_id = map_firebase_to_adk_user(firebase_uid)

    # Verify ownership via metadata
    metadata_service = SessionMetadataService(clients.db)
    metadata = await metadata_service.get_metadata(session_id)

    if not metadata or metadata.get("firebase_uid") != firebase_uid:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get ADK session for events
    session = await adk.runner.session_service.get_session(
        app_name=adk.runner.app_name,
        user_id=user_id,
        session_id=session_id
    )

    if not session:
        return {
            "status": "success",
            "session_id": session_id,
            "events": [],
            "total_count": 0
        }

    # Get latest events (most recent first)
    events = session.events if session.events else []
    total_count = len(events)

    # Convert events to serializable format and limit
    serializable_events = []
    for event in events[-limit:]:  # Get last N events
        event_dict = {
            "id": event.id,
            "author": event.author,
            "timestamp": event.timestamp,
            "invocation_id": event.invocation_id,
        }

        # Add content if present
        if event.content and event.content.parts:
            for part in event.content.parts:
                if part.text:
                    event_dict["text"] = part.text
                    break

        # Add relevant actions if present
        if event.actions:
            if event.actions.state_delta:
                event_dict["state_changes"] = dict(event.actions.state_delta)
            if event.actions.transfer_to_agent:
                event_dict["transfer_to"] = event.actions.transfer_to_agent

        serializable_events.append(event_dict)

    # Reverse to show oldest first
    serializable_events.reverse()

    return {
        "status": "success",
        "session_id": session_id,
        "events": serializable_events,
        "total_count": total_count,
        "returned_count": len(serializable_events),
        "analysis_mode": metadata.get("analysis_mode", "clinical")
    }


@router.post("/sessions/{session_id}/update")
async def update_session_metadata(
        session_id: str,
        updates: Dict[str, Any],
        current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update session metadata (title, notes, analysis_mode, etc)."""
    firebase_uid = current_user.get("uid")

    # Verify ownership
    metadata_service = SessionMetadataService(clients.db)
    metadata = await metadata_service.get_metadata(session_id)

    if not metadata or metadata.get("firebase_uid") != firebase_uid:
        raise HTTPException(status_code=404, detail="Session not found")

    # Allow specific fields to be updated including analysis_mode
    allowed_fields = {"title", "notes", "tags", "analysis_mode"}
    filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

    # Validate analysis_mode if being updated
    if "analysis_mode" in filtered_updates:
        if filtered_updates["analysis_mode"] not in ['clinical', 'research']:
            raise HTTPException(
                status_code=400,
                detail="Invalid analysis_mode. Must be 'clinical' or 'research'"
            )

        # Also update in ADK session state if mode is being changed
        user_id = map_firebase_to_adk_user(firebase_uid)
        session = await adk.runner.session_service.get_session(
            app_name=adk.runner.app_name,
            user_id=user_id,
            session_id=session_id
        )

        if session:
            mode_update_event = Event(
                author="system",
                invocation_id=str(uuid.uuid4()),
                actions=EventActions(state_delta={'analysis_mode': filtered_updates["analysis_mode"]})
            )
            await adk.runner.session_service.append_event(session=session, event=mode_update_event)

    if filtered_updates:
        await metadata_service.update_metadata(session_id, **filtered_updates)

    return {
        "status": "success",
        "session_id": session_id,
        "updated_fields": list(filtered_updates.keys())
    }
