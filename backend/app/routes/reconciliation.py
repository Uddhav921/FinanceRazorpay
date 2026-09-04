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

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.orm import ReconciliationRun as ORMRun, ReconciliationResult as ORMResult, SettlementBreakdown as ORMBreakdown, User
from app.schemas.transaction import (
    DataSourceType,
    ReconciliationReport,
    ReconciliationResult,
    ReconciliationStatus,
    SettlementBreakdown,
    TransactionBase,
)
from app.services.auth import get_current_user
from app.services.db_service import save_reconciliation
from app.services.matcher import run_match, DEFAULT_TOLERANCE_PCT, DEFAULT_DATE_WINDOW
from app.services.normalizer import normalise_with_trace
from app.services.parser import parse_file
from app.services.reconciliation import reconcile
from app.services.settlement import MerchantConfig
from app.services.recon_state import get_latest_report, set_latest_report, get_latest_run_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reconciliation", tags=["Reconciliation"])


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
    current_user: User       = Depends(get_current_user),
    db          : Session    = Depends(get_db),
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
        "Reconciliation run by user %s (id=%d) | order=%s | psp=%s | bank=%s | tol=%.2f%% | window=%d days",
        current_user.email, current_user.id, order_file.filename, psp_file.filename, bank_file.filename,
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

    # Persist run to MySQL
    run_id = None
    try:
        run_name = f"{order_file.filename} · {psp_file.filename} · {bank_file.filename}"
        run_orm = save_reconciliation(
            db=db,
            report=report,
            user_id=current_user.id,
            run_name=run_name,
        )
        run_id = run_orm.id
        logger.info("Reconciliation saved to DB with run_id=%d for user=%d", run_id, current_user.id)
    except Exception as exc:
        logger.warning("Failed to persist reconciliation run to DB: %s", exc)

    set_latest_report(report, user_id=current_user.id, run_id=run_id)

    logger.info(
        "Reconciliation done | reconciled=%d | exceptions=%d | rate=%.1f%%",
        report.total_reconciled, report.total_exceptions, report.reconciliation_rate,
    )
    return report


@router.get(
    "/history",
    summary="Get user reconciliation history",
    description="Lists past reconciliation runs for the current user.",
)
def get_history(
    current_user: User    = Depends(get_current_user),
    db          : Session = Depends(get_db),
) -> list[dict]:
    runs = (
        db.query(ORMRun)
        .filter(ORMRun.user_id == current_user.id)
        .order_by(ORMRun.run_at.desc())
        .limit(20)
        .all()
    )
    history = []
    for r in runs:
        history.append({
            "id": r.id,
            "run_name": r.run_name or f"Run #{r.id}",
            "total_matched": r.total_matched,
            "total_reconciled": r.total_reconciled,
            "total_exceptions": r.total_exceptions,
            "match_rate": float(r.match_rate or 0.0),
            "reconciliation_rate": float(r.reconciliation_rate or 0.0),
            "total_difference": float(r.total_difference or 0.0),
            "total_expected_net": float(r.total_expected_net or 0.0),
            "total_actual_bank": float(r.total_actual_bank or 0.0),
            "run_at": str(r.run_at),
        })
    return history


