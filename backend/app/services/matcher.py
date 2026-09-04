"""
matcher.py — Matching Engine (3-Way): Step 4

Matches transactions across three data sources:
  Order/Ledger  ↔  Razorpay/PSP  ↔  Bank Statement

Six strategies are attempted in priority order per transaction.
Each match gets a confidence score (0–100). The engine is greedy —
once a transaction is matched it cannot be re-used.

Match Strategies
────────────────
1. Transaction ID      — exact transaction_id match              → confidence 100
2. Order/Reference     — exact order_id or reference match       → confidence  90
3. Settlement/Batch    — same settlement_id + amount tolerance   → confidence  80
4. Date Window         — same gross_amount within ±N day window  → confidence  75
5. Amount+Counterparty — net_amount within tolerance + ref fuzzy → confidence  65
6. Fuzzy/Heuristic     — amount similarity + date proximity      → confidence  50
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from app.schemas.transaction import (
    DataSourceType,
    MatchReport,
    MatchResult,
    TransactionBase,
)

logger = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────
DEFAULT_TOLERANCE_PCT   = Decimal(os.getenv("MATCH_TOLERANCE_PCT",  "0.5"))   # 0.5 %
DEFAULT_DATE_WINDOW     = int(os.getenv("MATCH_DATE_WINDOW_DAYS",   "2"))
FUZZY_AMOUNT_THRESHOLD  = Decimal(os.getenv("FUZZY_AMOUNT_THRESHOLD", "50"))  # ₹50 abs diff

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _within_tolerance(a: Decimal, b: Decimal, pct: Decimal) -> bool:
    """Return True if |a - b| <= pct% of max(a, b)."""
    if a == 0 and b == 0:
        return True
    base = max(abs(a), abs(b))
    return abs(a - b) <= base * pct / 100


def _date_diff(a: TransactionBase, b: TransactionBase) -> Optional[int]:
    """Absolute day difference between two transactions. None if either date missing."""
    if a.date and b.date:
        return abs((a.date - b.date).days)
    return None


def _str_match(a: Optional[str], b: Optional[str]) -> bool:
    """Case-insensitive exact non-empty match."""
    return bool(a and b and a.strip().lower() == b.strip().lower())


def _fuzzy_ref_match(a: Optional[str], b: Optional[str]) -> bool:
    """True if either reference is a substring of the other (handles partial UTRs)."""
    if not a or not b:
        return False
    a, b = a.strip().lower(), b.strip().lower()
    return a in b or b in a


# ─── 6 Strategy Functions ─────────────────────────────────────────────────────

def _strategy_txn_id(
    order: TransactionBase, psp: TransactionBase, bank: TransactionBase
) -> Optional[tuple[int, str]]:
    """Strategy 1: All three share the same transaction_id."""
    if (
        order.transaction_id
        and _str_match(order.transaction_id, psp.transaction_id)
        and _str_match(order.transaction_id, bank.transaction_id)
    ):
        return (100, "transaction_id_3way")
    # Partial: order ↔ psp only
    if order.transaction_id and _str_match(order.transaction_id, psp.transaction_id):
        return (95, "transaction_id_order_psp")
    return None


def _strategy_order_ref(
    order: TransactionBase, psp: TransactionBase, bank: TransactionBase
) -> Optional[tuple[int, str]]:
    """Strategy 2: order_id or reference exact match."""
    # order_id matches across order ↔ psp
    if _str_match(order.order_id, psp.order_id):
        return (90, "order_id_match")
    # reference/UTR matches psp ↔ bank
    if _str_match(psp.reference, bank.reference):
        return (88, "reference_utr_match")
    # order reference matches bank reference
    if _str_match(order.reference, bank.reference):
        return (85, "reference_order_bank")
    return None


def _strategy_settlement(
    order: TransactionBase, psp: TransactionBase, bank: TransactionBase,
    tol: Decimal,
) -> Optional[tuple[int, str]]:
    """Strategy 3: same settlement_id + amounts within tolerance."""
    if (
        psp.settlement_id
        and _str_match(psp.settlement_id, bank.settlement_id)
        and _within_tolerance(psp.net_amount, bank.net_amount, tol)
    ):
        return (80, "settlement_batch_match")
    if (
        order.settlement_id
        and _str_match(order.settlement_id, psp.settlement_id)
    ):
        return (78, "settlement_order_psp")
    return None


def _strategy_date_window(
    order: TransactionBase, psp: TransactionBase, bank: TransactionBase,
    window: int, tol: Decimal,
) -> Optional[tuple[int, str]]:
    """Strategy 4: same gross_amount within date window."""
    diff_op = _date_diff(order, psp)
    diff_pb = _date_diff(psp, bank)
    amt_ok = _within_tolerance(order.gross_amount, psp.gross_amount, tol)

    if amt_ok and diff_op is not None and diff_op <= window:
        if diff_pb is not None and diff_pb <= window:
            return (75, "date_window_3way")
        return (72, "date_window_order_psp")
    return None


def _strategy_amount_counterparty(
    order: TransactionBase, psp: TransactionBase, bank: TransactionBase,
    tol: Decimal,
) -> Optional[tuple[int, str]]:
    """Strategy 5: net_amount within tolerance + fuzzy reference."""
    if (
        _within_tolerance(psp.net_amount, bank.net_amount, tol)
        and _fuzzy_ref_match(psp.reference, bank.reference)
    ):
        return (65, "amount_ref_fuzzy")
    if _within_tolerance(order.net_amount, psp.net_amount, tol):
        return (60, "amount_tolerance_only")
    return None


def _strategy_fuzzy_heuristic(
    order: TransactionBase, psp: TransactionBase, bank: TransactionBase,
) -> Optional[tuple[int, str]]:
    """Strategy 6: score based on amount proximity + date proximity."""
    scores: list[int] = []

    # Amount similarity between order & psp
    if order.gross_amount > 0 and psp.gross_amount > 0:
        diff_pct = abs(order.gross_amount - psp.gross_amount) / max(order.gross_amount, psp.gross_amount) * 100
        if diff_pct <= 5:
            scores.append(30)
        elif diff_pct <= 15:
            scores.append(15)

    # Date proximity
    diff_days = _date_diff(order, psp)
    if diff_days is not None:
        if diff_days == 0:
            scores.append(20)
        elif diff_days <= 3:
            scores.append(10)

    # Bank amount similarity to psp
    if psp.net_amount > 0 and bank.net_amount > 0:
        abs_diff = abs(psp.net_amount - bank.net_amount)
        if abs_diff <= FUZZY_AMOUNT_THRESHOLD:
            scores.append(15)

    total = sum(scores)
    if total >= 30:
        return (min(total, 50), "fuzzy_heuristic")
    return None


# ─── Pairwise matcher (order ↔ psp, then find bank) ─────────────────────────

def _try_strategies(
    order: TransactionBase,
    psp: TransactionBase,
    bank: TransactionBase,
    tol: Decimal,
    window: int,
) -> Optional[tuple[int, str]]:
    """Try all 6 strategies; return first (highest-priority) hit."""
    return (
        _strategy_txn_id(order, psp, bank)
        or _strategy_order_ref(order, psp, bank)
        or _strategy_settlement(order, psp, bank, tol)
        or _strategy_date_window(order, psp, bank, window, tol)
        or _strategy_amount_counterparty(order, psp, bank, tol)
        or _strategy_fuzzy_heuristic(order, psp, bank)
    )


# ─── Public API ───────────────────────────────────────────────────────────────

def run_match(
    order_txns: list[TransactionBase],
    psp_txns:   list[TransactionBase],
    bank_txns:  list[TransactionBase],
    tolerance:  Decimal = DEFAULT_TOLERANCE_PCT,
    date_window: int    = DEFAULT_DATE_WINDOW,
) -> MatchReport:
    """
    Run the 3-way matching engine.

    Parameters
    ----------
    order_txns  : normalised Order/Ledger transactions
    psp_txns    : normalised Razorpay/PSP transactions
    bank_txns   : normalised Bank Statement transactions
    tolerance   : amount tolerance in % (default 0.5%)
    date_window : date match window in days (default ±2)

    Returns
    -------
    MatchReport with matched triples + unmatched lists + summary stats.
    """
    matched:   list[MatchResult]     = []
    used_psp:  set[int]              = set()
    used_bank: set[int]              = set()

    # ── Greedy matching: iterate over order transactions ─────────────────────
    for oi, order in enumerate(order_txns):
        best_confidence = -1
        best_result: Optional[MatchResult] = None

        for pi, psp in enumerate(psp_txns):
            if pi in used_psp:
                continue

            # Find the best bank match for this (order, psp) pair
            bank_candidate: Optional[TransactionBase] = None
            bank_idx: Optional[int] = None
            bank_conf_bonus = 0

            for bi, bank in enumerate(bank_txns):
                if bi in used_bank:
                    continue
                result = _try_strategies(order, psp, bank, tolerance, date_window)
                if result and result[0] > best_confidence:
                    bank_candidate = bank
                    bank_idx = bi
                    best_confidence = result[0]
                    best_result = MatchResult(
                        order_txn      = order,
                        psp_txn        = psp,
                        bank_txn       = bank,
                        confidence     = result[0],
                        match_strategy = result[1],
                        amount_diff    = abs(psp.net_amount - bank.net_amount),
                        date_diff_days = _date_diff(psp, bank),
                        is_reconciled  = _within_tolerance(psp.net_amount, bank.net_amount, tolerance),
                    )

            # If no bank match found but order ↔ psp match exists
            if bank_candidate is None:
                # Try order ↔ psp 2-way match
                dummy_bank = TransactionBase(
                    source=DataSourceType.BANK_STATEMENT,
                    gross_amount=psp.net_amount,
                    net_amount=psp.net_amount,
                )
                result = (
                    _strategy_txn_id(order, psp, dummy_bank)
                    or _strategy_order_ref(order, psp, dummy_bank)
                    or _strategy_settlement(order, psp, dummy_bank, tolerance)
                    or _strategy_date_window(order, psp, dummy_bank, date_window, tolerance)
                )
                if result and result[0] - 20 > best_confidence:
                    best_confidence = result[0] - 20
                    best_result = MatchResult(
                        order_txn      = order,
                        psp_txn        = psp,
                        bank_txn       = None,
                        confidence     = result[0] - 20,
                        match_strategy = f"{result[1]}_no_bank",
                        amount_diff    = Decimal("0.00"),
                        date_diff_days = _date_diff(order, psp),
                        is_reconciled  = False,
                    )
                    bank_idx = None

        if best_result:
            matched.append(best_result)
            if best_result.psp_txn:
                idx = next(
                    (i for i, t in enumerate(psp_txns) if t is best_result.psp_txn), None
                )
                if idx is not None:
                    used_psp.add(idx)
            if best_result.bank_txn:
                idx = next(
                    (i for i, t in enumerate(bank_txns) if t is best_result.bank_txn), None
                )
                if idx is not None:
                    used_bank.add(idx)

    # ── Collect unmatched ────────────────────────────────────────────────────
    matched_order_ids  = {id(r.order_txn)  for r in matched if r.order_txn}
    matched_psp_ids    = {id(r.psp_txn)    for r in matched if r.psp_txn}
    matched_bank_ids   = {id(r.bank_txn)   for r in matched if r.bank_txn}

    unmatched_order = [t for t in order_txns if id(t) not in matched_order_ids]
    unmatched_psp   = [t for t in psp_txns   if id(t) not in matched_psp_ids]
    unmatched_bank  = [t for t in bank_txns  if id(t) not in matched_bank_ids]

    # ── Stats ────────────────────────────────────────────────────────────────
    total_max   = max(len(order_txns), len(psp_txns), len(bank_txns), 1)
    match_rate  = round(len(matched) / total_max * 100, 1)
    reconciled  = [r for r in matched if r.is_reconciled]
    recon_rate  = round(len(reconciled) / max(len(matched), 1) * 100, 1)

    logger.info(
        "Match complete: %d matched | %d unmatched_order | %d unmatched_psp | %d unmatched_bank "
        "| match_rate=%.1f%% | reconciled_rate=%.1f%%",
        len(matched), len(unmatched_order), len(unmatched_psp), len(unmatched_bank),
        match_rate, recon_rate,
    )

    return MatchReport(
        total_order      = len(order_txns),
        total_psp        = len(psp_txns),
        total_bank       = len(bank_txns),
        matched          = matched,
        unmatched_order  = unmatched_order,
        unmatched_psp    = unmatched_psp,
        unmatched_bank   = unmatched_bank,
        match_rate       = match_rate,
        reconciled_rate  = recon_rate,
        tolerance        = tolerance,
        run_at           = datetime.utcnow(),
    )
