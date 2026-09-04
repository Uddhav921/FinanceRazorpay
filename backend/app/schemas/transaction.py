"""
transaction.py — Pydantic schemas for the standardised transaction record.

Every data source (Order/Ledger, Razorpay/PSP, Bank Statement) is normalised
into this common shape before any further processing.
"""

from __future__ import annotations

from datetime import date as Date
from decimal import Decimal
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ─── Enums ────────────────────────────────────────────────────────────────────

class DataSourceType(str, Enum):
    """Which raw data source the record originated from."""
    ORDER_LEDGER = "order_ledger"
    RAZORPAY_PSP = "razorpay_psp"
    BANK_STATEMENT = "bank_statement"


class TransactionStatus(str, Enum):
    """Lifecycle status of a transaction."""
    CAPTURED    = "captured"
    SETTLED     = "settled"
    REFUNDED    = "refunded"
    FAILED      = "failed"
    PENDING     = "pending"
    UNKNOWN     = "unknown"


# ─── Standardised Transaction Schema ──────────────────────────────────────────

class TransactionBase(BaseModel):
    """
    Standardised fields that every transaction must have after normalisation.
    Mirrors the canonical schema defined in the architecture document.
    """

    # Identifiers
    transaction_id : Optional[str] = Field(None, description="Unique transaction ID from source")
    order_id       : Optional[str] = Field(None, description="Merchant order / reference ID")
    settlement_id  : Optional[str] = Field(None, description="PSP settlement / batch ID")
    merchant_id    : Optional[str] = Field(None, description="Merchant identifier")

    # Temporal
    date           : Optional[Date] = Field(None, description="Transaction date (YYYY-MM-DD)")

    # Amounts — all in the smallest precision (2 decimal places)
    gross_amount   : Decimal = Field(default=Decimal("0.00"), description="Gross transaction amount")
    fee_amount     : Decimal = Field(default=Decimal("0.00"), description="Platform / processing fee")
    tax_amount     : Decimal = Field(default=Decimal("0.00"), description="GST / tax on fee")
    tds_amount     : Decimal = Field(default=Decimal("0.00"), description="TDS deducted")
    refund_amount  : Decimal = Field(default=Decimal("0.00"), description="Total refunds")
    net_amount     : Decimal = Field(default=Decimal("0.00"), description="Net settled / credited amount")

    # Meta
    reference      : Optional[str]            = Field(None, description="UTR / bank reference / cheque no.")
    status         : TransactionStatus        = Field(TransactionStatus.UNKNOWN)
    currency       : str                      = Field(default="INR", max_length=3)

    # Source tracking
    source         : DataSourceType           = Field(..., description="Which data source this row came from")
    raw_row_index  : Optional[int]            = Field(None, description="Original row index in uploaded file")

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, v: str) -> str:
        return v.strip().upper()

    model_config = {"from_attributes": True}


# ─── Normalization Trace Schemas ─────────────────────────────────────────────────────

class NormalizationChange(BaseModel):
    """Documents a single field-level transformation applied during normalisation."""
    field   : str            # canonical field name
    before  : Optional[str] # raw value (stringified)
    after   : Optional[str] # normalised value (stringified)
    rule    : str            # human-readable rule that was applied


class NormalizationTrace(BaseModel):
    """Per-row audit trail of all normalisation changes applied."""
    row_index : int
    source    : DataSourceType
    changes   : List[NormalizationChange] = Field(default_factory=list)


# ─── Data Quality Schemas ─────────────────────────────────────────────────────

class QualityFlag(BaseModel):
    """A single data-quality issue found on one row."""
    row_index  : int
    issue_type : str          # duplicate | missing_field | format_error
    severity   : str          # error | warning
    field      : Optional[str] = None
    message    : str


class QualityReport(BaseModel):
    """Aggregated quality report for one uploaded file."""
    total_rows          : int            = 0
    duplicate_count     : int            = 0
    missing_field_count : int            = 0
    format_error_count  : int            = 0
    warning_count       : int            = 0
    quality_score       : float          = 100.0   # 0–100
    flagged_rows        : List[QualityFlag] = Field(default_factory=list)


# ─── Upload Response Schema ────────────────────────────────────────────────────

class UploadSummary(BaseModel):
    """Returned after a successful file upload, parse, normalise & quality check."""
    filename              : str
    source                : DataSourceType
    total_rows            : int
    valid_rows            : int
    skipped_rows          : int
    normalised_count      : int                      = 0
    parse_errors          : list[str]                = []
    quality_report        : Optional[QualityReport]  = None
    normalization_traces  : List[NormalizationTrace] = Field(default_factory=list)
    transactions          : list[TransactionBase]    = []
