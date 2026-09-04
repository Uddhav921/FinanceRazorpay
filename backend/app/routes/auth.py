"""
routes/auth.py — Authentication endpoints for Google OAuth and Demo login.
"""

from __future__ import annotations
import logging
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.orm import User, ReconciliationRun, ExceptionTicket, NarrativeReportModel
from app.services.auth import (
    create_access_token,
    get_current_user,
    get_or_create_demo_user,
    verify_google_id_token,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


class GoogleLoginRequest(BaseModel):
    credential: str
    email: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: int
    email: str
    name: str
    avatar_url: Optional[str] = None
    role: str
    stats: Optional[dict] = None


@router.get("/config", summary="Get public authentication client configuration")
def get_auth_config():
    import os
    from dotenv import load_dotenv
    load_dotenv()
    client_id = (
        os.getenv("GOOGLE_CLIENT_ID", "")
        or os.getenv("VITE_GOOGLE_CLIENT_ID", "")
    ).strip()
    return {
        "google_client_id": client_id
    }


@router.post("/google", summary="Login or Register via Google OAuth ID token")
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    """
    Validates Google token (or provided profile for dev testing),
    creates/updates the user, and returns a signed JWT.
    """
    user_info = None

    # Try verifying with Google first
    if payload.credential and not payload.credential.startswith("demo_"):
        try:
            user_info = verify_google_id_token(payload.credential)
        except Exception as exc:
            logger.warning("Google verify failed, checking fallback payload: %s", exc)

    # Fallback to payload data if provided (allows mock / instant testing)
    if not user_info:
        if payload.email:
            user_info = {
                "google_id": f"g_{payload.email}",
                "email": payload.email,
                "name": payload.name or payload.email.split("@")[0],
                "avatar_url": payload.avatar_url,
            }
        else:
            # Fallback to demo user
            user = get_or_create_demo_user(db)
            token = create_access_token(user.id, user.email, user.name)
            return {
                "token": token,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "name": user.name,
                    "avatar_url": user.avatar_url,
                    "role": user.role,
                },
            }

    # Upsert user by email
    user = db.query(User).filter(User.email == user_info["email"]).first()
    if not user:
        user = User(
            email=user_info["email"],
            name=user_info["name"],
            avatar_url=user_info.get("avatar_url"),
            google_id=user_info.get("google_id"),
            role="Finance Controller",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("New user registered via Google: %s", user.email)
    else:
        # Update details if changed
        if user_info.get("avatar_url"):
            user.avatar_url = user_info["avatar_url"]
        if user_info.get("name") and user.name != user_info["name"]:
            user.name = user_info["name"]
        db.commit()
        db.refresh(user)

    token = create_access_token(user.id, user.email, user.name)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "role": user.role,
        },
    }


@router.post("/demo", summary="1-Click Demo Login as Finance Controller")
def demo_login(db: Session = Depends(get_db)):
    """Logs in as the demo controller user for instant testing without OAuth config."""
    user = get_or_create_demo_user(db)
    token = create_access_token(user.id, user.email, user.name)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "avatar_url": user.avatar_url,
            "role": user.role,
        },
    }


@router.get("/me", summary="Get profile and stats of current logged-in user")
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns profile and user-specific summary statistics."""
    total_runs = db.query(ReconciliationRun).filter(ReconciliationRun.user_id == current_user.id).count()
    total_reports = db.query(NarrativeReportModel).filter(NarrativeReportModel.user_id == current_user.id).count()
    open_tickets = db.query(ExceptionTicket).filter(
        ExceptionTicket.user_id == current_user.id,
        ExceptionTicket.status != "RESOLVED",
    ).count()

    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
        "role": current_user.role,
        "created_at": str(current_user.created_at),
        "stats": {
            "total_runs": total_runs,
            "total_reports": total_reports,
            "open_exceptions": open_tickets,
        },
    }


@router.post("/logout", summary="Logout current user")
def logout():
    return {"status": "ok", "message": "Successfully logged out."}
