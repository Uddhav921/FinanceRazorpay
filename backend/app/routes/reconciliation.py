"""
reconciliation.py — POST /reconciliation/run

Accepts three uploaded CSV/XLSX files (one per source), runs the full
ingestion pipeline on each, then executes the 3-way matching engine.

Endpoints
─────────
POST /reconciliation/run     — upload files + run matching → MatchReport
GET  /reconciliation/latest  — return the most recent cached MatchReport
"""

from __future__ import annotations

import logging
import os
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.schemas.transaction import DataSourceType, MatchReport
from app.services.parser import parse_file
from app.services.normalizer import normalise_with_trace
from app.services.matcher import run_match, DEFAULT_TOLERANCE_PCT, DEFAULT_DATE_WINDOW

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reconciliation", tags=["Reconciliation"])

# In-memory cache of the last run (replaced on each new run)
_latest_report: Optional[MatchReport] = None


def _ingest(file_bytes: bytes, filename: str, source: DataSourceType):
    """Parse + normalise a file; raise HTTPException on total failure."""
    result = parse_file(file_bytes=file_bytes, filename=filename, source=source)
    if not result.transactions and result.errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": f"Failed to parse {filename}.", "errors": result.errors},
        )
    normalised, _ = normalise_with_trace(result.transactions)
    return normalised


@router.post(
    "/run",
    response_model=MatchReport,
    summary="Run 3-way matching",
    description=(
        "Upload one CSV/XLSX file per data source. "
        "The engine parses, normalises, then matches across all three sources "
        "using 6 strategies in priority order. Returns a MatchReport with "
        "confidence-scored matches and unmatched lists."
    ),
)
async def run_reconciliation(
    order_file : UploadFile = File(..., description="Order/Ledger CSV or XLSX"),
    psp_file   : UploadFile = File(..., description="Razorpay/PSP CSV or XLSX"),
    bank_file  : UploadFile = File(..., description="Bank Statement CSV or XLSX"),
    tolerance  : float      = Form(
        default=float(DEFAULT_TOLERANCE_PCT),
        description="Amount tolerance in % (default 0.5)",
    ),
    date_window: int        = Form(
        default=DEFAULT_DATE_WINDOW,
        description="Date match window in days (default ±2)",
    ),
) -> MatchReport:
    global _latest_report

    # ── Read all files ────────────────────────────────────────────────────────
    order_bytes = await order_file.read()
    psp_bytes   = await psp_file.read()
    bank_bytes  = await bank_file.read()

    for byt, fname in ((order_bytes, order_file.filename), (psp_bytes, psp_file.filename), (bank_bytes, bank_file.filename)):
        if len(byt) == 0:
            raise HTTPException(status_code=400, detail=f"File '{fname}' is empty.")

    logger.info(
        "Reconciliation run | order=%s (%d B) | psp=%s (%d B) | bank=%s (%d B) | tol=%.2f%% | window=%d days",
        order_file.filename, len(order_bytes),
        psp_file.filename,   len(psp_bytes),
        bank_file.filename,  len(bank_bytes),
        tolerance, date_window,
    )

    # ── Ingest each source ────────────────────────────────────────────────────
    order_txns = _ingest(order_bytes, order_file.filename or "order", DataSourceType.ORDER_LEDGER)
    psp_txns   = _ingest(psp_bytes,   psp_file.filename   or "psp",   DataSourceType.RAZORPAY_PSP)
    bank_txns  = _ingest(bank_bytes,  bank_file.filename  or "bank",  DataSourceType.BANK_STATEMENT)

    # ── Run matching ──────────────────────────────────────────────────────────
    report = run_match(
        order_txns  = order_txns,
        psp_txns    = psp_txns,
        bank_txns   = bank_txns,
        tolerance   = Decimal(str(tolerance)),
        date_window = date_window,
    )

    _latest_report = report

    logger.info(
        "Reconciliation done | matched=%d | match_rate=%.1f%% | reconciled_rate=%.1f%%",
        len(report.matched), report.match_rate, report.reconciled_rate,
    )
    return report


@router.get(
    "/latest",
    response_model=MatchReport,
    summary="Get latest reconciliation report",
    description="Returns the most recently computed MatchReport (in-memory cache).",
)
def get_latest() -> MatchReport:
    if _latest_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No reconciliation has been run yet. POST to /reconciliation/run first.",
        )
    return _latest_report
