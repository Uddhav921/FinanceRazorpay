"""
routes/exceptions.py — Exception Workspace endpoints (Module 9)

Provides CRUD for managing exceptions:
  GET  /exceptions/                — list all exceptions from latest run
  GET  /exceptions/{id}            — get single exception with full detail
  POST /exceptions/{id}/assign     — assign to a stakeholder
  POST /exceptions/{id}/comment    — add a comment
  POST /exceptions/{id}/resolve    — mark as RESOLVED
  POST /exceptions/{id}/reopen     — reopen a resolved exception
  GET  /exceptions/export/csv      — download exceptions as CSV
  GET  /exceptions/export/xlsx     — download exceptions as XLSX
"""

from __future__ import annotations
import csv
import io
import logging
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.database import get_db
from app.models.orm import ExceptionTicket, User
from app.services.auth import get_current_user
from app.services.recon_state import get_latest_report, get_latest_run_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/exceptions", tags=["Exception Workspace"])

@router.get("/index", include_in_schema=False)
def _noop(): pass   # forces prefix to register


def _get_ticket_state(db: Session, user_id: int, run_id: int, idx: int) -> dict:
    ticket = (
        db.query(ExceptionTicket)
        .filter(
            ExceptionTicket.user_id == user_id,
            ExceptionTicket.run_id == run_id,
            ExceptionTicket.exception_index == idx,
        )
        .first()
    )
    if ticket:
        comments = []
        if ticket.comments:
            try:
                import json
                comments = json.loads(ticket.comments)
            except Exception:
                comments = []
        return {
            "status": ticket.status or "OPEN",
            "assigned_to": ticket.assigned_to,
            "comments": comments,
            "resolved_at": ticket.resolved_at.isoformat() + "Z" if ticket.resolved_at else None,
            "resolved_by": ticket.resolved_by,
        }
    return {
        "status": "OPEN",
        "assigned_to": None,
        "comments": [],
        "resolved_at": None,
        "resolved_by": None,
    }


def _save_ticket_state(db: Session, user_id: int, run_id: int, idx: int, state: dict):
    import json
    ticket = (
        db.query(ExceptionTicket)
        .filter(
            ExceptionTicket.user_id == user_id,
            ExceptionTicket.run_id == run_id,
            ExceptionTicket.exception_index == idx,
        )
        .first()
    )
    if not ticket:
        ticket = ExceptionTicket(
            user_id=user_id,
            run_id=run_id,
            exception_index=idx,
        )
        db.add(ticket)

    ticket.status = state.get("status", "OPEN")
    ticket.assigned_to = state.get("assigned_to")
    ticket.comments = json.dumps(state.get("comments", []))
    resolved_at_str = state.get("resolved_at")
    if resolved_at_str:
        try:
            ticket.resolved_at = datetime.fromisoformat(resolved_at_str.replace("Z", ""))
        except Exception:
            ticket.resolved_at = datetime.utcnow()
    else:
        ticket.resolved_at = None
    ticket.resolved_by = state.get("resolved_by")
    db.commit()


def _exception_to_dict(idx: int, r, ws: dict) -> dict:
    txn = r.psp_txn or r.bank_txn or r.order_txn
    s = r.settlement
    return {
        "id"             : idx,
        "status"         : ws.get("status", "OPEN"),
        "assigned_to"    : ws.get("assigned_to"),
        "comments"       : ws.get("comments", []),
        "resolved_at"    : ws.get("resolved_at"),
        "reason_code"    : r.reason_code,
        "reason_detail"  : r.reason_detail,
        "confidence"     : r.confidence,
        "match_strategy" : r.match_strategy,
        "date_diff_days" : r.date_diff_days,
        "transaction_id" : txn.transaction_id if txn else None,
        "merchant_id"    : txn.merchant_id if txn else None,
        "reference"      : txn.reference if txn else None,
        "txn_date"       : str(txn.date) if txn and txn.date else None,
        "settlement": {
            "gross_amount"       : float(s.gross_amount) if s else 0.0,
            "fee_amount"         : float(s.fee_amount) if s else 0.0,
            "tax_amount"         : float(s.tax_amount) if s else 0.0,
            "tds_amount"         : float(s.tds_amount) if s else 0.0,
            "refund_amount"      : float(s.refund_amount) if s else 0.0,
            "other_adjustments"  : float(s.other_adjustments) if s else 0.0,
            "expected_net"       : float(s.expected_net) if s else 0.0,
            "actual_bank_credit" : float(s.actual_bank_credit) if s else 0.0,
            "difference"         : float(s.difference) if s else 0.0,
        },
    }


