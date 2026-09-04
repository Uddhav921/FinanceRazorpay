"""
orm.py — SQLAlchemy ORM models for all 5 tables.

Tables
──────
  upload_sessions        — one per uploaded file
  transactions           — every normalised row
  reconciliation_runs    — one per /reconciliation/run call
  reconciliation_results — one per matched/unmatched row in a run
  settlement_breakdowns  — settlement calc linked to each result
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Enum as SAEnum,
    ForeignKey, Index, Integer, Numeric, SmallInteger, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.models.database import Base


# ── 0. users ────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    email      = Column(String(255), unique=True, nullable=False, index=True)
    name       = Column(String(255), nullable=False)
    avatar_url = Column(String(512), nullable=True)
    google_id  = Column(String(255), unique=True, nullable=True, index=True)
    role       = Column(String(64), default="Finance Controller")
    created_at = Column(DateTime, default=datetime.utcnow)


# ── 1. upload_sessions ──────────────────────────────────────────────────────

class UploadSession(Base):
    __tablename__ = "upload_sessions"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(Integer, nullable=True, index=True)
    filename         = Column(String(255), nullable=False)
    source           = Column(
        SAEnum("order_ledger", "razorpay_psp", "bank_statement", name="source_enum"),
        nullable=False,
    )
    total_rows       = Column(Integer, default=0)
    valid_rows       = Column(Integer, default=0)
    skipped_rows     = Column(Integer, default=0)
    normalised_count = Column(Integer, default=0)
    quality_score    = Column(Numeric(5, 2), default=Decimal("100.00"))
    uploaded_at      = Column(DateTime, default=datetime.utcnow)

    # Relationships
    transactions     = relationship("Transaction", back_populates="session", cascade="all, delete-orphan")


# ── 2. transactions ─────────────────────────────────────────────────────────

class Transaction(Base):
    __tablename__ = "transactions"

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id     = Column(Integer, ForeignKey("upload_sessions.id", ondelete="CASCADE"), nullable=False)
    source         = Column(
        SAEnum("order_ledger", "razorpay_psp", "bank_statement", name="source_enum"),
        nullable=False,
    )
    transaction_id = Column(String(128), nullable=True, index=True)
    order_id       = Column(String(128), nullable=True, index=True)
    settlement_id  = Column(String(128), nullable=True, index=True)
    merchant_id    = Column(String(128), nullable=True)
    txn_date       = Column(String(10), nullable=True)         # stored as ISO string YYYY-MM-DD
    gross_amount   = Column(Numeric(15, 2), default=Decimal("0.00"))
    fee_amount     = Column(Numeric(15, 2), default=Decimal("0.00"))
    tax_amount     = Column(Numeric(15, 2), default=Decimal("0.00"))
    tds_amount     = Column(Numeric(15, 2), default=Decimal("0.00"))
    refund_amount  = Column(Numeric(15, 2), default=Decimal("0.00"))
    net_amount     = Column(Numeric(15, 2), default=Decimal("0.00"))
    reference      = Column(String(255), nullable=True)
    status         = Column(String(32), default="unknown")
    currency       = Column(String(3), default="INR")
    raw_row_index  = Column(Integer, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session        = relationship("UploadSession", back_populates="transactions")

    __table_args__ = (
        Index("idx_txn_source_date", "source", "txn_date"),
    )


# ── 3. reconciliation_runs ──────────────────────────────────────────────────

class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"

    id                  = Column(Integer, primary_key=True, autoincrement=True)
    user_id             = Column(Integer, nullable=True, index=True)
    run_name            = Column(String(255), nullable=True)
    order_session_id    = Column(Integer, ForeignKey("upload_sessions.id", ondelete="SET NULL"), nullable=True)
    psp_session_id      = Column(Integer, ForeignKey("upload_sessions.id", ondelete="SET NULL"), nullable=True)
    bank_session_id     = Column(Integer, ForeignKey("upload_sessions.id", ondelete="SET NULL"), nullable=True)
    total_order         = Column(Integer, default=0)
    total_psp           = Column(Integer, default=0)
    total_bank          = Column(Integer, default=0)
    total_matched       = Column(Integer, default=0)
    total_reconciled    = Column(Integer, default=0)
    total_exceptions    = Column(Integer, default=0)
    match_rate          = Column(Numeric(5, 2), default=Decimal("0.00"))
    reconciliation_rate = Column(Numeric(5, 2), default=Decimal("0.00"))
    total_expected_net  = Column(Numeric(15, 2), default=Decimal("0.00"))
    total_actual_bank   = Column(Numeric(15, 2), default=Decimal("0.00"))
    total_difference    = Column(Numeric(15, 2), default=Decimal("0.00"))
    tolerance_pct       = Column(Numeric(5, 2), default=Decimal("0.50"))
    run_at              = Column(DateTime, default=datetime.utcnow)

    # Relationships
    results = relationship("ReconciliationResult", back_populates="run", cascade="all, delete-orphan")


# ── 4. reconciliation_results ────────────────────────────────────────────────

class ReconciliationResult(Base):
    __tablename__ = "reconciliation_results"

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    run_id         = Column(Integer, ForeignKey("reconciliation_runs.id", ondelete="CASCADE"), nullable=False)
    order_txn_id   = Column(BigInteger, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    psp_txn_id     = Column(BigInteger, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    bank_txn_id    = Column(BigInteger, ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True)
    confidence     = Column(SmallInteger, default=0)
    match_strategy = Column(String(64), default="")
    status         = Column(
        SAEnum("reconciled", "exception", "pending", name="recon_status_enum"),
        default="pending",
        nullable=False,
    )
    reason_code    = Column(String(32), nullable=True, index=True)
    reason_detail  = Column(Text, nullable=True)
    date_diff_days = Column(SmallInteger, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    # Relationships
    run       = relationship("ReconciliationRun", back_populates="results")
    breakdown = relationship("SettlementBreakdown", back_populates="result", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_result_run_status", "run_id", "status"),
    )


# ── 5. settlement_breakdowns ─────────────────────────────────────────────────

class SettlementBreakdown(Base):
    __tablename__ = "settlement_breakdowns"

    id                 = Column(BigInteger, primary_key=True, autoincrement=True)
    result_id          = Column(BigInteger, ForeignKey("reconciliation_results.id", ondelete="CASCADE"), nullable=False, unique=True)
    gross_amount       = Column(Numeric(15, 2), default=Decimal("0.00"))
    fee_amount         = Column(Numeric(15, 2), default=Decimal("0.00"))
    tax_amount         = Column(Numeric(15, 2), default=Decimal("0.00"))
    tds_amount         = Column(Numeric(15, 2), default=Decimal("0.00"))
    refund_amount      = Column(Numeric(15, 2), default=Decimal("0.00"))
    other_adjustments  = Column(Numeric(15, 2), default=Decimal("0.00"))
    expected_net       = Column(Numeric(15, 2), default=Decimal("0.00"))
    actual_bank_credit = Column(Numeric(15, 2), default=Decimal("0.00"))
    difference         = Column(Numeric(15, 2), default=Decimal("0.00"))   # Signed: Bank − Expected

    # Relationships
    result = relationship("ReconciliationResult", back_populates="breakdown")


# ── 6. narrative_reports ─────────────────────────────────────────────────────

class NarrativeReportModel(Base):
    __tablename__ = "narrative_reports"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    user_id         = Column(Integer, nullable=False, index=True)
    run_id          = Column(Integer, nullable=True, index=True)
    markdown        = Column(Text, nullable=False)
    summary         = Column(Text, nullable=True)
    management_note = Column(Text, nullable=True)
    model_used      = Column(String(64), default="gemini-3.6-flash")
    tokens_used     = Column(Integer, default=0)
    created_at      = Column(DateTime, default=datetime.utcnow)


# ── 7. exception_tickets ─────────────────────────────────────────────────────

class ExceptionTicket(Base):
    __tablename__ = "exception_tickets"

    id              = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id         = Column(Integer, nullable=False, index=True)
    run_id          = Column(Integer, nullable=False, index=True)
    exception_index = Column(Integer, nullable=False)
    status          = Column(String(32), default="OPEN")         # OPEN, IN_PROGRESS, RESOLVED
    assigned_to     = Column(String(255), nullable=True)
    comments        = Column(Text, nullable=True)                # JSON serialized string
    resolved_at     = Column(DateTime, nullable=True)
    resolved_by     = Column(String(255), nullable=True)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_ticket_user_run_idx", "user_id", "run_id", "exception_index"),
    )
