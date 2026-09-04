"""
recon_state.py — Shared reconciliation state store.
Ensures latest reconciliation run is accessible across all route modules
(reconciliation, exceptions, report, anomaly) without Python import-by-value scoping issues.
"""

from __future__ import annotations
import json
import logging
from typing import Optional
from app.schemas.transaction import ReconciliationReport

logger = logging.getLogger(__name__)

_latest_report: Optional[ReconciliationReport] = None


def get_latest_report() -> Optional[ReconciliationReport]:
    """Retrieve the latest completed reconciliation report."""
    global _latest_report
    return _latest_report


def set_latest_report(report: ReconciliationReport) -> None:
    """Store the latest completed reconciliation report."""
    global _latest_report
    _latest_report = report
    logger.info(
        "ReconState updated: total=%d, matched=%d, reconciled=%d, exceptions=%d",
        report.total_matched,
        report.total_matched,
        report.total_reconciled,
        report.total_exceptions,
    )
