"""
normalizer.py — Ingestion Layer: Step 2 (Schema Normalisation)

After the raw parser maps source-specific columns into TransactionBase,
this module:
  • Cleans and coerces every field to its canonical type
  • Fills in derived / calculable fields where possible
  • Applies per-source business rules (e.g. sign conventions)
  • Returns a fully-normalised list ready for Data Quality checks
"""

from __future__ import annotations

import logging
from decimal import Decimal

from app.schemas.transaction import DataSourceType, TransactionBase, TransactionStatus

logger = logging.getLogger(__name__)


# ─── Field-level helpers ──────────────────────────────────────────────────────

def _clean_id(value: str | None) -> str | None:
    """Strip whitespace; return None for empty / dash placeholders."""
    if not value:
        return None
    v = str(value).strip()
    return None if v in ("", "-", "N/A", "NA", "None", "null", "nan") else v


def _coerce_amount(value: Decimal) -> Decimal:
    """Return absolute value rounded to 2 decimal places."""
    return abs(value).quantize(Decimal("0.01"))


def _derive_net(txn: TransactionBase) -> Decimal:
    """
    Compute net_amount when it is zero/missing but components are present.
      net = gross − fee − tax − tds − refunds
    """
    if txn.net_amount and txn.net_amount != Decimal("0.00"):
        return txn.net_amount
    derived = (
        txn.gross_amount
        - txn.fee_amount
        - txn.tax_amount
        - txn.tds_amount
        - txn.refund_amount
    )
    return max(derived, Decimal("0.00"))


def _infer_status(txn: TransactionBase) -> TransactionStatus:
    """Infer status from amounts when status is UNKNOWN."""
    if txn.status != TransactionStatus.UNKNOWN:
        return txn.status
    if txn.refund_amount > 0 and txn.gross_amount == 0:
        return TransactionStatus.REFUNDED
    if txn.gross_amount > 0:
        return TransactionStatus.CAPTURED
    return TransactionStatus.UNKNOWN


# ─── Source-specific rules ────────────────────────────────────────────────────

def _apply_source_rules(txn: TransactionBase) -> TransactionBase:
    """Apply per-source business rules after generic normalisation."""
    if txn.source == DataSourceType.BANK_STATEMENT:
        # Credits → SETTLED, Debits (refund_amount > 0, gross = 0) → REFUNDED
        if txn.gross_amount > 0 and txn.refund_amount == 0:
            return txn.model_copy(update={
                "net_amount": txn.gross_amount,
                "status": TransactionStatus.SETTLED,
            })
        if txn.refund_amount > 0 and txn.gross_amount == 0:
            return txn.model_copy(update={
                "net_amount": Decimal("0.00"),
                "status": TransactionStatus.REFUNDED,
            })
    return txn


# ─── Public API ───────────────────────────────────────────────────────────────

def normalise(transactions: list[TransactionBase]) -> list[TransactionBase]:
    """
    Normalise a list of parsed transactions in-place (via model_copy).

    Pipeline per row
    ────────────────
    1. Clean identifier strings (strip noise, null-out placeholders)
    2. Coerce all amounts → absolute 2-dp Decimal
    3. Derive net_amount from components if missing
    4. Infer status from amounts when UNKNOWN
    5. Normalise currency to uppercase 3-letter code
    6. Apply source-specific sign/status rules
    """
    result: list[TransactionBase] = []

    for txn in transactions:
        try:
            updates: dict = {
                # 1 — identifiers
                "transaction_id": _clean_id(txn.transaction_id),
                "order_id":       _clean_id(txn.order_id),
                "settlement_id":  _clean_id(txn.settlement_id),
                "merchant_id":    _clean_id(txn.merchant_id),
                "reference":      _clean_id(txn.reference),
                # 2 — amounts
                "gross_amount":   _coerce_amount(txn.gross_amount),
                "fee_amount":     _coerce_amount(txn.fee_amount),
                "tax_amount":     _coerce_amount(txn.tax_amount),
                "tds_amount":     _coerce_amount(txn.tds_amount),
                "refund_amount":  _coerce_amount(txn.refund_amount),
                # 5 — currency
                "currency": (txn.currency or "INR").strip().upper()[:3],
            }

            step1 = txn.model_copy(update=updates)

            # 3 — derive net
            updates["net_amount"] = _derive_net(step1)
            step2 = step1.model_copy(update=updates)

            # 4 — infer status
            updates["status"] = _infer_status(step2)
            step3 = step2.model_copy(update=updates)

            # 6 — source rules
            result.append(_apply_source_rules(step3))

        except Exception as exc:
            logger.warning("Normalisation skipped row %s: %s", txn.raw_row_index, exc)
            result.append(txn)

    logger.info("Normalised %d transactions", len(result))
    return result