@router.post(
    "/{run_id}/load",
    summary="Load a past reconciliation run into active session",
)
def load_run(
    run_id      : int,
    current_user: User    = Depends(get_current_user),
    db          : Session = Depends(get_db),
) -> dict:
    run = (
        db.query(ORMRun)
        .filter(ORMRun.id == run_id, ORMRun.user_id == current_user.id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Reconciliation run not found or unauthorized.")

    # Reconstruct ReconciliationReport from DB results
    results_list = []
    exceptions_list = []

    for res in run.results:
        bd = res.breakdown
        settlement = SettlementBreakdown(
            gross_amount       = Decimal(str(bd.gross_amount)) if bd else Decimal("0.00"),
            fee_amount         = Decimal(str(bd.fee_amount)) if bd else Decimal("0.00"),
            tax_amount         = Decimal(str(bd.tax_amount)) if bd else Decimal("0.00"),
            tds_amount         = Decimal(str(bd.tds_amount)) if bd else Decimal("0.00"),
            refund_amount      = Decimal(str(bd.refund_amount)) if bd else Decimal("0.00"),
            other_adjustments  = Decimal(str(bd.other_adjustments)) if bd else Decimal("0.00"),
            expected_net       = Decimal(str(bd.expected_net)) if bd else Decimal("0.00"),
            actual_bank_credit = Decimal(str(bd.actual_bank_credit)) if bd else Decimal("0.00"),
            difference         = Decimal(str(bd.difference)) if bd else Decimal("0.00"),
        )
        # Create minimal transaction representation if not stored
        txn_stub = TransactionBase(
            transaction_id = f"TXN_{res.id}",
            source         = DataSourceType.RAZORPAY_PSP,
            gross_amount   = settlement.gross_amount,
            fee_amount     = settlement.fee_amount,
            tax_amount     = settlement.tax_amount,
            tds_amount     = settlement.tds_amount,
            refund_amount  = settlement.refund_amount,
            net_amount     = settlement.expected_net,
        )

        schema_res = ReconciliationResult(
            psp_txn        = txn_stub,
            confidence     = res.confidence or 0,
            match_strategy = res.match_strategy or "",
            settlement     = settlement,
            status         = ReconciliationStatus(res.status) if res.status in ("reconciled", "exception", "pending") else ReconciliationStatus.EXCEPTION,
            reason_code    = res.reason_code,
            reason_detail  = res.reason_detail,
            date_diff_days = res.date_diff_days,
        )
        results_list.append(schema_res)
        if schema_res.status == ReconciliationStatus.EXCEPTION:
            exceptions_list.append(schema_res)

    report = ReconciliationReport(
        total_order         = run.total_order or len(results_list),
        total_psp           = run.total_psp or len(results_list),
        total_bank          = run.total_bank or len(results_list),
        total_matched       = run.total_matched or len(results_list),
        total_reconciled    = run.total_reconciled or 0,
        total_exceptions    = run.total_exceptions or len(exceptions_list),
        match_rate          = float(run.match_rate or 0.0),
        reconciliation_rate = float(run.reconciliation_rate or 0.0),
        total_expected_net  = Decimal(str(run.total_expected_net or 0.0)),
        total_actual_bank   = Decimal(str(run.total_actual_bank or 0.0)),
        total_difference    = Decimal(str(run.total_difference or 0.0)),
        tolerance_pct       = Decimal(str(run.tolerance_pct or 0.5)),
        results             = results_list,
        exceptions          = exceptions_list,
        run_at              = run.run_at,
    )

    set_latest_report(report, user_id=current_user.id, run_id=run.id)
    return {
        "status": "loaded",
        "run_id": run.id,
        "run_name": run.run_name,
        "total_matched": run.total_matched,
        "total_reconciled": run.total_reconciled,
        "total_exceptions": run.total_exceptions,
    }


@router.get(
    "/latest",
    response_model=ReconciliationReport,
    summary="Get latest reconciliation report for current user",
)
def get_latest(current_user: User = Depends(get_current_user)) -> ReconciliationReport:
    report = get_latest_report(user_id=current_user.id)
    if report is None:
        raise HTTPException(
            status_code=404,
            detail="No reconciliation run yet. POST to /reconciliation/run first.",
        )
    return report


@router.get(
    "/exceptions",
    response_model=list[ReconciliationResult],
    summary="Get exceptions from latest run for current user",
    description="Returns only EXCEPTION rows from the most recent reconciliation.",
)
def get_exceptions(current_user: User = Depends(get_current_user)) -> list[ReconciliationResult]:
    report = get_latest_report(user_id=current_user.id)
    if report is None:
        raise HTTPException(status_code=404, detail="No reconciliation run yet.")
    return report.exceptions