# ─── List exceptions ──────────────────────────────────────────────────────────

@router.get("/", summary="List all exceptions from latest reconciliation run")
def list_exceptions(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list:
    report = get_latest_report(user_id=current_user.id)
    if report is None:
        raise HTTPException(status_code=404, detail="No reconciliation run yet.")

    run_id = get_latest_run_id(user_id=current_user.id) or 0
    results = []
    for idx, r in enumerate(report.exceptions):
        ws = _get_ticket_state(db, current_user.id, run_id, idx)
        if status_filter and ws["status"] != status_filter.upper():
            continue
        results.append(_exception_to_dict(idx, r, ws))
    return results


# ─── Get single exception ─────────────────────────────────────────────────────

@router.get("/{exc_id}", summary="Get single exception detail")
def get_exception(
    exc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = get_latest_report(user_id=current_user.id)
    if report is None:
        raise HTTPException(status_code=404, detail="No reconciliation run yet.")
    if exc_id < 0 or exc_id >= len(report.exceptions):
        raise HTTPException(status_code=404, detail=f"Exception #{exc_id} not found.")

    run_id = get_latest_run_id(user_id=current_user.id) or 0
    ws = _get_ticket_state(db, current_user.id, run_id, exc_id)
    return _exception_to_dict(exc_id, report.exceptions[exc_id], ws)


# ─── Assign ───────────────────────────────────────────────────────────────────

class AssignRequest(BaseModel):
    assigned_to: str

@router.post("/{exc_id}/assign", summary="Assign exception to a stakeholder")
def assign_exception(
    exc_id: int,
    body: AssignRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = get_latest_report(user_id=current_user.id)
    if report is None or exc_id >= len(report.exceptions):
        raise HTTPException(status_code=404, detail="Exception not found.")

    run_id = get_latest_run_id(user_id=current_user.id) or 0
    ws = _get_ticket_state(db, current_user.id, run_id, exc_id)
    ws["assigned_to"] = body.assigned_to
    if ws["status"] == "OPEN":
        ws["status"] = "IN_REVIEW"
    _save_ticket_state(db, current_user.id, run_id, exc_id, ws)
    return {"ok": True, "assigned_to": body.assigned_to}


# ─── Comment ─────────────────────────────────────────────────────────────────

class CommentRequest(BaseModel):
    author : str
    text   : str

@router.post("/{exc_id}/comment", summary="Add a comment to an exception")
def add_comment(
    exc_id: int,
    body: CommentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = get_latest_report(user_id=current_user.id)
    if report is None or exc_id >= len(report.exceptions):
        raise HTTPException(status_code=404, detail="Exception not found.")

    run_id = get_latest_run_id(user_id=current_user.id) or 0
    ws = _get_ticket_state(db, current_user.id, run_id, exc_id)
    comment = {
        "author"     : body.author,
        "text"       : body.text,
        "created_at" : datetime.utcnow().isoformat() + "Z",
    }
    ws["comments"].append(comment)
    _save_ticket_state(db, current_user.id, run_id, exc_id, ws)
    return {"ok": True, "comment": comment}


# ─── Resolve / Reopen ────────────────────────────────────────────────────────

class ResolveRequest(BaseModel):
    resolved_by: str
    note       : Optional[str] = None

@router.post("/{exc_id}/resolve", summary="Mark exception as RESOLVED")
def resolve_exception(
    exc_id: int,
    body: ResolveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = get_latest_report(user_id=current_user.id)
    if report is None or exc_id >= len(report.exceptions):
        raise HTTPException(status_code=404, detail="Exception not found.")

    run_id = get_latest_run_id(user_id=current_user.id) or 0
    ws = _get_ticket_state(db, current_user.id, run_id, exc_id)
    ws["status"]      = "RESOLVED"
    ws["resolved_at"] = datetime.utcnow().isoformat() + "Z"
    ws["resolved_by"] = body.resolved_by
    if body.note:
        ws["comments"].append({
            "author"     : body.resolved_by,
            "text"       : f"[RESOLVED] {body.note}",
            "created_at" : datetime.utcnow().isoformat() + "Z",
        })
    _save_ticket_state(db, current_user.id, run_id, exc_id, ws)
    return {"ok": True, "status": "RESOLVED"}


@router.post("/{exc_id}/reopen", summary="Reopen a resolved exception")
def reopen_exception(
    exc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    report = get_latest_report(user_id=current_user.id)
    if report is None or exc_id >= len(report.exceptions):
        raise HTTPException(status_code=404, detail="Exception not found.")

    run_id = get_latest_run_id(user_id=current_user.id) or 0
    ws = _get_ticket_state(db, current_user.id, run_id, exc_id)
    ws["status"]      = "OPEN"
    ws["resolved_at"] = None
    ws["resolved_by"] = None
    _save_ticket_state(db, current_user.id, run_id, exc_id, ws)
    return {"ok": True, "status": "OPEN"}


# ─── Export ──────────────────────────────────────────────────────────────────

@router.get("/export/csv", summary="Download exceptions as CSV")
def export_csv():
    report = get_latest_report()
    if report is None:
        raise HTTPException(status_code=404, detail="No reconciliation run yet.")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Status", "Assigned To", "Reason Code", "Reason Detail",
        "Transaction ID", "Merchant ID", "Date",
        "Gross Amount", "Fee", "GST", "TDS",
        "Expected Net", "Actual Bank Credit", "Difference (Bank-Expected)",
        "Match Strategy", "Confidence %",
    ])

    for idx, r in enumerate(report.exceptions):
        _ensure_workspace(idx, report)
        ws  = _workspace[idx]
        txn = r.psp_txn or r.bank_txn or r.order_txn
        s   = r.settlement
        writer.writerow([
            idx,
            ws["status"],
            ws["assigned_to"] or "",
            r.reason_code or "",
            r.reason_detail or "",
            txn.transaction_id if txn else "",
            txn.merchant_id if txn else "",
            str(txn.date) if txn and txn.date else "",
            float(s.gross_amount) if s else 0.0,
            float(s.fee_amount) if s else 0.0,
            float(s.tax_amount) if s else 0.0,
            float(s.tds_amount) if s else 0.0,
            float(s.expected_net) if s else 0.0,
            float(s.actual_bank_credit) if s else 0.0,
            float(s.difference) if s else 0.0,
            r.match_strategy or "",
            r.confidence,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=exceptions.csv"},
    )


@router.get("/export/reconciliation", summary="Download full reconciliation as CSV")
def export_reconciliation_csv():
    report = get_latest_report()
    if report is None:
        raise HTTPException(status_code=404, detail="No reconciliation run yet.")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Status", "Reason Code", "Transaction ID", "Merchant ID", "Date",
        "Gross Amount", "Fee", "GST", "TDS",
        "Expected Net", "Actual Bank Credit", "Difference",
        "Match Strategy", "Confidence %",
    ])

    for r in report.results:
        txn = r.psp_txn or r.bank_txn or r.order_txn
        s   = r.settlement
        writer.writerow([
            r.status.value,
            r.reason_code or "",
            txn.transaction_id if txn else "",
            txn.merchant_id if txn else "",
            str(txn.date) if txn and txn.date else "",
            float(s.gross_amount) if s else 0.0,
            float(s.fee_amount) if s else 0.0,
            float(s.tax_amount) if s else 0.0,
            float(s.tds_amount) if s else 0.0,
            float(s.expected_net) if s else 0.0,
            float(s.actual_bank_credit) if s else 0.0,
            float(s.difference) if s else 0.0,
            r.match_strategy or "",
            r.confidence,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reconciliation_report.csv"},
    )
