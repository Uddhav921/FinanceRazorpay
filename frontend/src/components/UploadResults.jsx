import { useState } from 'react'

const SOURCE_LABEL = {
  order_ledger:   'Order / Ledger',
  razorpay_psp:   'Razorpay / PSP',
  bank_statement: 'Bank Statement',
}

const STATUS_BADGE = {
  captured: 'badge-info',
  settled:  'badge-success',
  refunded: 'badge-warning',
  failed:   'badge-danger',
  pending:  'badge-warning',
  unknown:  '',
}

const ISSUE_ICONS = {
  duplicate:     '🔁',
  missing_field: '⚠️',
  format_error:  '🔴',
}

/* ── Quality Score Badge ────────────────────────────────────────────────── */
function QualityScoreBadge({ score }) {
  const cls =
    score >= 95 ? 'qs-excellent'
    : score >= 80 ? 'qs-good'
    : score >= 60 ? 'qs-fair'
    : 'qs-poor'

  const label =
    score >= 95 ? 'Excellent'
    : score >= 80 ? 'Good'
    : score >= 60 ? 'Fair'
    : 'Poor'

  return (
    <div className={`quality-score-badge ${cls}`}>
      <svg viewBox="0 0 36 36" className="qs-ring">
        <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3.2" className="qs-ring-bg" />
        <circle
          cx="18" cy="18" r="15.9" fill="none" strokeWidth="3.2"
          className="qs-ring-fill"
          strokeDasharray={`${score} ${100 - score}`}
          strokeDashoffset="25"
        />
      </svg>
      <div className="qs-text">
        <span className="qs-number">{score.toFixed(1)}%</span>
        <span className="qs-label">{label}</span>
      </div>
    </div>
  )
}

