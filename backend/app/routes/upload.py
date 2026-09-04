"""
upload.py — /upload route (Data Sources ingestion endpoint)

Accepts CSV / XLSX files for the three data sources:
  • order_ledger
  • razorpay_psp
  • bank_statement

Returns a structured summary of parsed transactions plus any row-level errors.
"""

import os
import logging
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from app.schemas.transaction import DataSourceType, UploadSummary
from app.services.parser import build_upload_summary, parse_file

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
        "The file is parsed and normalised into the standardised transaction schema."
    ),
)
async def upload_file(
    file: UploadFile = File(..., description="CSV or XLSX file to upload"),
    source: DataSourceType = Form(..., description="Data source type"),
    include_transactions: bool = Form(
        default=True,
        description="Whether to include parsed transactions in the response",
    ),
) -> UploadSummary:
    """
    Parse and normalise an uploaded data source file.
    Returns a summary of parsed rows plus any row-level errors.
    """
    # ── Validate file extension ──────────────────────────────────────────────
    _validate_extension(file.filename or "")

    # ── Read bytes ──────────────────────────────────────────────────────────
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

    logger.info("Received upload: '%s' | source=%s | size=%d bytes", file.filename, source, len(file_bytes))

    # ── Parse ────────────────────────────────────────────────────────────────
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

    return build_upload_summary(
        filename=file.filename or "upload",
        source=source,
        result=result,
        include_transactions=include_transactions,
    )
