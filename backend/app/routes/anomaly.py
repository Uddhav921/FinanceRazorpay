"""
routes/anomaly.py — Anomaly Detection endpoints: Step 7

GET  /anomaly/run    — run anomaly detection on latest reconciliation
POST /anomaly/run    — run anomaly detection on a provided ReconciliationReport body
"""

from __future__ import annotations
import logging
from fastapi import APIRouter, HTTPException

from app.schemas.transaction import ReconciliationReport
from app.services.anomaly import AnomalyReport, run_anomaly_detection
from app.services.recon_state import get_latest_report

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])


@router.get(
    "/run",
    summary="Run anomaly detection on latest reconciliation",
)
def anomaly_on_latest() -> dict:
    latest = get_latest_report()
    if latest is None:
        raise HTTPException(status_code=404, detail="No reconciliation run yet.")
    report = run_anomaly_detection(latest)
    return _anomaly_to_dict(report)


@router.post(
    "/run",
    summary="Run anomaly detection on a provided ReconciliationReport",
)
def anomaly_on_report(report: ReconciliationReport) -> dict:
    result = run_anomaly_detection(report)
    return _anomaly_to_dict(result)


def _anomaly_to_dict(r: AnomalyReport) -> dict:
    return {
        "total_anomalies"  : r.total_anomalies,
        "high_severity"    : r.high_severity,
        "medium_severity"  : r.medium_severity,
        "low_severity"     : r.low_severity,
        "summary"          : r.summary,
        "anomalies"        : [
            {
                "type"       : a.anomaly_type,
                "severity"   : a.severity,
                "description": a.description,
                "affected_ids": a.affected_ids,
                "amount"     : float(a.amount) if a.amount else None,
                "metadata"   : a.metadata,
            }
            for a in r.anomalies
        ],
    }