/* ── Quality Report Section ─────────────────────────────────────────────── */
function QualityReportSection({ report }) {
  const [expanded, setExpanded] = useState(false)

  if (!report) return null

  const errorFlags   = report.flagged_rows.filter(f => f.severity === 'error')
  const warningFlags = report.flagged_rows.filter(f => f.severity === 'warning')

  return (
    <div className="quality-section">
      {/* Header row */}
      <div className="quality-header">
        <div className="quality-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <h4>Data Quality Report</h4>
        </div>
        <QualityScoreBadge score={report.quality_score} />
      </div>

      {/* Metric cards */}
      <div className="quality-metrics">
        <div className="quality-metric-card duplicate">
          <div className="qm-icon">🔁</div>
          <div className="qm-value">{report.duplicate_count}</div>
          <div className="qm-label">Duplicates</div>
        </div>
        <div className="quality-metric-card missing">
          <div className="qm-icon">📋</div>
          <div className="qm-value">{report.missing_field_count}</div>
          <div className="qm-label">Missing Fields</div>
        </div>
        <div className="quality-metric-card format">
          <div className="qm-icon">🔴</div>
          <div className="qm-value">{report.format_error_count}</div>
          <div className="qm-label">Format Errors</div>
        </div>
        <div className="quality-metric-card warning">
          <div className="qm-icon">⚠️</div>
          <div className="qm-value">{report.warning_count}</div>
          <div className="qm-label">Warnings</div>
        </div>
      </div>

      {/* Flagged rows */}
      {report.flagged_rows.length > 0 && (
        <div className="quality-flags">
          <button
            className="flags-toggle"
            onClick={() => setExpanded(e => !e)}
          >
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              width="14" height="14"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            {expanded ? 'Hide' : 'Show'} {report.flagged_rows.length} flagged row{report.flagged_rows.length !== 1 ? 's' : ''}
            <span className="flag-summary">
              {errorFlags.length > 0 && (
                <span className="flag-pill error">{errorFlags.length} errors</span>
              )}
              {warningFlags.length > 0 && (
                <span className="flag-pill warn">{warningFlags.length} warnings</span>
              )}
            </span>
          </button>

          {expanded && (
            <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Severity</th>
                    <th>Issue Type</th>
                    <th>Field</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {report.flagged_rows.map((flag, i) => (
                    <tr key={i} className={`flag-row flag-${flag.severity}`}>
                      <td style={{ fontFamily: 'monospace', color: 'var(--clr-muted)' }}>
                        #{flag.row_index}
                      </td>
                      <td>
                        <span className={`badge ${flag.severity === 'error' ? 'badge-danger' : 'badge-warning'}`}>
                          {flag.severity}
                        </span>
                      </td>
                      <td>
                        {ISSUE_ICONS[flag.issue_type] || ''}{' '}
                        <span style={{ fontSize: '0.8rem' }}>
                          {flag.issue_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                        {flag.field ?? '—'}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--clr-muted)' }}>
                        {flag.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {report.flagged_rows.length === 0 && (
        <div className="quality-clean">
          ✅ No issues found — all rows passed quality checks.
        </div>
      )}
    </div>
  )
}

/* ── Main UploadResults Component ───────────────────────────────────────── */
export default function UploadResults({ results }) {
  if (!results?.length) return null

  return (
    <div className="result-section">
      <h2>Upload Results</h2>

      {results.map((r, i) => (
        <div key={i} className="card" style={{ marginBottom: '1.25rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>{SOURCE_LABEL[r.source] || r.source} — {r.filename}</h3>
            {r.error
              ? <span className="badge badge-danger">Error</span>
              : <span className="badge badge-success">✓ Parsed</span>}
          </div>

          {/* Error state */}
          {r.error && (
            <div className="error-list">
              <h4>Error</h4>
              <p style={{ fontSize: '0.85rem' }}>{r.error}</p>
            </div>
          )}

          {/* Happy path */}
          {!r.error && (
            <>
              {/* Parse stats */}
              <div className="stats-row">
                <div className="stat-card">
                  <div className="label">Total Rows</div>
                  <div className="value">{r.total_rows}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Valid Rows</div>
                  <div className="value success">{r.valid_rows}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Normalised</div>
                  <div className="value success">{r.normalised_count ?? r.valid_rows}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Skipped</div>
                  <div className={`value ${r.skipped_rows > 0 ? 'warning' : ''}`}>{r.skipped_rows}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Parse Errors</div>
                  <div className={`value ${r.parse_errors?.length ? 'danger' : ''}`}>{r.parse_errors?.length ?? 0}</div>
                </div>
              </div>

              {/* Row-level parse errors */}
              {r.parse_errors?.length > 0 && (
                <div className="error-list">
                  <h4>Row-level Errors</h4>
                  <ul>
                    {r.parse_errors.map((e, j) => <li key={j}>{e}</li>)}
                  </ul>
                </div>
              )}

              {/* ── Data Quality Report ── */}
              <QualityReportSection report={r.quality_report} />

              {/* Transaction table */}
              {r.transactions?.length > 0 && (
                <>
                  <h3 style={{ margin: '1.25rem 0 0.75rem' }}>
                    Parsed Transactions
                    <span style={{ fontWeight: 400, color: 'var(--clr-muted)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                      (showing first 50)
                    </span>
                  </h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Transaction ID</th>
                          <th>Order ID</th>
                          <th>Date</th>
                          <th>Gross</th>
                          <th>Fee</th>
                          <th>Tax</th>
                          <th>Net</th>
                          <th>Currency</th>
                          <th>Status</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.transactions.slice(0, 50).map((t, j) => (
                          <tr key={j}>
                            <td style={{ color: 'var(--clr-muted)' }}>{t.raw_row_index ?? j + 1}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{t.transaction_id ?? '—'}</td>
                            <td>{t.order_id ?? '—'}</td>
                            <td>{t.date ?? '—'}</td>
                            <td style={{ fontWeight: 600 }}>₹{Number(t.gross_amount).toFixed(2)}</td>
                            <td>₹{Number(t.fee_amount).toFixed(2)}</td>
                            <td>₹{Number(t.tax_amount).toFixed(2)}</td>
                            <td style={{ fontWeight: 600, color: 'var(--clr-success)' }}>
                              ₹{Number(t.net_amount).toFixed(2)}
                            </td>
                            <td>{t.currency}</td>
                            <td>
                              <span className={`badge ${STATUS_BADGE[t.status] ?? ''}`}>
                                {t.status}
                              </span>
                            </td>
                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.reference ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
