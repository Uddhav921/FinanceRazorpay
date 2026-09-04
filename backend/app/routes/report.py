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
from typing import Optional

from fastapi import APIRouter, HTTPException

from app.routes.reconciliation import _latest_report
from app.services.anomaly import run_anomaly_detection
from app.services.llm import NarrativeReport, generate_narrative

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/report", tags=["AI Report"])

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
def generate_report() -> dict:
    global _latest_narrative

    if _latest_report is None:
        raise HTTPException(
            status_code=404,
            detail="No reconciliation run found. POST to /reconciliation/run first.",
        )

    # Step 7: anomaly detection
    logger.info("Running anomaly detection for narrative report...")
    anomaly_report = run_anomaly_detection(_latest_report)

    # Step 8: Gemini LLM narrative
    logger.info("Calling Gemini API for narrative generation...")
    try:
        narrative = generate_narrative(_latest_report, anomaly_report)
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}")

    _latest_narrative = narrative

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
    summary="Get latest generated narrative report",
)
def get_latest_report() -> dict:
    if _latest_narrative is None:
        raise HTTPException(status_code=404, detail="No report generated yet. POST to /report/generate first.")
    return {
        "markdown"        : _latest_narrative.markdown,
        "summary"         : _latest_narrative.summary,
        "management_note" : _latest_narrative.management_note,
        "model_used"      : _latest_narrative.model_used,
        "tokens_used"     : _latest_narrative.tokens_used,
    }
