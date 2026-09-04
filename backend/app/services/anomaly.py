"""
anomaly.py — Exception & Anomaly Detection Engine: Step 7

Two layers:
  1. Rule-Based: Duplicate Charge, Round-Number Bias, Settlement Delay,
                 Unusual Fee/Tax, Repeated Mismatches
  2. Statistical: Z-score outlier detection on transaction amounts

Returns an AnomalyReport with all flagged items and severity ratings.
"""

from __future__ import annotations

import statistics
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional, List, Dict, Any

from app.schemas.transaction import ReconciliationReport, ReconciliationResult

logger = logging.getLogger(__name__)

# ─── Anomaly type constants ───────────────────────────────────────────────────
ANOMALY_DUPLICATE_CHARGE     = "DUPLICATE_CHARGE"
ANOMALY_AMOUNT_OUTLIER       = "AMOUNT_OUTLIER"
ANOMALY_TIMING_IRREGULARITY  = "TIMING_IRREGULARITY"
ANOMALY_ROUND_NUMBER_BIAS    = "ROUND_NUMBER_BIAS"
ANOMALY_UNUSUAL_FEE          = "UNUSUAL_FEE"
ANOMALY_REPEATED_MISMATCH    = "REPEATED_MISMATCH"


@dataclass
class Anomaly:
    anomaly_type : str
    severity     : str                   # HIGH | MEDIUM | LOW
    description  : str
    affected_ids : List[str]             = field(default_factory=list)
    amount       : Optional[Decimal]     = None
    metadata     : Dict[str, Any]        = field(default_factory=dict)


@dataclass
class AnomalyReport:
    total_anomalies : int
    high_severity   : int
    medium_severity : int
    low_severity    : int
    anomalies       : List[Anomaly]      = field(default_factory=list)
    summary         : str                = ""


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _txn_id(r: ReconciliationResult) -> str:
    if r.psp_txn and r.psp_txn.transaction_id:  return r.psp_txn.transaction_id
    if r.bank_txn and r.bank_txn.transaction_id: return r.bank_txn.transaction_id
    return "unknown"


def _amount(r: ReconciliationResult) -> Decimal:
    if r.psp_txn:  return r.psp_txn.gross_amount
    if r.bank_txn: return r.bank_txn.gross_amount
    return Decimal("0")


def _fee_ratio(r: ReconciliationResult) -> Optional[float]:
    if not r.psp_txn: return None
    gross = float(r.psp_txn.gross_amount)
    if gross == 0: return None
    return float(r.psp_txn.fee_amount) / gross * 100


# ─── Detectors ───────────────────────────────────────────────────────────────

def _detect_duplicates(results: List[ReconciliationResult]) -> List[Anomaly]:
    seen: Dict[str, List[str]] = {}
    for r in results:
        if not r.psp_txn: continue
        txn = r.psp_txn
        key = f"{float(txn.gross_amount):.2f}|{txn.merchant_id or ''}|{txn.reference or ''}"
        seen.setdefault(key, []).append(txn.transaction_id or "?")

    anomalies = []
    for key, ids in seen.items():
        if len(ids) > 1:
            parts = key.split("|")
            anomalies.append(Anomaly(
                anomaly_type = ANOMALY_DUPLICATE_CHARGE,
                severity     = "HIGH",
                description  = f"Possible duplicate: amount ₹{parts[0]} appears {len(ids)}x for merchant '{parts[1] or 'unknown'}'",
                affected_ids = ids,
                amount       = Decimal(parts[0]),
                metadata     = {"count": len(ids)},
            ))
    return anomalies


def _detect_amount_outliers(results: List[ReconciliationResult], z_threshold: float = 2.5) -> List[Anomaly]:
    amounts = [float(_amount(r)) for r in results if float(_amount(r)) > 0]
    if len(amounts) < 5:
        return []
    mean  = statistics.mean(amounts)
    stdev = statistics.stdev(amounts)
    if stdev == 0:
        return []

    anomalies = []
    for r in results:
        amt = float(_amount(r))
        if amt == 0: continue
        z = (amt - mean) / stdev
        if abs(z) > z_threshold:
            anomalies.append(Anomaly(
                anomaly_type = ANOMALY_AMOUNT_OUTLIER,
                severity     = "HIGH" if abs(z) > 4 else "MEDIUM",
                description  = f"Out-of-pattern amount ₹{amt:,.2f} (Z={z:.1f}, mean=₹{mean:,.2f})",
                affected_ids = [_txn_id(r)],
                amount       = _amount(r),
                metadata     = {"z_score": round(z, 2), "mean": round(mean, 2)},
            ))
    return anomalies


