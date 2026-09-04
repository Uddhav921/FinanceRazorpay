"""
data_quality.py — Ingestion Layer: Step 3 (Data Quality Checks)

After normalisation this module runs three classes of checks against
the list of TransactionBase records and produces a detailed QualityReport.

Quality Checks
──────────────
1. Duplicate Rows
   Hash key: (transaction_id, date, gross_amount, source)
   Any two rows sharing the same hash are flagged as DUPLICATE.

2. Missing Fields
   Required  → transaction_id, date, gross_amount  (flagged as ERROR)
   Suggested → reference                            (flagged as WARNING)

3. Format Errors
   • date in the future
   • negative gross / net amounts
   • currency not exactly 3 uppercase letters
   • net_amount > gross_amount (over-settlement signal)

The final quality_score is:
    (rows without any error-level flag) / total_rows * 100
"""

from __future__ import annotations

import hashlib
import logging
from datetime import date as Date
from decimal import Decimal

from app.schemas.transaction import QualityFlag, QualityReport, TransactionBase

logger = logging.getLogger(__name__)

# ─── Internal flag type constants ────────────────────────────────────────────

ISSUE_DUPLICATE     = "duplicate"
ISSUE_MISSING_FIELD = "missing_field"
ISSUE_FORMAT_ERROR  = "format_error"

SEVERITY_ERROR   = "error"
SEVERITY_WARNING = "warning"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _row_hash(txn: TransactionBase) -> str:
    """
    Stable hash for duplicate detection.
    Uses (transaction_id, date, gross_amount, source) so that the same
    financial event uploaded twice will collide.
    """
    parts = "|".join([
        str(txn.transaction_id or ""),
        str(txn.date or ""),
        str(txn.gross_amount),
        txn.source.value,
    ])
    return hashlib.sha256(parts.encode()).hexdigest()


def _check_duplicates(
    transactions: list[TransactionBase],
) -> list[QualityFlag]:
    """Return flags for all rows whose hash was seen before."""
    seen: dict[str, int] = {}   # hash → first row index
    flags: list[QualityFlag] = []

    for txn in transactions:
        h = _row_hash(txn)
        idx = txn.raw_row_index or 0

        if h in seen:
            flags.append(QualityFlag(
                row_index  = idx,
                issue_type = ISSUE_DUPLICATE,
                severity   = SEVERITY_ERROR,
                field      = None,
                message    = (
                    f"Row {idx} is a duplicate of row {seen[h]} "
                    f"(same transaction_id, date, gross_amount and source)."
                ),
            ))
        else:
            seen[h] = idx

    return flags


def _check_missing_fields(
    transactions: list[TransactionBase],
) -> list[QualityFlag]:
    """Check required and suggested fields for each transaction."""
    flags: list[QualityFlag] = []

    REQUIRED  = ["transaction_id", "date", "gross_amount"]
    SUGGESTED = ["reference"]

    for txn in transactions:
        idx = txn.raw_row_index or 0

        for f_name in REQUIRED:
            value = getattr(txn, f_name, None)
            # gross_amount of 0.00 is allowed — only None counts as missing
            if f_name == "gross_amount":
                if value is None:
                    flags.append(QualityFlag(
                        row_index  = idx,
                        issue_type = ISSUE_MISSING_FIELD,
                        severity   = SEVERITY_ERROR,
                        field      = f_name,
                        message    = f"Row {idx}: required field '{f_name}' is missing.",
                    ))
            else:
                if not value:
                    flags.append(QualityFlag(
                        row_index  = idx,
                        issue_type = ISSUE_MISSING_FIELD,
                        severity   = SEVERITY_ERROR,
                        field      = f_name,
                        message    = f"Row {idx}: required field '{f_name}' is missing.",
                    ))

        for f_name in SUGGESTED:
            if not getattr(txn, f_name, None):
                flags.append(QualityFlag(
                    row_index  = idx,
                    issue_type = ISSUE_MISSING_FIELD,
                    severity   = SEVERITY_WARNING,
                    field      = f_name,
                    message    = f"Row {idx}: suggested field '{f_name}' (UTR/bank ref) is missing.",
                ))

    return flags


