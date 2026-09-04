"""
routes/reconciliation.py — POST /reconciliation/run

Full pipeline:
  1. Parse + normalise each of the 3 uploaded files
  2. Run 3-way matching engine (matcher.py)
  3. Run settlement calculation on matched PSP rows (settlement.py)
  4. Run reconciliation comparison vs bank credits (reconciliation.py)
  5. Return ReconciliationReport

Endpoints
─────────
POST /reconciliation/run         — upload 3 files → full ReconciliationReport
GET  /reconciliation/latest      — latest cached ReconciliationReport
GET  /reconciliation/exceptions  — exceptions from latest run
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.schemas.transaction import (
    DataSourceType,
    ReconciliationReport,
    ReconciliationResult,
)
from app.services.matcher import run_match, DEFAULT_TOLERANCE_PCT, DEFAULT_DATE_WINDOW
from app.services.normalizer import normalise_with_trace
from app.services.parser import parse_file
from app.services.reconciliation import reconcile
from app.services.settlement import MerchantConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reconciliation", tags=["Reconciliation"])

from app.services.recon_state import get_latest_report, set_latest_report

# In-memory cache compatibility
def _get_current_report() -> Optional[ReconciliationReport]:
    return get_latest_report()


def _ingest(file_bytes: bytes, filename: str, source: DataSourceType):
    """Parse + normalise a single file; raise on total failure."""
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
    response_model=ReconciliationReport,
    summary="Run full reconciliation pipeline",
    description=(
        "Uploads one CSV/XLSX per source, runs matching + settlement calculation + "
        "reconciliation comparison. Returns a ReconciliationReport with per-row "
        "RECONCILED / EXCEPTION status and settlement breakdowns."
    ),
)
async def run_reconciliation(
    order_file  : UploadFile = File(..., description="Order/Ledger CSV or XLSX"),
    psp_file    : UploadFile = File(..., description="Razorpay/PSP CSV or XLSX"),
    bank_file   : UploadFile = File(..., description="Bank Statement CSV or XLSX"),
    tolerance   : float      = Form(default=float(DEFAULT_TOLERANCE_PCT),
                                    description="Amount tolerance % (default 0.5)"),
    date_window : int        = Form(default=DEFAULT_DATE_WINDOW,
                                    description="Date match window in days (default ±2)"),
    fee_rate_pct: float      = Form(default=0.0,
                                    description="Override fee rate % (0 = use PSP data)"),
    tax_rate_pct: float      = Form(default=0.0,
                                    description="Override tax rate % on fee (0 = use PSP data)"),
    tds_rate_pct: float      = Form(default=0.0,
                                    description="Override TDS rate % (0 = use PSP data)"),
) -> ReconciliationReport:
    # ── Read uploaded files ───────────────────────────────────────────────────
    order_bytes = await order_file.read()
    psp_bytes   = await psp_file.read()
    bank_bytes  = await bank_file.read()

    for byt, fname in (
        (order_bytes, order_file.filename),
        (psp_bytes,   psp_file.filename),
        (bank_bytes,  bank_file.filename),
    ):
        if len(byt) == 0:
            raise HTTPException(status_code=400, detail=f"File '{fname}' is empty.")

    logger.info(
        "Reconciliation run | order=%s | psp=%s | bank=%s | tol=%.2f%% | window=%d days",
        order_file.filename, psp_file.filename, bank_file.filename,
        tolerance, date_window,
    )

    # ── Step 1: Ingest each source ────────────────────────────────────────────
    order_txns = _ingest(order_bytes, order_file.filename or "order", DataSourceType.ORDER_LEDGER)
    psp_txns   = _ingest(psp_bytes,   psp_file.filename   or "psp",   DataSourceType.RAZORPAY_PSP)
    bank_txns  = _ingest(bank_bytes,  bank_file.filename  or "bank",  DataSourceType.BANK_STATEMENT)

    # ── Step 2: 3-way matching ────────────────────────────────────────────────
    tol_decimal = Decimal(str(tolerance))
    match_report = run_match(
        order_txns  = order_txns,
        psp_txns    = psp_txns,
        bank_txns   = bank_txns,
        tolerance   = tol_decimal,
        date_window = date_window,
    )

    # ── Step 3+4: Settlement calculation + Reconciliation ─────────────────────
    config = MerchantConfig(
        fee_rate_pct = Decimal(str(fee_rate_pct)) if fee_rate_pct > 0 else None,
        tax_rate_pct = Decimal(str(tax_rate_pct)) if tax_rate_pct > 0 else None,
        tds_rate_pct = Decimal(str(tds_rate_pct)) if tds_rate_pct > 0 else None,
    )

    report = reconcile(
        match_report  = match_report,
        config        = config,
        tolerance_pct = tol_decimal,
    )

    set_latest_report(report)

    logger.info(
        "Reconciliation done | reconciled=%d | exceptions=%d | rate=%.1f%%",
        report.total_reconciled, report.total_exceptions, report.reconciliation_rate,
    )
    return report


@router.get(
    "/latest",
    response_model=ReconciliationReport,
    summary="Get latest reconciliation report",
)
def get_latest() -> ReconciliationReport:
    report = get_latest_report()
    if report is None:
        raise HTTPException(
            status_code=404,
            detail="No reconciliation run yet. POST to /reconciliation/run first.",
        )
    return report


@router.get(
    "/exceptions",
    response_model=list[ReconciliationResult],
    summary="Get exceptions from latest run",
    description="Returns only EXCEPTION rows from the most recent reconciliation.",
)
def get_exceptions() -> list[ReconciliationResult]:
    report = get_latest_report()
    if report is None:
        raise HTTPException(status_code=404, detail="No reconciliation run yet.")
    return report.exceptions
