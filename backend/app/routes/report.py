"""
routes/report.py — AI Narrative Report endpoint: Step 8

POST /report/generate
  → Takes latest reconciliation run
  → Runs anomaly detection (Step 7)
  → Calls Gemini API (Step 8)
  → Returns NarrativeReport (Markdown + sections)

GET /report/latest
  → Returns cached narrative from last generate call
"""

from __future__ import annotations
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.orm import NarrativeReportModel, User
from app.services.auth import get_current_user
from app.services.recon_state import get_latest_report as get_latest_recon_report, get_latest_run_id
from app.services.anomaly import run_anomaly_detection
from app.services.llm import NarrativeReport, generate_narrative

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/report", tags=["AI Report"])

_user_narratives: Dict[int, NarrativeReport] = {}
_latest_narrative: Optional[NarrativeReport] = None


@router.post(
    "/generate",
    summary="Generate AI narrative report (Steps 7 + 8)",
    description=(
        "Runs anomaly detection on the latest reconciliation, then calls Gemini "
        "to produce a full Markdown narrative report: executive summary, exception "
        "analysis, root cause hypotheses, suggested next steps, and management summary."
    ),
)
def generate_report(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    global _latest_narrative

    report = get_latest_recon_report(user_id=current_user.id)
    if report is None:
        raise HTTPException(
            status_code=400,
            detail="No reconciliation run found. Please upload files and run 3-way reconciliation first.",
        )

    # Step 7: anomaly detection
    logger.info("Running anomaly detection for narrative report for user %d...", current_user.id)
    anomaly_report = run_anomaly_detection(report)

    # Step 8: Gemini LLM narrative
    logger.info("Calling Gemini API for narrative generation...")
    try:
        narrative = generate_narrative(report, anomaly_report)
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}")

    _latest_narrative = narrative
    _user_narratives[current_user.id] = narrative

    # Persist report to DB
    try:
        run_id = get_latest_run_id(user_id=current_user.id)
        db_rep = NarrativeReportModel(
            user_id=current_user.id,
            run_id=run_id,
            markdown=narrative.markdown,
            summary=narrative.summary,
            management_note=narrative.management_note,
            model_used=narrative.model_used,
            tokens_used=narrative.tokens_used,
        )
        db.add(db_rep)
        db.commit()
        logger.info("Saved NarrativeReport to DB (id=%d) for user=%d", db_rep.id, current_user.id)
    except Exception as exc:
        logger.warning("Failed to persist NarrativeReport to DB: %s", exc)

    return {
        "markdown"        : narrative.markdown,
        "summary"         : narrative.summary,
        "management_note" : narrative.management_note,
        "model_used"      : narrative.model_used,
        "tokens_used"     : narrative.tokens_used,
        "anomaly_summary" : anomaly_report.summary,
        "anomaly_counts"  : {
            "total"  : anomaly_report.total_anomalies,
            "high"   : anomaly_report.high_severity,
            "medium" : anomaly_report.medium_severity,
            "low"    : anomaly_report.low_severity,
        },
    }


@router.get(
    "/latest",
    summary="Get latest generated narrative report for current user",
)
def get_latest_narrative(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # 1. Check in-memory user cache
    if current_user.id in _user_narratives:
        n = _user_narratives[current_user.id]
        return {
            "has_report"      : True,
            "markdown"        : n.markdown,
            "summary"         : n.summary,
            "management_note" : n.management_note,
            "model_used"      : n.model_used,
            "tokens_used"     : n.tokens_used,
        }

    # 2. Check Database for latest report saved for this user
    db_rep = (
        db.query(NarrativeReportModel)
        .filter(NarrativeReportModel.user_id == current_user.id)
        .order_by(NarrativeReportModel.created_at.desc())
        .first()
    )
    if db_rep:
        return {
            "has_report"      : True,
            "markdown"        : db_rep.markdown,
            "summary"         : db_rep.summary,
            "management_note" : db_rep.management_note,
            "model_used"      : db_rep.model_used,
            "tokens_used"     : db_rep.tokens_used,
        }

    if _latest_narrative is not None:
        return {
            "has_report"      : True,
            "markdown"        : _latest_narrative.markdown,
            "summary"         : _latest_narrative.summary,
            "management_note" : _latest_narrative.management_note,
            "model_used"      : _latest_narrative.model_used,
            "tokens_used"     : _latest_narrative.tokens_used,
        }

    return {"has_report": False, "markdown": None}


