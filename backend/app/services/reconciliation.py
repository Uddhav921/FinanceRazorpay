"""
reconciliation.py — Reconciliation Engine: Step 6

Compares Expected Net Settlement (from Step 5) against Actual Bank Credit.

  RECONCILED : |Expected Net − Actual Bank| <= tolerance
  EXCEPTION  : |Expected Net − Actual Bank| >  tolerance
             OR transaction missing from one source

Exception Reason Codes
──────────────────────
  AMOUNT_MISMATCH   — difference exceeds tolerance
  MISSING_BANK      — PSP record has no bank counterpart
  MISSING_PSP       — Bank record has no PSP counterpart
  MISSING_ORDER     — Matched pair has no order record
  DATE_MISMATCH     — Settlement date outside expected window
  FEE_DISCREPANCY   — Actual fee deducted ≠ expected fee
"""

from __future__ import annotations

import logging
from decimal import Decimal
from datetime import datetime

from app.schemas.transaction import (
    MatchReport,
    MatchResult,
    ReconciliationReport,
    ReconciliationResult,
    ReconciliationStatus,
    SettlementBreakdown,
    TransactionBase,
    DataSourceType,
)
from app.services.settlement import MerchantConfig, compute_settlement, DEFAULT_CONFIG

logger = logging.getLogger(__name__)

# ─── Reason codes ─────────────────────────────────────────────────────────────
RC_AMOUNT_MISMATCH  = "AMOUNT_MISMATCH"
RC_MISSING_BANK     = "MISSING_BANK"
RC_MISSING_PSP      = "MISSING_PSP"
RC_MISSING_ORDER    = "MISSING_ORDER"
RC_DATE_MISMATCH    = "DATE_MISMATCH"
RC_FEE_DISCREPANCY  = "FEE_DISCREPANCY"


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _within(diff: Decimal, tolerance_pct: Decimal, base: Decimal) -> bool:
    """True if diff <= tolerance_pct% of base (or base is 0)."""
    if base == 0:
        return diff == 0
    return diff <= base * tolerance_pct / 100


def _reconcile_matched(
    match:         MatchResult,
    config:        MerchantConfig,
    tolerance_pct: Decimal,
) -> ReconciliationResult:
    """Reconcile a single matched triple (or 2-way match)."""

    psp_txn  = match.psp_txn
    bank_txn = match.bank_txn

    # ── Settlement calculation from PSP data ──────────────────────────────────
    if psp_txn:
        settlement = compute_settlement(psp_txn, config)
    else:
        settlement = SettlementBreakdown()

    # ── Bank credit ───────────────────────────────────────────────────────────
    actual_bank = bank_txn.net_amount if bank_txn else Decimal("0.00")
    expected    = settlement.expected_net

    # Signed: positive = bank paid more, negative = bank paid less
    signed_diff = (actual_bank - expected).quantize(Decimal("0.01"))
    abs_diff    = abs(signed_diff)

    settlement.actual_bank_credit = actual_bank
    settlement.difference         = signed_diff   # Bank Credit − Expected Net

    # ── Determine status & reason ─────────────────────────────────────────────
    status      : ReconciliationStatus = ReconciliationStatus.RECONCILED
    reason_code : str | None           = None
    reason_detail: str | None          = None

    # Missing bank counterpart
    if bank_txn is None:
        status       = ReconciliationStatus.EXCEPTION
        reason_code  = RC_MISSING_BANK
        reason_detail = (
            f"PSP transaction {psp_txn.transaction_id!r} has no matching bank credit."
            if psp_txn else "No bank counterpart found."
        )

    # Missing PSP counterpart
    elif psp_txn is None:
        status       = ReconciliationStatus.EXCEPTION
        reason_code  = RC_MISSING_PSP
        reason_detail = (
            f"Bank credit (ref={bank_txn.reference!r}) has no PSP record."
        )

    # Amount mismatch — use abs_diff for tolerance check
    elif not _within(abs_diff, tolerance_pct, expected):
        status       = ReconciliationStatus.EXCEPTION
        reason_code  = RC_AMOUNT_MISMATCH
        sign         = "+" if signed_diff > 0 else ""
        reason_detail = (
            f"Expected net ₹{expected:.2f}, actual bank credit ₹{actual_bank:.2f}, "
            f"difference {sign}₹{signed_diff:.2f} (tolerance {tolerance_pct}%)."
        )

    # Fee discrepancy check (warn even if amount is reconciled)
    if status == ReconciliationStatus.RECONCILED and psp_txn:
        expected_fee = settlement.fee_amount
        actual_fee   = psp_txn.fee_amount
        fee_diff     = abs(expected_fee - actual_fee)
        if config.fee_rate_pct is not None and not _within(fee_diff, tolerance_pct, expected_fee):
            status       = ReconciliationStatus.EXCEPTION
            reason_code  = RC_FEE_DISCREPANCY
            reason_detail = (
                f"Expected fee ₹{expected_fee:.2f}, actual fee charged ₹{actual_fee:.2f}, "
                f"difference ₹{fee_diff:.2f}."
            )

    # Missing order record (soft exception — still reconciled if amounts match)
    if reason_code is None and match.order_txn is None:
        reason_code  = RC_MISSING_ORDER
        reason_detail = "No order/ledger record linked to this transaction."

    return ReconciliationResult(
        order_txn      = match.order_txn,
        psp_txn        = psp_txn,
        bank_txn       = bank_txn,
        confidence     = match.confidence,
        match_strategy = match.match_strategy,
        settlement     = settlement,
        status         = status,
        reason_code    = reason_code,
        reason_detail  = reason_detail,
        date_diff_days = match.date_diff_days,
    )


