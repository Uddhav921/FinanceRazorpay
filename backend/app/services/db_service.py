"""
db_service.py — Database persistence helpers.

Provides thin wrapper functions to save:
  • Upload sessions + transactions       → save_upload()
  • Reconciliation run + results         → save_reconciliation()

All functions accept a SQLAlchemy Session and return the created ORM object.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.orm import (
    ReconciliationResult as ORMResult,
    ReconciliationRun,
    SettlementBreakdown as ORMBreakdown,
    Transaction,
    UploadSession,
)
from app.schemas.transaction import (
    ReconciliationReport,
    TransactionBase,
    UploadSummary,
)

logger = logging.getLogger(__name__)


# ─── Upload + Transactions ─────────────────────────────────────────────────────

def save_upload(db: Session, summary: UploadSummary) -> UploadSession:
    """
    Persist an upload session and all its normalised transactions.
    Returns the saved UploadSession ORM object (with id populated).
    """
    qs = summary.quality_report.quality_score if summary.quality_report else Decimal("100.00")

    session_orm = UploadSession(
        filename         = summary.filename,
        source           = summary.source.value,
        total_rows       = summary.total_rows,
        valid_rows       = summary.valid_rows,
        skipped_rows     = summary.skipped_rows,
        normalised_count = summary.normalised_count,
        quality_score    = float(qs),
    )
    db.add(session_orm)
    db.flush()   # get session_orm.id without full commit

    # Bulk-insert transactions
    for txn in summary.transactions:
        db.add(_txn_to_orm(txn, session_orm.id))

    db.commit()
    db.refresh(session_orm)

    logger.info(
        "Saved upload session id=%d | source=%s | rows=%d",
        session_orm.id, summary.source, len(summary.transactions),
    )
    return session_orm


def _txn_to_orm(txn: TransactionBase, session_id: int) -> Transaction:
    return Transaction(
        session_id     = session_id,
        source         = txn.source.value,
        transaction_id = txn.transaction_id,
        order_id       = txn.order_id,
        settlement_id  = txn.settlement_id,
        merchant_id    = txn.merchant_id,
        txn_date       = str(txn.date) if txn.date else None,
        gross_amount   = float(txn.gross_amount),
        fee_amount     = float(txn.fee_amount),
        tax_amount     = float(txn.tax_amount),
        tds_amount     = float(txn.tds_amount),
        refund_amount  = float(txn.refund_amount),
        net_amount     = float(txn.net_amount),
        reference      = txn.reference,
        status         = txn.status.value,
        currency       = txn.currency,
        raw_row_index  = txn.raw_row_index,
    )


# ─── Reconciliation Run ────────────────────────────────────────────────────────

def save_reconciliation(
    db:              Session,
    report:          ReconciliationReport,
    order_session_id: int | None = None,
    psp_session_id:   int | None = None,
    bank_session_id:  int | None = None,
) -> ReconciliationRun:
    """
    Persist a complete ReconciliationReport:
      ReconciliationRun → ReconciliationResult × N → SettlementBreakdown × N

    Returns the saved ReconciliationRun ORM object.
    """
    run_orm = ReconciliationRun(
        order_session_id    = order_session_id,
        psp_session_id      = psp_session_id,
        bank_session_id     = bank_session_id,
        total_order         = report.total_order,
        total_psp           = report.total_psp,
        total_bank          = report.total_bank,
        total_matched       = report.total_matched,
        total_reconciled    = report.total_reconciled,
        total_exceptions    = report.total_exceptions,
        match_rate          = float(report.match_rate),
        reconciliation_rate = float(report.reconciliation_rate),
        total_expected_net  = float(report.total_expected_net),
        total_actual_bank   = float(report.total_actual_bank),
        total_difference    = float(report.total_difference),
        tolerance_pct       = float(report.tolerance_pct),
        run_at              = report.run_at,
    )
    db.add(run_orm)
    db.flush()   # get run_orm.id

    for schema_result in report.results:
        result_orm = ORMResult(
            run_id         = run_orm.id,
            confidence     = schema_result.confidence,
            match_strategy = schema_result.match_strategy,
            status         = schema_result.status.value,
            reason_code    = schema_result.reason_code,
            reason_detail  = schema_result.reason_detail,
            date_diff_days = schema_result.date_diff_days,
        )
        db.add(result_orm)
        db.flush()   # get result_orm.id

        # Settlement breakdown
        sd = schema_result.settlement
        db.add(ORMBreakdown(
            result_id          = result_orm.id,
            gross_amount       = float(sd.gross_amount),
            fee_amount         = float(sd.fee_amount),
            tax_amount         = float(sd.tax_amount),
            tds_amount         = float(sd.tds_amount),
            refund_amount      = float(sd.refund_amount),
            other_adjustments  = float(sd.other_adjustments),
            expected_net       = float(sd.expected_net),
            actual_bank_credit = float(sd.actual_bank_credit),
            difference         = float(sd.difference),
        ))

    db.commit()
    db.refresh(run_orm)

    logger.info(
        "Saved reconciliation run id=%d | matched=%d | reconciled=%d | exceptions=%d",
        run_orm.id, report.total_matched, report.total_reconciled, report.total_exceptions,
    )
    return run_orm
