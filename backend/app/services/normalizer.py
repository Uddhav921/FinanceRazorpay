"""
normalizer.py — Ingestion Layer: Step 2 / Normalization & Schema Mapping: Step 3

After the raw parser maps source-specific columns into TransactionBase,
this module:
  • Cleans and coerces every field to its canonical type
  • Fills in derived / calculable fields where possible
  • Applies per-source business rules (e.g. sign conventions)
  • Returns a fully-normalised list ready for Data Quality checks

Also exposes normalise_with_trace() which records per-field changes
for the Normalization & Schema Mapping audit trail.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Optional

from app.schemas.transaction import (
    DataSourceType,
    NormalizationChange,
    NormalizationTrace,
    TransactionBase,
    TransactionStatus,
)

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
    Normalise a list of parsed transactions (via model_copy).

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


def normalise_with_trace(
    transactions: list[TransactionBase],
) -> tuple[list[TransactionBase], list[NormalizationTrace]]:
    """
    Normalise transactions AND produce a per-row audit trail of every
    field-level change made.

    Returns
    -------
    (normalised_transactions, traces)
    traces : one NormalizationTrace per row that had at least one change.
    """
    normalised: list[TransactionBase] = []
    traces:     list[NormalizationTrace] = []

    for txn in transactions:
        changes: list[NormalizationChange] = []
        idx = txn.raw_row_index or 0

        try:
            # ── Step 1: Clean identifiers ────────────────────────────────────
            id_fields = {
                "transaction_id": ("transaction_id", "Stripped whitespace; nulled empty/placeholder values"),
                "order_id":       ("order_id",        "Stripped whitespace; nulled empty/placeholder values"),
                "settlement_id":  ("settlement_id",   "Stripped whitespace; nulled empty/placeholder values"),
                "merchant_id":    ("merchant_id",     "Stripped whitespace; nulled empty/placeholder values"),
                "reference":      ("reference",       "Stripped whitespace; nulled empty/placeholder values (N/A, -, null, etc.)"),
            }
            id_updates: dict = {}
            for canon, (attr, rule) in id_fields.items():
                raw = getattr(txn, attr)
                cleaned = _clean_id(raw)
                id_updates[canon] = cleaned
                if str(raw) != str(cleaned):
                    changes.append(NormalizationChange(
                        field=canon, before=str(raw), after=str(cleaned), rule=rule,
                    ))

            # ── Step 2: Coerce amounts ────────────────────────────────────────
            amt_fields = {
                "gross_amount":  "Coerced to absolute value, rounded to 2dp",
                "fee_amount":    "Coerced to absolute value, rounded to 2dp",
                "tax_amount":    "Coerced to absolute value, rounded to 2dp",
                "tds_amount":    "Coerced to absolute value, rounded to 2dp",
                "refund_amount": "Coerced to absolute value, rounded to 2dp",
            }
            amt_updates: dict = {}
            for field_name, rule in amt_fields.items():
                raw_val = getattr(txn, field_name)
                coerced = _coerce_amount(raw_val)
                amt_updates[field_name] = coerced
                if raw_val != coerced:
                    changes.append(NormalizationChange(
                        field=field_name, before=str(raw_val), after=str(coerced), rule=rule,
                    ))

            # ── Step 5: Currency ──────────────────────────────────────────────
            raw_cur = txn.currency or ""
            norm_cur = (txn.currency or "INR").strip().upper()[:3]
            if raw_cur != norm_cur:
                changes.append(NormalizationChange(
                    field="currency", before=raw_cur, after=norm_cur,
                    rule="Uppercased and truncated to 3 chars; defaulted to INR if missing",
                ))

            step1 = txn.model_copy(update={**id_updates, **amt_updates, "currency": norm_cur})

            # ── Step 3: Derive net_amount ─────────────────────────────────────
            derived_net = _derive_net(step1)
            if txn.net_amount != derived_net:
                formula = f"gross({step1.gross_amount}) − fee({step1.fee_amount}) − tax({step1.tax_amount}) − tds({step1.tds_amount}) − refund({step1.refund_amount})"
                changes.append(NormalizationChange(
                    field="net_amount", before=str(txn.net_amount), after=str(derived_net),
                    rule=f"DERIVED: {formula}",
                ))
            step2 = step1.model_copy(update={"net_amount": derived_net})

            # ── Step 4: Infer status ──────────────────────────────────────────
            inferred = _infer_status(step2)
            if txn.status != inferred:
                changes.append(NormalizationChange(
                    field="status", before=txn.status.value, after=inferred.value,
                    rule="INFERRED from amounts (refund>0 & gross=0 → REFUNDED; gross>0 → CAPTURED)",
                ))
            step3 = step2.model_copy(update={"status": inferred})

            # ── Step 6: Source rules ──────────────────────────────────────────
            before_source = step3.model_copy()
            final = _apply_source_rules(step3)
            if final.net_amount != before_source.net_amount:
                changes.append(NormalizationChange(
                    field="net_amount", before=str(before_source.net_amount), after=str(final.net_amount),
                    rule=f"SOURCE RULE ({txn.source.value}): bank credit → net = gross_amount",
                ))
            if final.status != before_source.status:
                changes.append(NormalizationChange(
                    field="status", before=before_source.status.value, after=final.status.value,
                    rule=f"SOURCE RULE ({txn.source.value}): bank credit → SETTLED; bank debit → REFUNDED",
                ))

            normalised.append(final)

            if changes:
                traces.append(NormalizationTrace(
                    row_index=idx, source=txn.source, changes=changes,
                ))

        except Exception as exc:
            logger.warning("Normalisation (with trace) skipped row %s: %s", idx, exc)
            normalised.append(txn)

    changed_rows = len(traces)
    total_changes = sum(len(t.changes) for t in traces)
    logger.info(
        "Normalised %d rows with trace | %d rows changed | %d field-level transforms",
        len(normalised), changed_rows, total_changes,
    )
    return normalised, traces
