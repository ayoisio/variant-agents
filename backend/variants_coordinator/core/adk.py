"""
Centralized place to hold the ADK Runner singleton instance.
The instance is created and configured at application startup
in the `main.py` lifespan manager.
"""

runner = None
artifact_service = None
session_service = None