def _reconcile_unmatched_psp(
    txn: TransactionBase, config: MerchantConfig
) -> ReconciliationResult:
    """PSP row with no bank counterpart."""
    settlement = compute_settlement(txn, config)
    settlement.actual_bank_credit = Decimal("0.00")
    # Signed: 0 (bank) - expected_net = negative (under-paid)
    settlement.difference = (Decimal("0.00") - settlement.expected_net).quantize(Decimal("0.01"))
    return ReconciliationResult(
        psp_txn        = txn,
        settlement     = settlement,
        status         = ReconciliationStatus.EXCEPTION,
        reason_code    = RC_MISSING_BANK,
        reason_detail  = (
            f"PSP transaction {txn.transaction_id!r} (₹{txn.gross_amount:.2f}) "
            "has no matching bank credit."
        ),
        confidence     = 0,
        match_strategy = "unmatched",
    )


def _reconcile_unmatched_bank(txn: TransactionBase) -> ReconciliationResult:
    """Bank row with no PSP counterpart."""
    return ReconciliationResult(
        bank_txn       = txn,
        settlement     = SettlementBreakdown(
            actual_bank_credit = txn.net_amount,
            difference         = txn.net_amount,
        ),
        status         = ReconciliationStatus.EXCEPTION,
        reason_code    = RC_MISSING_PSP,
        reason_detail  = (
            f"Bank credit (ref={txn.reference!r}, ₹{txn.net_amount:.2f}) "
            "has no PSP record."
        ),
        confidence     = 0,
        match_strategy = "unmatched",
    )


# ─── Public API ───────────────────────────────────────────────────────────────

def reconcile(
    match_report:  MatchReport,
    config:        MerchantConfig = DEFAULT_CONFIG,
    tolerance_pct: Decimal        = Decimal("0.5"),
) -> ReconciliationReport:
    """
    Run the full reconciliation engine on a completed MatchReport.

    For every matched triple → compute settlement → compare vs bank → RECONCILED/EXCEPTION
    For every unmatched PSP  → EXCEPTION (MISSING_BANK)
    For every unmatched bank → EXCEPTION (MISSING_PSP)

    Returns a ReconciliationReport with per-row results and aggregate stats.
    """
    results: list[ReconciliationResult] = []

    # ── Matched triples ───────────────────────────────────────────────────────
    for match in match_report.matched:
        results.append(_reconcile_matched(match, config, tolerance_pct))

    # ── Unmatched PSP rows ────────────────────────────────────────────────────
    for txn in match_report.unmatched_psp:
        results.append(_reconcile_unmatched_psp(txn, config))

    # ── Unmatched bank rows ───────────────────────────────────────────────────
    for txn in match_report.unmatched_bank:
        results.append(_reconcile_unmatched_bank(txn))

    # ── Aggregate stats ───────────────────────────────────────────────────────
    reconciled = [r for r in results if r.status == ReconciliationStatus.RECONCILED]
    exceptions = [r for r in results if r.status == ReconciliationStatus.EXCEPTION]

    total_expected = sum(r.settlement.expected_net       for r in results)
    total_actual   = sum(r.settlement.actual_bank_credit for r in results)
    # Signed total difference: Bank Credit − Expected Net across all rows
    total_diff     = sum(r.settlement.difference         for r in results)

    # Total Transactions = max rows across all three sources
    total_txns = max(match_report.total_order, match_report.total_psp, match_report.total_bank, 1)
    n_matched  = len(match_report.matched)
    match_rate = round(n_matched / total_txns * 100, 1)
    # Reconciliation rate = reconciled / total results (including unmatched)
    recon_rate = round(len(reconciled) / max(len(results), 1) * 100, 1)

    logger.info(
        "Reconciliation: total=%d | matched=%d (%.1f%%) | reconciled=%d (%.1f%%) | exceptions=%d | "
        "expected=%.2f | actual=%.2f | net_diff=%.2f",
        total_txns, n_matched, match_rate, len(reconciled), recon_rate, len(exceptions),
        total_expected, total_actual, total_diff,
    )

    return ReconciliationReport(
        total_order         = match_report.total_order,
        total_psp           = match_report.total_psp,
        total_bank          = match_report.total_bank,
        total_matched       = n_matched,
        total_reconciled    = len(reconciled),
        total_exceptions    = len(exceptions),
        match_rate          = match_rate,
        reconciliation_rate = recon_rate,
        total_expected_net  = total_expected.quantize(Decimal("0.01")),
        total_actual_bank   = total_actual.quantize(Decimal("0.01")),
        total_difference    = total_diff.quantize(Decimal("0.01")),
        tolerance_pct       = tolerance_pct,
        results             = results,
        exceptions          = exceptions,
        run_at              = datetime.utcnow(),
    )
