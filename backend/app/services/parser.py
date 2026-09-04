"""
parser.py — Data Sources Module (Step 1 of the pipeline)

Responsible for:
  • Detecting file type (CSV / XLSX)
  • Reading raw rows into a pandas DataFrame
  • Dispatching to the correct source-specific column mapper
  • Returning a list of standardised TransactionBase objects + errors

Supported data sources
──────────────────────
  1. Order / Ledger      (merchant ERP / internal system export)
  2. Razorpay / PSP      (settlement report)
  3. Bank Statement      (bank credit / debit statement)

Each source may use different column names, date formats, and amount signs.
The mapper functions normalise everything into the canonical TransactionBase.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from datetime import date as Date
from decimal import Decimal, InvalidOperation
from typing import Any

import pandas as pd

from app.schemas.transaction import (
    DataSourceType,
    QualityReport,
    TransactionBase,
    TransactionStatus,
    UploadSummary,
)

logger = logging.getLogger(__name__)

# ─── Types ────────────────────────────────────────────────────────────────────

@dataclass
class ParseResult:
    transactions: list[TransactionBase] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    skipped: int = 0


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe_decimal(value: Any, default: Decimal = Decimal("0.00")) -> Decimal:
    """Convert any value to Decimal; return default on failure."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return default


def _safe_str(value: Any) -> str | None:
    """Safely convert to stripped string; return None for NaN/None."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    return str(value).strip() or None


def _parse_date(value: Any) -> Date | None:
    """Try to parse a date value into a Python date object."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, Date):
        return value
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%b-%Y", "%Y%m%d"):
        try:
            return pd.to_datetime(str(value), format=fmt).date()
        except Exception:
            continue
    try:
        return pd.to_datetime(str(value), dayfirst=True, infer_datetime_format=True).date()
    except Exception:
        return None


def _map_status(raw: Any) -> TransactionStatus:
    """Map source-specific status strings to TransactionStatus enum."""
    if not raw:
        return TransactionStatus.UNKNOWN
    mapping = {
        "captured"  : TransactionStatus.CAPTURED,
        "settled"   : TransactionStatus.SETTLED,
        "refunded"  : TransactionStatus.REFUNDED,
        "failed"    : TransactionStatus.FAILED,
        "pending"   : TransactionStatus.PENDING,
        "success"   : TransactionStatus.CAPTURED,
        "processed" : TransactionStatus.SETTLED,
        "cr"        : TransactionStatus.SETTLED,   # bank credit
        "dr"        : TransactionStatus.REFUNDED,  # bank debit
    }
    return mapping.get(str(raw).strip().lower(), TransactionStatus.UNKNOWN)


def _read_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or XLSX bytes into a DataFrame."""
    name = filename.lower()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(file_bytes), dtype=str, keep_default_na=False)
    elif name.endswith((".xlsx", ".xls")):
        engine = "openpyxl" if name.endswith(".xlsx") else "xlrd"
        return pd.read_excel(io.BytesIO(file_bytes), dtype=str, keep_default_na=False, engine=engine)
    else:
        raise ValueError(f"Unsupported file type: '{filename}'. Only CSV and XLSX/XLS are accepted.")


def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Strip whitespace and lowercase all column headers."""
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df


# ─── Source-Specific Mappers ──────────────────────────────────────────────────

# Each mapper receives a single dict (one DataFrame row) and the row index,
# and returns a TransactionBase or raises ValueError with a description.

def _map_order_ledger(row: dict, idx: int) -> TransactionBase:
    """
    Order / Ledger mapper.

    Expected columns (flexible — missing ones default to None / 0):
      transaction_id | order_id | date | gross_amount | fee_amount |
      tax_amount | tds_amount | refund_amount | net_amount |
      status | currency | merchant_id | reference | settlement_id
    """
    return TransactionBase(
        source         = DataSourceType.ORDER_LEDGER,
        transaction_id = _safe_str(row.get("transaction_id") or row.get("txn_id") or row.get("id")),
        order_id       = _safe_str(row.get("order_id") or row.get("order_ref")),
        settlement_id  = _safe_str(row.get("settlement_id")),
        merchant_id    = _safe_str(row.get("merchant_id") or row.get("mid")),
        date           = _parse_date(row.get("date") or row.get("transaction_date") or row.get("created_at")),
        gross_amount   = _safe_decimal(row.get("gross_amount") or row.get("amount")),
        fee_amount     = _safe_decimal(row.get("fee_amount") or row.get("fee") or row.get("platform_fee")),
        tax_amount     = _safe_decimal(row.get("tax_amount") or row.get("gst") or row.get("tax")),
        tds_amount     = _safe_decimal(row.get("tds_amount") or row.get("tds")),
        refund_amount  = _safe_decimal(row.get("refund_amount") or row.get("refund")),
        net_amount     = _safe_decimal(row.get("net_amount") or row.get("net")),
        reference      = _safe_str(row.get("reference") or row.get("utr") or row.get("bank_ref")),
        status         = _map_status(row.get("status")),
        currency       = _safe_str(row.get("currency")) or "INR",
        raw_row_index  = idx,
    )


