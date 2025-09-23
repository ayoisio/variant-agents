"""
Authentication-specific routes.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any
from pydantic import BaseModel

from ..core.auth import get_current_user, verify_firebase_token

router = APIRouter()


class TokenVerifyRequest(BaseModel):
    token: str


@router.post("/auth/verify")
async def verify_token(request: TokenVerifyRequest):
    """
    Verify a Firebase ID token and return user information.
    Useful for frontend token validation.
    """
    try:
        decoded_token = verify_firebase_token(f"Bearer {request.token}")
        return {
            "status": "success",
            "valid": True,
            "user": {
                "uid": decoded_token.get("uid"),
                "email": decoded_token.get("email"),
                "email_verified": decoded_token.get("email_verified", False),
                "name": decoded_token.get("name"),
            }
        }
    except HTTPException as e:
        return {
            "status": "error",
            "valid": False,
            "message": e.detail
        }
    except Exception as e:
        return {
            "status": "error",
            "valid": False,
            "message": str(e)
        }


@router.get("/auth/me")
async def get_current_user_info(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get current authenticated user information.
    Requires valid authentication token.
    """
    return {
        "status": "success",
        "user": {
            "uid": current_user.get("uid"),
            "email": current_user.get("email"),
            "email_verified": current_user.get("email_verified", False),
            "name": current_user.get("name"),
            "firebase_uid": current_user.get("uid"),
        }
    }
