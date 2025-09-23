"""
Handles all Firebase Admin SDK initialization, authentication, and
provides the shared Firestore client instance.
"""
import structlog
from typing import Dict, Any

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from ..core import clients

logger = structlog.get_logger(__name__)

# Singleton Firebase Initialization
_firebase_app = None


def initialize_firebase_and_clients():
    """
    Initializes the Firebase Admin SDK and populates the shared Firestore client.
    This function is designed to be called once at application startup.
    """
    global _firebase_app
    if _firebase_app:
        return

    try:
        # Using Application Default Credentials (ADC) 
        cred = credentials.ApplicationDefault()
        _firebase_app = firebase_admin.initialize_app(cred)

        # Get the AsyncClient
        from firebase_admin import firestore
        clients.db = firestore.AsyncClient()

        logger.info("Firebase Admin SDK initialized successfully with AsyncClient.")
    except Exception as e:
        logger.error("FATAL: Failed to initialize Firebase Admin SDK.", error=str(e))
        raise RuntimeError("Could not initialize Firebase Admin SDK") from e


# FastAPI Security and Dependencies
security = HTTPBearer()


def verify_firebase_token(authorization: str) -> Dict[str, Any]:
    """
    Verify Firebase ID token from Authorization header.

    Args:
        authorization: Bearer token from Authorization header

    Returns:
        Decoded token dict with user info

    Raises:
        HTTPException: If token is invalid or email domain not allowed
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header"
        )

    token = authorization.split("Bearer ")[1]

    try:
        decoded_token = auth.verify_id_token(token)

        email = decoded_token.get("email", "")
        if email:
            # Extract domain from email
            domain = email.lower().split('@')[-1]
            # Check if it's google.com/altostrat.com or a subdomain of these
            if not (domain == 'google.com' or
                    domain == 'altostrat.com' or
                    domain.endswith('.google.com') or
                    domain.endswith('.altostrat.com')):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access restricted to @google.com and @altostrat.com email addresses"
                )

        logger.debug("Token verified successfully", uid=decoded_token.get("uid"))
        return decoded_token
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.warning("Firebase token verification failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}"
        )


async def get_current_user(
        creds: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """
    FastAPI dependency to verify the Firebase ID token and return the decoded user claims.
    """
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Use the verify_firebase_token function
    return verify_firebase_token(f"Bearer {creds.credentials}")


def map_firebase_to_adk_user(firebase_uid: str) -> str:
    """
    Maps a Firebase UID to the ADK user_id format.
    """
    return f"firebase_{firebase_uid}"
