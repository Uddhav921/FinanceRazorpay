"""
llm.py — Explainability & LLM Layer: Step 8

Uses Google Gemini API to generate:
  • Plain-English reconciliation summary
  • Exception explanations with root-cause hypotheses
  • Suggested next steps
  • Management summary (executive-level)

Returns a NarrativeReport (Markdown string).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from decimal import Decimal

import google.genai as genai
from google.genai import types as genai_types
from dotenv import load_dotenv

from app.schemas.transaction import ReconciliationReport
from app.services.anomaly import AnomalyReport

load_dotenv()
logger = logging.getLogger(__name__)

# ─── Gemini setup ────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
_CLIENT = genai.Client(api_key=GEMINI_API_KEY)
_MODEL  = "gemini-3.6-flash"   # 2.0 and 2.5 deprecated for new users


@dataclass
class NarrativeReport:
    markdown        : str
    summary         : str
    management_note : str
    model_used      : str = "gemini-3.6-flash"
    tokens_used     : int = 0


# ─── Serialisers ─────────────────────────────────────────────────────────────

def _decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _build_recon_context(report: ReconciliationReport, anomaly: AnomalyReport) -> str:
    """
    Build a compact JSON summary of the reconciliation run for the prompt.
    Keeps the payload small while giving the model all relevant facts.
    """
    exceptions_detail = []
    for r in report.exceptions[:20]:   # cap at 20 to keep prompt size reasonable
        exceptions_detail.append({
            "txn_id"          : (r.psp_txn or r.bank_txn) and (r.psp_txn or r.bank_txn).transaction_id,
            "reason_code"     : r.reason_code,
            "reason_detail"   : r.reason_detail,
            "expected_net"    : float(r.settlement.expected_net),
            "actual_bank"     : float(r.settlement.actual_bank_credit),
            "difference"      : float(r.settlement.difference),
            "match_strategy"  : r.match_strategy,
            "confidence"      : r.confidence,
        })

    anomalies_detail = [
        {
            "type"       : a.anomaly_type,
            "severity"   : a.severity,
            "description": a.description,
            "affected"   : a.affected_ids[:5],
        }
        for a in anomaly.anomalies[:10]
    ]

    context = {
        "run_summary": {
            "total_transactions" : max(report.total_order, report.total_psp, report.total_bank),
            "successfully_linked": report.total_matched,
            "match_rate_pct"     : float(report.match_rate),
            "reconciled"         : report.total_reconciled,
            "reconciliation_rate": float(report.reconciliation_rate),
            "exceptions"         : report.total_exceptions,
            "total_expected_net" : float(report.total_expected_net),
            "total_actual_bank"  : float(report.total_actual_bank),
            "net_difference"     : float(report.total_difference),
            "tolerance_pct"      : float(report.tolerance_pct),
        },
        "exceptions"       : exceptions_detail,
        "anomalies_summary": {
            "total"  : anomaly.total_anomalies,
            "high"   : anomaly.high_severity,
            "medium" : anomaly.medium_severity,
            "low"    : anomaly.low_severity,
            "detail" : anomalies_detail,
        },
    }
    return json.dumps(context, default=_decimal_default, indent=2)


# ─── Prompt ──────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are an expert financial analyst specialising in payment reconciliation for \
Indian fintech companies using Razorpay/PSP payment gateways.

You will receive structured JSON data from a 3-way reconciliation run \
(Order Ledger ↔ Razorpay PSP ↔ Bank Statement).

Your task is to produce a Narrative Report in Markdown with these exact sections:

## Executive Summary
Two sentences maximum. Suitable for a CFO or Finance Director.

## Reconciliation Overview
Plain-English paragraph explaining what happened: how many transactions were \
processed, matched, and reconciled, and the overall health of the batch.

## Exception Analysis
For each exception reason code found, explain:
- What the exception means in plain business terms
- The likely root cause
- The financial impact (₹ amount at risk)

## Anomaly Findings
Explain each anomaly detected, its business risk, and severity.

## Root Cause Hypotheses
List the top 3 most likely systemic root causes for the exceptions/anomalies found.

## Suggested Next Steps
Numbered action list (maximum 5) that the finance team should take immediately.

## Management Summary
One concise paragraph (3–4 sentences) suitable for a board report or monthly \
finance review. Include the reconciliation rate, total difference, and key risks.

---
Rules:
- Use ₹ for currency amounts (Indian Rupees).
- Be specific — use exact numbers from the data.
- Do not invent data. Only use what is in the JSON.
- Keep the tone professional and factual.
"""


def _prompt(context_json: str) -> str:
    return f"{_SYSTEM_PROMPT}\n\n---\n\nRECONCILIATION DATA:\n```json\n{context_json}\n```"


# ─── Public API ───────────────────────────────────────────────────────────────

def generate_narrative(
    report  : ReconciliationReport,
    anomaly : AnomalyReport,
) -> NarrativeReport:
    """
    Call Gemini to produce a full NarrativeReport from the reconciliation data.
    Raises on API failure.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set in .env")

    context_json = _build_recon_context(report, anomaly)
    prompt       = _prompt(context_json)

    logger.info("Calling Gemini API for narrative report (%d chars prompt)...", len(prompt))

    response = _CLIENT.models.generate_content(
        model=_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=4096,
        ),
    )

    markdown = response.text.strip()
    tokens   = getattr(response.usage_metadata, "total_token_count", 0)

    logger.info("Gemini response: %d chars, %d tokens", len(markdown), tokens)

    # Extract executive summary (first ## section)
    exec_summary = ""
    mgmt_note    = ""
    lines        = markdown.splitlines()
    in_section   = False
    current_section = ""
    section_lines: list[str] = []

    for line in lines:
        if line.startswith("## "):
            if current_section == "Executive Summary":
                exec_summary = "\n".join(section_lines).strip()
            elif current_section == "Management Summary":
                mgmt_note = "\n".join(section_lines).strip()
            current_section = line[3:].strip()
            section_lines   = []
        else:
            section_lines.append(line)

    # Capture last section
    if current_section == "Executive Summary":
        exec_summary = "\n".join(section_lines).strip()
    elif current_section == "Management Summary":
        mgmt_note = "\n".join(section_lines).strip()

    return NarrativeReport(
        markdown        = markdown,
        summary         = exec_summary or markdown[:500],
        management_note = mgmt_note or "",
        tokens_used     = tokens,
    )