def _map_razorpay_psp(row: dict, idx: int) -> TransactionBase:
    """
    Razorpay / PSP Settlement Report mapper.

    Razorpay settlement CSV typically has columns like:
      entity_id | type | debit | credit | amount | fee | tax | settled_at |
      settlement_id | description | currency
    We treat 'credit' rows as settled amounts; 'debit' as refunds.
    """
    # Determine amounts from debit/credit columns if explicit columns missing
    gross   = _safe_decimal(row.get("amount") or row.get("gross_amount") or row.get("credit"))
    fee     = _safe_decimal(row.get("fee") or row.get("fee_amount"))
    tax     = _safe_decimal(row.get("tax") or row.get("tax_amount"))
    tds     = _safe_decimal(row.get("tds") or row.get("tds_amount"))
    refund  = _safe_decimal(row.get("refund") or row.get("refund_amount") or row.get("debit"))
    net     = _safe_decimal(row.get("net_amount") or row.get("net") or row.get("credit_amount"))

    return TransactionBase(
        source         = DataSourceType.RAZORPAY_PSP,
        transaction_id = _safe_str(row.get("entity_id") or row.get("transaction_id") or row.get("payment_id")),
        order_id       = _safe_str(row.get("order_id") or row.get("description")),
        settlement_id  = _safe_str(row.get("settlement_id") or row.get("settlement_utr")),
        merchant_id    = _safe_str(row.get("merchant_id") or row.get("mid")),
        date           = _parse_date(row.get("settled_at") or row.get("created_at") or row.get("date")),
        gross_amount   = gross,
        fee_amount     = fee,
        tax_amount     = tax,
        tds_amount     = tds,
        refund_amount  = refund,
        net_amount     = net,
        reference      = _safe_str(row.get("settlement_utr") or row.get("utr") or row.get("reference")),
        status         = _map_status(row.get("type") or row.get("status")),
        currency       = _safe_str(row.get("currency")) or "INR",
        raw_row_index  = idx,
    )


def _map_bank_statement(row: dict, idx: int) -> TransactionBase:
    """
    Bank Statement mapper.

    Bank statements usually have:
      date | description / narration | debit | credit | balance | reference / utr
    We treat 'credit' as net_amount (positive inflow) and 'debit' as refund.
    """
    credit = _safe_decimal(row.get("credit") or row.get("credit_amount") or row.get("deposit"))
    debit  = _safe_decimal(row.get("debit") or row.get("debit_amount") or row.get("withdrawal"))
    net    = credit if credit > 0 else -debit

    return TransactionBase(
        source         = DataSourceType.BANK_STATEMENT,
        transaction_id = _safe_str(row.get("transaction_id") or row.get("txn_id") or row.get("cheque_no")),
        order_id       = None,
        settlement_id  = _safe_str(row.get("settlement_id")),
        merchant_id    = _safe_str(row.get("merchant_id")),
        date           = _parse_date(row.get("date") or row.get("value_date") or row.get("transaction_date")),
        gross_amount   = credit,
        fee_amount     = Decimal("0.00"),
        tax_amount     = Decimal("0.00"),
        tds_amount     = Decimal("0.00"),
        refund_amount  = debit,
        net_amount     = net,
        reference      = _safe_str(row.get("utr") or row.get("reference") or row.get("narration") or row.get("description")),
        status         = _map_status("cr" if credit > 0 else "dr"),
        currency       = _safe_str(row.get("currency")) or "INR",
        raw_row_index  = idx,
    )


# ─── Dispatcher ───────────────────────────────────────────────────────────────

_MAPPER = {
    DataSourceType.ORDER_LEDGER  : _map_order_ledger,
    DataSourceType.RAZORPAY_PSP  : _map_razorpay_psp,
    DataSourceType.BANK_STATEMENT: _map_bank_statement,
}


# ─── Public API ───────────────────────────────────────────────────────────────

def parse_file(
    file_bytes: bytes,
    filename: str,
    source: DataSourceType,
) -> ParseResult:
    """
    Parse an uploaded CSV / XLSX file for the given data source.

    Parameters
    ----------
    file_bytes : raw bytes of the uploaded file
    filename   : original filename (used for extension detection)
    source     : which data source type this file represents

    Returns
    -------
    ParseResult containing standardised transactions and any row-level errors.
    """
    result = ParseResult()
    mapper = _MAPPER[source]

    try:
        df = _read_file(file_bytes, filename)
    except ValueError as e:
        result.errors.append(str(e))
        return result

    if df.empty:
        result.errors.append("The uploaded file contains no data rows.")
        return result

    df = _normalise_columns(df)

    logger.info(
        "Parsing '%s' as '%s' — %d rows, columns: %s",
        filename, source.value, len(df), list(df.columns),
    )

    rows = df.to_dict(orient="records")

    for idx, row in enumerate(rows, start=1):
        try:
            txn = mapper(row, idx)
            result.transactions.append(txn)
        except Exception as exc:
            msg = f"Row {idx}: {exc}"
            logger.warning(msg)
            result.errors.append(msg)
            result.skipped += 1

    logger.info(
        "Parsed %d valid, %d skipped from '%s'",
        len(result.transactions), result.skipped, filename,
    )
    return result


def build_upload_summary(
    filename: str,
    source: DataSourceType,
    result: ParseResult,
    include_transactions: bool = True,
    normalised_count: int = 0,
    quality_report: QualityReport | None = None,
    normalization_traces: list | None = None,
) -> UploadSummary:
    """Wrap a ParseResult (+ optional normalisation & quality data) into the API response schema."""
    total = len(result.transactions) + result.skipped
    return UploadSummary(
        filename              = filename,
        source                = source,
        total_rows            = total,
        valid_rows            = len(result.transactions),
        skipped_rows          = result.skipped,
        normalised_count      = normalised_count,
        parse_errors          = result.errors,
        quality_report        = quality_report,
        normalization_traces  = normalization_traces or [],
        transactions          = result.transactions if include_transactions else [],
    )