def _detect_timing_irregularities(results: List[ReconciliationResult], max_days: int = 5) -> List[Anomaly]:
    anomalies = []
    for r in results:
        if r.date_diff_days is not None and abs(r.date_diff_days) > max_days:
            anomalies.append(Anomaly(
                anomaly_type = ANOMALY_TIMING_IRREGULARITY,
                severity     = "MEDIUM",
                description  = f"Settlement lag of {r.date_diff_days} days (max allowed: {max_days})",
                affected_ids = [_txn_id(r)],
                amount       = _amount(r),
                metadata     = {"date_diff_days": r.date_diff_days},
            ))
    return anomalies


def _detect_round_number_bias(results: List[ReconciliationResult]) -> List[Anomaly]:
    round_ids: List[str] = []
    for r in results:
        amt = float(_amount(r))
        if amt > 0 and amt % 1000 == 0:
            round_ids.append(_txn_id(r))

    anomalies = []
    total = len(results) or 1
    pct   = len(round_ids) / total * 100
    if pct > 40:
        anomalies.append(Anomaly(
            anomaly_type = ANOMALY_ROUND_NUMBER_BIAS,
            severity     = "MEDIUM",
            description  = f"{len(round_ids)} of {total} transactions ({pct:.0f}%) have suspiciously round amounts (multiples of ₹1,000).",
            affected_ids = round_ids[:10],
            metadata     = {"count": len(round_ids), "pct": round(pct, 1)},
        ))
    return anomalies


def _detect_unusual_fee(results: List[ReconciliationResult], expected_pct: float = 2.0, tol: float = 0.5) -> List[Anomaly]:
    anomalies = []
    for r in results:
        ratio = _fee_ratio(r)
        if ratio is None: continue
        dev = abs(ratio - expected_pct)
        if dev > tol:
            anomalies.append(Anomaly(
                anomaly_type = ANOMALY_UNUSUAL_FEE,
                severity     = "HIGH" if dev > 1.5 else "LOW",
                description  = f"Fee ratio {ratio:.2f}% vs expected {expected_pct}% (deviation: {dev:.2f}%)",
                affected_ids = [_txn_id(r)],
                amount       = _amount(r),
                metadata     = {"fee_ratio": round(ratio, 3), "expected_pct": expected_pct},
            ))
    return anomalies


def _detect_repeated_mismatches(results: List[ReconciliationResult], threshold: int = 2) -> List[Anomaly]:
    counts: Dict[str, List[str]] = {}
    for r in results:
        if r.status.value != "exception": continue
        txn = r.psp_txn or r.bank_txn
        key = (txn.merchant_id or txn.reference or "unknown") if txn else "unknown"
        counts.setdefault(key, []).append(_txn_id(r))

    anomalies = []
    for key, ids in counts.items():
        if len(ids) >= threshold:
            anomalies.append(Anomaly(
                anomaly_type = ANOMALY_REPEATED_MISMATCH,
                severity     = "HIGH" if len(ids) >= 3 else "MEDIUM",
                description  = f"'{key}' has {len(ids)} repeated exceptions — possible systemic issue.",
                affected_ids = ids,
                metadata     = {"exception_count": len(ids)},
            ))
    return anomalies


# ─── Public API ───────────────────────────────────────────────────────────────

def run_anomaly_detection(
    report:           ReconciliationReport,
    z_threshold:      float = 2.5,
    max_settle_days:  int   = 5,
    expected_fee_pct: float = 2.0,
) -> AnomalyReport:
    """Run all anomaly detectors. Returns AnomalyReport."""
    results = report.results
    all_anomalies: List[Anomaly] = []
    all_anomalies.extend(_detect_duplicates(results))
    all_anomalies.extend(_detect_amount_outliers(results, z_threshold))
    all_anomalies.extend(_detect_timing_irregularities(results, max_settle_days))
    all_anomalies.extend(_detect_round_number_bias(results))
    all_anomalies.extend(_detect_unusual_fee(results, expected_fee_pct))
    all_anomalies.extend(_detect_repeated_mismatches(results))

    high   = sum(1 for a in all_anomalies if a.severity == "HIGH")
    medium = sum(1 for a in all_anomalies if a.severity == "MEDIUM")
    low    = sum(1 for a in all_anomalies if a.severity == "LOW")

    parts = []
    if high:   parts.append(f"{high} high")
    if medium: parts.append(f"{medium} medium")
    if low:    parts.append(f"{low} low")
    summary = (
        f"Detected {len(all_anomalies)} anomalies: " + ", ".join(parts) + "."
        if all_anomalies else "No anomalies detected."
    )

    logger.info("Anomaly detection: %s", summary)
    return AnomalyReport(
        total_anomalies = len(all_anomalies),
        high_severity   = high,
        medium_severity = medium,
        low_severity    = low,
        anomalies       = all_anomalies,
        summary         = summary,
    )
