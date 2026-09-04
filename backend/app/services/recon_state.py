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
_latest_run_id: Optional[int] = None
_user_active_reports: dict[int, ReconciliationReport] = {}
_user_active_runs: dict[int, int] = {}


def get_latest_report(user_id: Optional[int] = None) -> Optional[ReconciliationReport]:
    """Retrieve the latest completed reconciliation report for a user or global fallback."""
    if user_id and user_id in _user_active_reports:
        return _user_active_reports[user_id]
    return _latest_report


def set_latest_report(report: ReconciliationReport, user_id: Optional[int] = None, run_id: Optional[int] = None) -> None:
    """Store the latest completed reconciliation report for a user and global fallback."""
    global _latest_report, _latest_run_id
    _latest_report = report
    if run_id:
        _latest_run_id = run_id
    if user_id:
        _user_active_reports[user_id] = report
        if run_id:
            _user_active_runs[user_id] = run_id

    logger.info(
        "ReconState updated: user_id=%s, run_id=%s, total=%d, matched=%d, reconciled=%d, exceptions=%d",
        str(user_id),
        str(run_id),
        report.total_matched,
        report.total_matched,
        report.total_reconciled,
        report.total_exceptions,
    )


def get_latest_run_id(user_id: Optional[int] = None) -> Optional[int]:
    """Retrieve the latest run ID."""
    if user_id and user_id in _user_active_runs:
        return _user_active_runs[user_id]
    return _latest_run_id

