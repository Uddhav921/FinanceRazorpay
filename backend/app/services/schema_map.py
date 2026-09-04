"""
schema_map.py — Normalization & Schema Mapping: Column Alias Registry

This module is the single source of truth for:

  1. CANONICAL_FIELDS   — the 14 standardised fields every transaction must have
                          after normalisation, with type, category and description.

  2. SOURCE_MAPPINGS    — for each data source, the ordered list of raw column
                          names that are tried (in priority order) when mapping
                          to each canonical field.

  3. NORMALIZATION_RULES — human-readable description of what the normaliser does
                           to each field (cleaning, coercing, deriving).

Exposed via GET /schema/mapping and GET /schema/fields.
"""

from __future__ import annotations

from typing import Any

# ─── Canonical Field Definitions ─────────────────────────────────────────────

CANONICAL_FIELDS: list[dict[str, Any]] = [
    # ── Identifiers ──────────────────────────────────────────────────────────
    {
        "field":       "transaction_id",
        "type":        "string",
        "category":    "identifier",
        "required":    True,
        "description": "Unique transaction / payment ID from the source system.",
        "example":     "TXN20240115001",
        "norm_rule":   "Stripped of whitespace; empty / dash / NA placeholders → null.",
    },
    {
        "field":       "order_id",
        "type":        "string",
        "category":    "identifier",
        "required":    False,
        "description": "Merchant-side order or reference ID.",
        "example":     "ORD-20240115-042",
        "norm_rule":   "Stripped of whitespace; empty / dash / NA placeholders → null.",
    },
    {
        "field":       "settlement_id",
        "type":        "string",
        "category":    "identifier",
        "required":    False,
        "description": "PSP settlement batch or UTR for the settlement transfer.",
        "example":     "SETL20240116XYZ",
        "norm_rule":   "Stripped of whitespace; empty / dash / NA placeholders → null.",
    },
    {
        "field":       "merchant_id",
        "type":        "string",
        "category":    "identifier",
        "required":    False,
        "description": "Unique identifier for the merchant / sub-merchant.",
        "example":     "MID_001",
        "norm_rule":   "Stripped of whitespace; empty / dash / NA placeholders → null.",
    },
    # ── Temporal ─────────────────────────────────────────────────────────────
    {
        "field":       "date",
        "type":        "date (YYYY-MM-DD)",
        "category":    "temporal",
        "required":    True,
        "description": "Transaction date. Accepts multiple input formats; always output as ISO-8601.",
        "example":     "2024-01-15",
        "norm_rule":   "Parsed with multiple format attempts (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, etc.). Future dates flagged as format errors.",
    },
    # ── Amounts ──────────────────────────────────────────────────────────────
    {
        "field":       "gross_amount",
        "type":        "decimal (2dp)",
        "category":    "amount",
        "required":    True,
        "description": "Full transaction value before any deductions.",
        "example":     "1000.00",
        "norm_rule":   "Coerced to absolute value, rounded to 2 decimal places.",
    },
    {
        "field":       "fee_amount",
        "type":        "decimal (2dp)",
        "category":    "amount",
        "required":    False,
        "description": "Platform / processing fee charged by the PSP.",
        "example":     "20.00",
        "norm_rule":   "Coerced to absolute value, rounded to 2 decimal places. Defaults to 0.00.",
    },
    {
        "field":       "tax_amount",
        "type":        "decimal (2dp)",
        "category":    "amount",
        "required":    False,
        "description": "GST / tax levied on the platform fee.",
        "example":     "3.60",
        "norm_rule":   "Coerced to absolute value, rounded to 2 decimal places. Defaults to 0.00.",
    },
    {
        "field":       "tds_amount",
        "type":        "decimal (2dp)",
        "category":    "amount",
        "required":    False,
        "description": "Tax Deducted at Source (TDS) withheld.",
        "example":     "1.00",
        "norm_rule":   "Coerced to absolute value, rounded to 2 decimal places. Defaults to 0.00.",
    },
    {
        "field":       "refund_amount",
        "type":        "decimal (2dp)",
        "category":    "amount",
        "required":    False,
        "description": "Total refunds issued against this transaction.",
        "example":     "0.00",
        "norm_rule":   "Coerced to absolute value, rounded to 2 decimal places. Defaults to 0.00.",
    },
    {
        "field":       "net_amount",
        "type":        "decimal (2dp)",
        "category":    "amount",
        "required":    False,
        "description": "Net amount settled / credited. Derived if missing: gross − fee − tax − tds − refund.",
        "example":     "975.40",
        "norm_rule":   "DERIVED when missing or zero: gross − fee − tax − tds − refund. Clamped to 0.00 minimum. Bank credits: net = gross_amount.",
    },
    # ── Meta ─────────────────────────────────────────────────────────────────
    {
        "field":       "reference",
        "type":        "string",
        "category":    "meta",
        "required":    False,
        "description": "UTR number, bank reference, cheque number, or narration.",
        "example":     "UTR202401150001",
        "norm_rule":   "Stripped of whitespace; empty / dash / NA placeholders → null.",
    },
    {
        "field":       "status",
        "type":        "enum",
        "category":    "meta",
        "required":    False,
        "description": "Transaction lifecycle status. Inferred from amounts when source status is unknown.",
        "example":     "settled",
        "enum_values": ["captured", "settled", "refunded", "failed", "pending", "unknown"],
        "norm_rule":   "INFERRED when UNKNOWN: refund_amount > 0 and gross = 0 → refunded; gross > 0 → captured. Bank credits → settled; debits → refunded.",
    },
    {
        "field":       "currency",
        "type":        "string (ISO-4217)",
        "category":    "meta",
        "required":    False,
        "description": "3-letter ISO-4217 currency code.",
        "example":     "INR",
        "norm_rule":   "Uppercased and truncated to 3 characters. Defaults to INR.",
    },
]


