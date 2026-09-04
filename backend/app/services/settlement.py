"""
settlement.py — Settlement Calculation Engine: Step 5

Computes the Expected Net Settlement for every PSP transaction:

  Expected Net = Gross Amount
               − Platform / Processing Fee
               − GST / Tax on Fee
               − TDS
               − Refunds
               − Other Adjustments (configurable per merchant/PSP)

Supports:
  • Per-transaction calculation
  • Per-batch (settlement_id) aggregation
  • Configurable merchant/PSP fee rules (MerchantConfig)
"""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from app.schemas.transaction import SettlementBreakdown, TransactionBase

logger = logging.getLogger(__name__)

# ─── Merchant / PSP Configuration ────────────────────────────────────────────

@dataclass
class MerchantConfig:
    """
    Per-merchant / per-PSP fee configuration.
    All rates are percentages (e.g. 2.0 means 2%).
    Amounts are absolute Decimal values in INR.
    """
    merchant_id        : Optional[str] = None
    # Override rates — if None, use the transaction's own field value
    fee_rate_pct       : Optional[Decimal] = None   # % of gross; overrides fee_amount
    tax_rate_pct       : Optional[Decimal] = None   # % of fee;   overrides tax_amount
    tds_rate_pct       : Optional[Decimal] = None   # % of gross; overrides tds_amount
    # Fixed adjustment (e.g. platform subscription, chargeback reserve)
    other_adjustments  : Decimal = Decimal("0.00")
    # Tolerance for this merchant (%) — can override global tolerance
    tolerance_pct      : Optional[Decimal] = None


# Default config used when no merchant-specific config is found
DEFAULT_CONFIG = MerchantConfig()


# ─── Per-transaction calculation ─────────────────────────────────────────────

def compute_settlement(
    txn    : TransactionBase,
    config : MerchantConfig = DEFAULT_CONFIG,
) -> SettlementBreakdown:
    """
    Compute the expected net settlement for a single PSP transaction.

    Priority for each component:
      1. Config-specified rate (calculated from gross)
      2. Transaction's own field value (already normalised)
      3. Zero (default)
    """
    gross = txn.gross_amount

    # ── Fee ──────────────────────────────────────────────────────────────────
    if config.fee_rate_pct is not None:
        fee = (gross * config.fee_rate_pct / 100).quantize(Decimal("0.01"))
    else:
        fee = txn.fee_amount

    # ── Tax (GST on fee) ─────────────────────────────────────────────────────
    if config.tax_rate_pct is not None:
        tax = (fee * config.tax_rate_pct / 100).quantize(Decimal("0.01"))
    else:
        tax = txn.tax_amount

    # ── TDS ──────────────────────────────────────────────────────────────────
    if config.tds_rate_pct is not None:
        tds = (gross * config.tds_rate_pct / 100).quantize(Decimal("0.01"))
    else:
        tds = txn.tds_amount

    # ── Refunds & Adjustments ─────────────────────────────────────────────────
    refund      = txn.refund_amount
    adjustments = config.other_adjustments

    # ── Expected Net ──────────────────────────────────────────────────────────
    expected_net = max(
        gross - fee - tax - tds - refund - adjustments,
        Decimal("0.00"),
    )

    return SettlementBreakdown(
        gross_amount      = gross,
        fee_amount        = fee,
        tax_amount        = tax,
        tds_amount        = tds,
        refund_amount     = refund,
        other_adjustments = adjustments,
        expected_net      = expected_net,
    )


# ─── Batch (per settlement_id) aggregation ───────────────────────────────────

@dataclass
class BatchSettlement:
    """Aggregated settlement figures for one settlement batch."""
    settlement_id       : Optional[str]
    transaction_count   : int     = 0
    total_gross         : Decimal = Decimal("0.00")
    total_fee           : Decimal = Decimal("0.00")
    total_tax           : Decimal = Decimal("0.00")
    total_tds           : Decimal = Decimal("0.00")
    total_refund        : Decimal = Decimal("0.00")
    total_adjustments   : Decimal = Decimal("0.00")
    total_expected_net  : Decimal = Decimal("0.00")


def compute_batch_settlement(
    txns   : list[TransactionBase],
    config : MerchantConfig = DEFAULT_CONFIG,
) -> dict[Optional[str], BatchSettlement]:
    """
    Compute aggregated settlement for each settlement_id group.

    Returns a dict keyed by settlement_id (None for ungrouped rows).
    """
    batches: dict[Optional[str], BatchSettlement] = {}

    for txn in txns:
        sid = txn.settlement_id
        if sid not in batches:
            batches[sid] = BatchSettlement(settlement_id=sid)

        bd = compute_settlement(txn, config)
        b  = batches[sid]

        b.transaction_count  += 1
        b.total_gross        += bd.gross_amount
        b.total_fee          += bd.fee_amount
        b.total_tax          += bd.tax_amount
        b.total_tds          += bd.tds_amount
        b.total_refund       += bd.refund_amount
        b.total_adjustments  += bd.other_adjustments
        b.total_expected_net += bd.expected_net

    logger.info(
        "Batch settlement: %d transactions → %d batches",
        len(txns), len(batches),
    )
    return batches