def _check_format_errors(
    transactions: list[TransactionBase],
) -> list[QualityFlag]:
    """Validate field formats and business rules."""
    flags: list[QualityFlag] = []
    today = Date.today()

    import re
    CURRENCY_RE = re.compile(r"^[A-Z]{3}$")

    for txn in transactions:
        idx = txn.raw_row_index or 0

        # ── date in future ────────────────────────────────────────────────
        if txn.date and txn.date > today:
            flags.append(QualityFlag(
                row_index  = idx,
                issue_type = ISSUE_FORMAT_ERROR,
                severity   = SEVERITY_ERROR,
                field      = "date",
                message    = (
                    f"Row {idx}: date '{txn.date}' is in the future "
                    f"(today is {today})."
                ),
            ))

        # ── negative gross_amount ─────────────────────────────────────────
        if txn.gross_amount < Decimal("0"):
            flags.append(QualityFlag(
                row_index  = idx,
                issue_type = ISSUE_FORMAT_ERROR,
                severity   = SEVERITY_ERROR,
                field      = "gross_amount",
                message    = f"Row {idx}: gross_amount is negative ({txn.gross_amount}).",
            ))

        # ── negative net_amount ───────────────────────────────────────────
        if txn.net_amount < Decimal("0"):
            flags.append(QualityFlag(
                row_index  = idx,
                issue_type = ISSUE_FORMAT_ERROR,
                severity   = SEVERITY_WARNING,
                field      = "net_amount",
                message    = f"Row {idx}: net_amount is negative ({txn.net_amount}), possible over-deduction.",
            ))

        # ── net > gross (over-settlement) ──────────────────────────────────
        if (
            txn.gross_amount > Decimal("0")
            and txn.net_amount > txn.gross_amount
        ):
            flags.append(QualityFlag(
                row_index  = idx,
                issue_type = ISSUE_FORMAT_ERROR,
                severity   = SEVERITY_WARNING,
                field      = "net_amount",
                message    = (
                    f"Row {idx}: net_amount ({txn.net_amount}) exceeds "
                    f"gross_amount ({txn.gross_amount}) — possible over-settlement."
                ),
            ))

        # ── currency format ───────────────────────────────────────────────
        if txn.currency and not CURRENCY_RE.match(txn.currency):
            flags.append(QualityFlag(
                row_index  = idx,
                issue_type = ISSUE_FORMAT_ERROR,
                severity   = SEVERITY_WARNING,
                field      = "currency",
                message    = (
                    f"Row {idx}: currency '{txn.currency}' is not a valid "
                    f"ISO-4217 3-letter code."
                ),
            ))

    return flags


# ─── Public API ───────────────────────────────────────────────────────────────

def run_quality_checks(transactions: list[TransactionBase]) -> QualityReport:
    """
    Run all three quality check passes against a normalised transaction list
    and return a QualityReport.

    Parameters
    ----------
    transactions : list of normalised TransactionBase objects

    Returns
    -------
    QualityReport (Pydantic model) with per-row flags and aggregate counts / quality score.
    """
    if not transactions:
        return QualityReport(total_rows=0)

    # ── Run all checks ────────────────────────────────────────────────────────
    dup_flags     = _check_duplicates(transactions)
    missing_flags = _check_missing_fields(transactions)
    format_flags  = _check_format_errors(transactions)

    all_flags = dup_flags + missing_flags + format_flags
    all_flags.sort(key=lambda f: (f.row_index, f.severity))

    # ── Aggregate counts ──────────────────────────────────────────────────────
    duplicate_count     = len(dup_flags)
    missing_field_count = sum(1 for f in missing_flags if f.severity == SEVERITY_ERROR)
    format_error_count  = sum(1 for f in format_flags  if f.severity == SEVERITY_ERROR)
    warning_count       = sum(1 for f in all_flags     if f.severity == SEVERITY_WARNING)

    # ── Quality score: % of rows with zero ERROR-level flags ─────────────────
    rows_with_errors: set[int] = {
        f.row_index for f in all_flags if f.severity == SEVERITY_ERROR
    }
    clean_rows    = len(transactions) - len(rows_with_errors)
    quality_score = round(clean_rows / len(transactions) * 100, 1)

    logger.info(
        "Quality check: %d rows | score=%.1f%% | dupes=%d | missing=%d | format=%d | warnings=%d",
        len(transactions), quality_score,
        duplicate_count, missing_field_count, format_error_count, warning_count,
    )

    return QualityReport(
        total_rows          = len(transactions),
        duplicate_count     = duplicate_count,
        missing_field_count = missing_field_count,
        format_error_count  = format_error_count,
        warning_count       = warning_count,
        quality_score       = quality_score,
        flagged_rows        = all_flags,
    )