# ─── Source Column Alias Mappings ─────────────────────────────────────────────
# For each source, lists the raw column names tried (in priority order)
# that are mapped to each canonical field.

SOURCE_MAPPINGS: dict[str, dict[str, list[str]]] = {
    "order_ledger": {
        "transaction_id": ["transaction_id", "txn_id", "id"],
        "order_id":       ["order_id", "order_ref"],
        "settlement_id":  ["settlement_id"],
        "merchant_id":    ["merchant_id", "mid"],
        "date":           ["date", "transaction_date", "created_at"],
        "gross_amount":   ["gross_amount", "amount"],
        "fee_amount":     ["fee_amount", "fee", "platform_fee"],
        "tax_amount":     ["tax_amount", "gst", "tax"],
        "tds_amount":     ["tds_amount", "tds"],
        "refund_amount":  ["refund_amount", "refund"],
        "net_amount":     ["net_amount", "net"],
        "reference":      ["reference", "utr", "bank_ref"],
        "status":         ["status"],
        "currency":       ["currency"],
    },
    "razorpay_psp": {
        "transaction_id": ["entity_id", "transaction_id", "payment_id"],
        "order_id":       ["order_id", "description"],
        "settlement_id":  ["settlement_id", "settlement_utr"],
        "merchant_id":    ["merchant_id", "mid"],
        "date":           ["settled_at", "created_at", "date"],
        "gross_amount":   ["amount", "gross_amount", "credit"],
        "fee_amount":     ["fee", "fee_amount"],
        "tax_amount":     ["tax", "tax_amount"],
        "tds_amount":     ["tds", "tds_amount"],
        "refund_amount":  ["refund", "refund_amount", "debit"],
        "net_amount":     ["net_amount", "net", "credit_amount"],
        "reference":      ["settlement_utr", "utr", "reference"],
        "status":         ["type", "status"],
        "currency":       ["currency"],
    },
    "bank_statement": {
        "transaction_id": ["transaction_id", "txn_id", "cheque_no"],
        "order_id":       [],   # Not available in bank statements
        "settlement_id":  ["settlement_id"],
        "merchant_id":    ["merchant_id"],
        "date":           ["date", "value_date", "transaction_date"],
        "gross_amount":   ["credit", "credit_amount", "deposit"],
        "fee_amount":     [],   # Not available — defaults to 0
        "tax_amount":     [],   # Not available — defaults to 0
        "tds_amount":     [],   # Not available — defaults to 0
        "refund_amount":  ["debit", "debit_amount", "withdrawal"],
        "net_amount":     [],   # DERIVED: credit if credit > 0, else -debit
        "reference":      ["utr", "reference", "narration", "description"],
        "status":         [],   # INFERRED: credit → settled, debit → refunded
        "currency":       ["currency"],
    },
}


# ─── Normalization Rules Summary ──────────────────────────────────────────────

NORMALIZATION_PIPELINE: list[dict[str, str]] = [
    {
        "step":        "1. Clean Identifiers",
        "fields":      "transaction_id, order_id, settlement_id, merchant_id, reference",
        "description": "Strip whitespace. Null out empty strings, dashes, N/A, NA, None, null, nan.",
    },
    {
        "step":        "2. Coerce Amounts",
        "fields":      "gross_amount, fee_amount, tax_amount, tds_amount, refund_amount",
        "description": "Convert to absolute Decimal value rounded to 2 decimal places.",
    },
    {
        "step":        "3. Derive net_amount",
        "fields":      "net_amount",
        "description": "If net_amount is 0 or missing: net = gross − fee − tax − tds − refund. Clamped ≥ 0.",
    },
    {
        "step":        "4. Infer Status",
        "fields":      "status",
        "description": "If UNKNOWN: refund > 0 and gross = 0 → REFUNDED; gross > 0 → CAPTURED.",
    },
    {
        "step":        "5. Normalise Currency",
        "fields":      "currency",
        "description": "Strip, uppercase, truncate to 3 chars. Default to INR if missing.",
    },
    {
        "step":        "6. Source-Specific Rules",
        "fields":      "net_amount, status",
        "description": "Bank Statement: credit rows → net = gross, status = SETTLED. Debit rows → net = 0, status = REFUNDED.",
    },
]


# ─── Public API ───────────────────────────────────────────────────────────────

def get_schema_map() -> dict:
    """Return the full schema map for the API response."""
    return {
        "canonical_fields":      CANONICAL_FIELDS,
        "source_mappings":       SOURCE_MAPPINGS,
        "normalization_pipeline": NORMALIZATION_PIPELINE,
        "total_canonical_fields": len(CANONICAL_FIELDS),
        "sources_supported":     list(SOURCE_MAPPINGS.keys()),
    }


def get_canonical_fields() -> list[dict]:
    """Return just the canonical field definitions."""
    return CANONICAL_FIELDS
