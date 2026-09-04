"""
upload.py — /upload route (Data Sources ingestion endpoint)

Full Ingestion Layer pipeline:
  1. Validate file extension + size
  2. Parse (CSV / XLSX → TransactionBase list)
  3. Normalise  (clean IDs, coerce amounts, derive net, apply source rules)
  4. Data Quality Checks (duplicates, missing fields, format errors)
  5. Return UploadSummary (parse stats + quality report + transactions)

Accepted data sources:
  • order_ledger
  • razorpay_psp
  • bank_statement
"""

import os
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.schemas.transaction import DataSourceType, UploadSummary
from app.services.parser import build_upload_summary, parse_file
from app.services.normalizer import normalise_with_trace
from app.services.data_quality import run_quality_checks
from app.services.db_service import save_upload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["Data Sources"])

# Maximum file size (bytes) — default 50 MB
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE_MB", "50")) * 1024 * 1024

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}


def _validate_extension(filename: str) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{ext}' not supported. Please upload CSV or XLSX.",
        )


@router.post(
    "/",
    response_model=UploadSummary,
    summary="Upload a data source file",
    description=(
        "Upload a CSV or XLSX file for one of the three data sources: "
        "`order_ledger`, `razorpay_psp`, or `bank_statement`. "
        "The file is parsed, normalised, and run through Data Quality checks. "
        "Returns a structured summary with parse stats, quality report, and transactions."
    ),
)
async def upload_file(
    file: UploadFile = File(..., description="CSV or XLSX file to upload"),
    source: DataSourceType = Form(..., description="Data source type"),
    include_transactions: bool = Form(
        default=True,
        description="Whether to include parsed transactions in the response",
    ),
    run_quality: bool = Form(
        default=True,
        description="Whether to run Data Quality checks after normalisation",
    ),
    db: Session = Depends(get_db),
) -> UploadSummary:
    """
    Full ingestion pipeline:
      Parse → Normalise → Quality Check → Save to DB → Return Summary
    """
    # ── 1. Validate file extension ────────────────────────────────────────────
    _validate_extension(file.filename or "")

    # ── 2. Read bytes ─────────────────────────────────────────────────────────
    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds the {os.getenv('MAX_FILE_SIZE_MB', '50')} MB limit.",
        )

    logger.info(
        "Received upload: '%s' | source=%s | size=%d bytes",
        file.filename, source, len(file_bytes),
    )

    # ── 3. Parse ──────────────────────────────────────────────────────────────
    result = parse_file(
        file_bytes=file_bytes,
        filename=file.filename or "upload",
        source=source,
    )

    if not result.transactions and result.errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Failed to parse any rows.", "errors": result.errors},
        )

    # ── 4. Normalise + produce audit trace ─────────────────────────────────────────
    normalised, traces = normalise_with_trace(result.transactions)
    result.transactions = normalised
    normalised_count = len(normalised)

    # ── 5. Data Quality Checks ────────────────────────────────────────────────
    quality_report = run_quality_checks(normalised) if run_quality else None

    logger.info(
        "Ingestion complete: '%s' | normalised=%d | quality_score=%s%%",
        file.filename,
        normalised_count,
        quality_report.quality_score if quality_report else "N/A",
    )

    # ── 6. Build summary ───────────────────────────────────────────────────────────────────
    summary = build_upload_summary(
        filename=file.filename or "upload",
        source=source,
        result=result,
        include_transactions=include_transactions,
        normalised_count=normalised_count,
        quality_report=quality_report,
        normalization_traces=traces,
    )

    # ── 7. Persist to DB (non-fatal if XAMPP is not running) ─────────────────────
    try:
        save_upload(db, summary)
    except Exception as exc:
        logger.warning("DB save skipped: %s", exc)

    return summary
