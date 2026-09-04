import React, { useState, useRef } from 'react'
import { runReconciliation } from '../services/api'

const SOURCES = [
  {
    key: 'order',
    label: 'Order / Ledger',
    desc: 'Internal ERP orders, invoices, adjustments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
    ),
    color: '#6366f1',
    form: 'order_file',
  },
  {
    key: 'psp',
    label: 'Razorpay / PSP',
    desc: 'Settlement report with fees, taxes, TDS',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
      </svg>
    ),
    color: '#22d3a5',
    form: 'psp_file',
  },
  {
    key: 'bank',
    label: 'Bank Statement',
    desc: 'Bank credits, debits, UTR references',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/>
      </svg>
    ),
    color: '#f59e0b',
    form: 'bank_file',
  },
]

const STRATEGY_LABEL = {
  transaction_id_3way:       'TXN ID (3-way)',
  transaction_id_order_psp:  'TXN ID (2-way)',
  order_id_match:            'Order ID',
  reference_utr_match:       'UTR / Reference',
  reference_order_bank:      'Ref Order↔Bank',
  settlement_batch_match:    'Settlement Batch',
  settlement_order_psp:      'Settlement Order↔PSP',
  date_window_3way:          'Date Window (3-way)',
  date_window_order_psp:     'Date Window (2-way)',
  amount_ref_fuzzy:          'Amount + Ref Fuzzy',
  amount_tolerance_only:     'Amount Tolerance',
  fuzzy_heuristic:           'Fuzzy / Heuristic',
}

/* ── Confidence badge ─────────────────────────────────────────────────────── */
function ConfBadge({ score }) {
  const cls = score >= 90 ? 'conf-excellent'
    : score >= 75 ? 'conf-good'
    : score >= 60 ? 'conf-fair'
    : 'conf-poor'
  return <span className={`conf-badge ${cls}`}>{score}%</span>
}

/* ── Strategy chip ────────────────────────────────────────────────────────── */
function StrategyChip({ strategy }) {
  const label = STRATEGY_LABEL[strategy] || strategy.replace(/_/g, ' ')
  return <span className="strategy-chip">{label}</span>
}

/* ── Summary stat card ────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color }) {
  return (
    <div className="recon-stat-card">
      <div className="recon-stat-val" style={color ? { color } : {}}>{value}</div>
      {sub && <div className="recon-stat-sub">{sub}</div>}
      <div className="recon-stat-label">{label}</div>
    </div>
  )
}

/* ── Unmatched panel ──────────────────────────────────────────────────────── */
function UnmatchedPanel({ label, icon, color, txns }) {
  const [open, setOpen] = useState(false)
  if (!txns?.length) return null
  return (
    <div className="unmatched-panel">
      <button className="unmatched-toggle" onClick={() => setOpen(o => !o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ color }}>{icon} {label}</span>
        <span className="unmatched-count">{txns.length} unmatched</span>
      </button>
      {open && (
        <div className="table-wrap" style={{ marginTop: '0.5rem' }}>
          <table>
            <thead>
              <tr>
                <th>#</th><th>TXN ID</th><th>Order ID</th>
                <th>Date</th><th>Gross</th><th>Net</th><th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--clr-muted)' }}>{t.raw_row_index ?? i+1}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.76rem' }}>{t.transaction_id ?? '—'}</td>
                  <td>{t.order_id ?? '—'}</td>
                  <td>{t.date ?? '—'}</td>
                  <td>₹{Number(t.gross_amount).toFixed(2)}</td>
                  <td style={{ color: 'var(--clr-success)' }}>₹{Number(t.net_amount).toFixed(2)}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>{t.reference ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function Reconciliation({ onNavigate, onReconciliationComplete, externalReport }) {
  const [files, setFiles] = useState({ order: null, psp: null, bank: null })
  const [dragging, setDragging] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tolerance, setTolerance] = useState('0.5')
  const [dateWindow, setDateWindow] = useState('2')
  const [report, setReport] = useState(externalReport || null)
  const [error, setError] = useState(null)
  const inputRefs = useRef({})

  React.useEffect(() => {
    if (externalReport) {
      setReport(externalReport)
    }
  }, [externalReport])

  const handleFile = (key, file) => file && setFiles(p => ({ ...p, [key]: file }))
  const selectedCount = SOURCES.filter(s => files[s.key]).length
  const allSelected = selectedCount === 3

  const handleRun = async () => {
    setLoading(true); setError(null); setReport(null)
    try {
      const data = await runReconciliation(
        files.order, files.psp, files.bank,
        parseFloat(tolerance), parseInt(dateWindow)
      )
      setReport(data)
      if (onReconciliationComplete) {
        onReconciliationComplete(data)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* ── Upload panel ── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Upload Files for 3-Way Matching</h3>

        <div className="upload-grid">
          {SOURCES.map(src => {
            const file = files[src.key]
            return (
              <div
                key={src.key}
                className={`upload-zone recon-upload-zone ${dragging === src.key ? 'dragging' : ''}`}
                style={{ borderColor: file ? src.color : undefined }}
                onDragOver={e => { e.preventDefault(); setDragging(src.key) }}
                onDragLeave={() => setDragging(null)}
                onDrop={e => { e.preventDefault(); setDragging(null); handleFile(src.key, e.dataTransfer.files?.[0]) }}
                onClick={() => inputRefs.current[src.key]?.click()}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  ref={el => (inputRefs.current[src.key] = el)}
                  onChange={e => { handleFile(src.key, e.target.files?.[0]); e.target.value = '' }}
                  onClick={e => e.stopPropagation()}
                />
                <div className="upload-icon" style={{ color: src.color }}>{src.icon}</div>
                <h3>{src.label}</h3>
                <p>{src.desc}</p>
                {file ? (
                  <div className="file-name">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    {file.name} ({(file.size/1024).toFixed(1)} KB)
                  </div>
                ) : (
                  <span className="browse-prompt">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.8 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Drop or click to browse
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Settings row */}
        <div className="recon-settings">
          <label className="recon-setting">
            <span>Tolerance %</span>
            <input type="number" min="0" max="10" step="0.1" value={tolerance}
              onChange={e => setTolerance(e.target.value)}
              className="recon-input" />
          </label>
          <label className="recon-setting">
            <span>Date Window (days)</span>
            <input type="number" min="0" max="30" step="1" value={dateWindow}
              onChange={e => setDateWindow(e.target.value)}
              className="recon-input" />
          </label>

          {/* Files progress pill */}
          <div className="files-progress">
            {SOURCES.map(s => (
              <span
                key={s.key}
                className={`file-dot ${files[s.key] ? 'selected' : ''}`}
                title={files[s.key] ? `${s.label}: ${files[s.key].name}` : `${s.label}: not uploaded`}
              >
                <span className="dot-mini-icon">{s.icon}</span>
              </span>
            ))}
            <span className="files-count">{selectedCount}/3</span>
          </div>

          <button
            className="btn btn-primary"
            disabled={!allSelected || loading}
            onClick={handleRun}
            title={!allSelected ? `Please upload all 3 files (${selectedCount}/3 selected)` : 'Run 3-Way Matching'}
            style={{ marginLeft: 'auto' }}
          >
            {loading ? (
              <>
                <span className="spinner" /> Running…
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                Run 3-Way Matching
              </>
            )}
          </button>
          {Object.values(files).some(Boolean) && !loading && (
            <button className="btn btn-ghost"
              onClick={() => { setFiles({ order: null, psp: null, bank: null }); setReport(null); setError(null) }}>
              Clear
            </button>
          )}
        </div>

        {error && (
          <div className="error-list" style={{ marginTop: '1rem' }}>
            <h4>Error</h4><p style={{ fontSize: '0.85rem' }}>{error}</p>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {report && (
        <>
          {/* ── KPI strip ── */}
          <div className="recon-stat-strip">
            <StatCard
              label="Total Transactions"
              value={Math.max(report.total_order, report.total_psp, report.total_bank)}
              color="var(--clr-text)"
            />
            <StatCard
              label="Successfully Linked"
              value={report.total_matched}
              sub={`of ${Math.max(report.total_order, report.total_psp, report.total_bank)}`}
              color="var(--clr-success)"
            />
            <StatCard
              label="Match Rate"
              value={`${report.match_rate}%`}
              color={report.match_rate >= 80 ? 'var(--clr-success)' : report.match_rate >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)'}
            />
            <StatCard
              label="Reconciled"
              value={report.total_reconciled}
              sub={`of ${report.total_matched} linked`}
              color="var(--clr-success)"
            />
            <StatCard
              label="Reconciliation Rate"
              value={`${report.reconciliation_rate}%`}
              sub={`tol ±${report.tolerance_pct}%`}
              color={report.reconciliation_rate >= 80 ? 'var(--clr-success)' : report.reconciliation_rate >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)'}
            />
            <div
              style={{ cursor: onNavigate && report.total_exceptions > 0 ? 'pointer' : 'default' }}
              onClick={() => onNavigate && report.total_exceptions > 0 && onNavigate('exceptions')}
              title={report.total_exceptions > 0 ? 'Click to view exceptions in workspace' : ''}
            >
              <StatCard
                label={report.total_exceptions > 0 ? 'Exceptions ↗' : 'Exceptions'}
                value={report.total_exceptions}
                color={report.total_exceptions === 0 ? 'var(--clr-success)' : 'var(--clr-danger)'}
              />
            </div>
          </div>

          {/* ── Secondary amounts row ── */}
          <div className="recon-stat-strip" style={{ marginBottom: '1.25rem' }}>
            <StatCard label="Expected Net"  value={`₹${Number(report.total_expected_net).toFixed(2)}`} />
            <StatCard label="Bank Credit"   value={`₹${Number(report.total_actual_bank).toFixed(2)}`} />
            <StatCard
              label="Net Difference (Bank − Expected)"
              value={`${Number(report.total_difference) >= 0 ? '+' : ''}₹${Number(report.total_difference).toFixed(2)}`}
              color={Number(report.total_difference) >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)'}
            />
          </div>

          {/* ── Results table ── */}
          {report.results?.length > 0 && (
            <ReconResultsTable results={report.results} />
          )}

          {/* ── Exceptions panel ── */}
          {report.exceptions?.length > 0 && (
            <ExceptionsPanel exceptions={report.exceptions} onNavigate={onNavigate} />
          )}

          {/* ── Unmatched panels ── */}
          <UnmatchedSummary report={report} />
        </>
      )}
    </div>
  )
}

/* ── Results table ──────────────────────────────────────────────────── */
function ReconResultsTable({ results }) {
  const [expanded, setExpanded] = useState(null)
  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <h3 style={{ marginBottom: '0.85rem' }}>
        All Transactions
        <span style={{ fontSize: '0.82rem', fontWeight: 400, color: 'var(--clr-muted)', marginLeft: '0.5rem' }}>
          ({results.length} results)
        </span>
      </h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Status</th>
              <th>Confidence</th>
              <th>Strategy</th>
              <th>PSP TXN ID</th>
              <th>Gross</th>
              <th>Expected Net</th>
              <th>Bank Credit</th>
              <th>Bank−Expected</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <React.Fragment key={i}>
                <tr
                  className={r.status === 'reconciled' ? 'match-reconciled' : 'match-exception'}
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ color: 'var(--clr-muted)', width: 24 }}>
                    <span style={{ fontSize: '0.7rem' }}>{expanded === i ? '▼' : '▶'}</span>
                  </td>
                  <td>
                    {r.status === 'reconciled'
                      ? <span className="recon-status-ok">Reconciled</span>
                      : <span className="recon-status-err">Exception</span>}
                  </td>
                  <td><ConfBadge score={r.confidence} /></td>
                  <td><StrategyChip strategy={r.match_strategy} /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {r.psp_txn?.transaction_id ?? '—'}
                  </td>
                  <td>₹{Number(r.settlement?.gross_amount ?? 0).toFixed(2)}</td>
                  <td style={{ color: 'var(--clr-success)', fontWeight: 600 }}>
                    ₹{Number(r.settlement?.expected_net ?? 0).toFixed(2)}
                  </td>
                  <td style={{ color: '#60a5fa' }}>
                    ₹{Number(r.settlement?.actual_bank_credit ?? 0).toFixed(2)}
                  </td>
                  <td style={{ color: Number(r.settlement?.difference ?? 0) >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontWeight: 600 }}>
                    {Number(r.settlement?.difference ?? 0) >= 0 ? '+' : ''}₹{Number(r.settlement?.difference ?? 0).toFixed(2)}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>
                    {r.reason_code
                      ? <span className="reason-chip">{r.reason_code}</span>
                      : '—'}
                  </td>
                </tr>
                {expanded === i && (
                  <tr key={`${i}-detail`}>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <SettlementBreakdownRow r={r} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Settlement breakdown card ────────────────────────────────────── */
function SettlementCardBlock({ s }) {
  if (!s) return null
  const rows = [
    { label: 'Gross Amount', val: s.gross_amount, neg: false },
    { label: '− Platform Fee', val: s.fee_amount, neg: true },
    { label: '− GST (18% on fee)', val: s.tax_amount, neg: true },
    { label: '− TDS (2%)', val: s.tds_amount, neg: true },
    { label: '− Refunds', val: s.refund_amount, neg: true },
    { label: '− Adjustments', val: s.other_adjustments, neg: true },
  ]
  const diffVal = Number(s.difference ?? 0)
  return (
    <div style={{ background: 'var(--clr-surface)', borderRadius: 8, padding: '1rem', fontSize: '0.82rem', border: '1px solid var(--clr-border)' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--clr-text)' }}>Settlement Breakdown</div>
      {rows.map(r => r.val > 0 && (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid var(--clr-border)' }}>
          <span style={{ color: 'var(--clr-muted)' }}>{r.label}</span>
          <span style={{ color: r.neg ? 'var(--clr-danger)' : 'var(--clr-text)', fontWeight: 500 }}>
            {r.neg ? '−' : ''}₹{Number(r.val).toFixed(2)}
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', marginTop: '0.25rem', fontWeight: 700 }}>
        <span>Expected Net</span>
        <span style={{ color: 'var(--clr-success)' }}>₹{Number(s.expected_net ?? 0).toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
        <span style={{ color: 'var(--clr-muted)' }}>Actual Bank Credit</span>
        <span style={{ color: '#60a5fa', fontWeight: 600 }}>₹{Number(s.actual_bank_credit ?? 0).toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderTop: '2px solid var(--clr-border)', marginTop: '0.25rem', fontWeight: 700 }}>
        <span>Difference (Bank − Expected)</span>
        <span style={{ fontWeight: 700, color: diffVal >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontFamily: 'monospace' }}>
          {diffVal >= 0 ? '+' : ''}₹{Math.abs(diffVal).toFixed(2)}
        </span>
      </div>
    </div>
  )
}

/* ── Settlement breakdown expanded row ──────────────────────────── */
function SettlementBreakdownRow({ r }) {
  const s = r.settlement || {}
  return (
    <div style={{ padding: '0.75rem 1rem', background: 'var(--clr-surface-2)' }}>
      <SettlementCardBlock s={s} />
      {r.reason_detail && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem 1rem',
          background: '#1e1b2e',
          borderLeft: '3px solid var(--clr-warning)',
          borderRadius: '0 6px 6px 0',
          fontSize: '0.82rem',
          color: '#e2e8f0',
        }}>
          <strong>Why Flagged:</strong> {r.reason_detail}
        </div>
      )}
    </div>
  )
}

/* ── Exceptions panel (Matches Screenshot Layout) ───────────────── */
function ExceptionsPanel({ exceptions, onNavigate }) {
  return (
    <div className="card exception-card" style={{ marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: 0, color: 'var(--clr-danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Exceptions Flagged</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f87171', background: 'rgba(239, 68, 68, 0.15)', padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
              {exceptions.length} rows need attention
            </span>
          </h3>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--clr-muted)' }}>
            Financial discrepancies detected during 3-way reconciliation
          </p>
        </div>
        {onNavigate && (
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            onClick={() => onNavigate('exceptions', 0)}
          >
            Open Exception Workspace →
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {exceptions.map((r, i) => {
          const txn = r.psp_txn || r.bank_txn || r.order_txn
          const txnId = txn?.transaction_id || `Row ${i + 1}`
          const s = r.settlement || {}
          const diffVal = Number(s.difference ?? 0)

          return (
            <div
              key={i}
              style={{
                background: 'var(--clr-surface-2)',
                border: '1px solid var(--clr-border)',
                borderRadius: '8px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--clr-muted)' }}>#{i}</span>
                  <span className="reason-chip danger" style={{ fontWeight: 600 }}>
                    {r.reason_code ? r.reason_code.replace(/_/g, ' ') : 'EXCEPTION'}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--clr-text)', background: 'var(--clr-surface)', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid var(--clr-border)' }}>
                    {txnId}
                  </span>
                  {txn?.date && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>
                      📅 {String(txn.date)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>
                  <span style={{ fontWeight: 700, color: diffVal >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    Diff: {diffVal >= 0 ? '+' : ''}₹{Math.abs(diffVal).toFixed(2)}
                  </span>
                  {onNavigate && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', border: '1px solid var(--clr-border)' }}
                      onClick={() => onNavigate('exceptions', i)}
                    >
                      Investigate in Workspace →
                    </button>
                  )}
                </div>
              </div>

              {/* Why Flagged (Matches yellow-bordered box in screenshot) */}
              {r.reason_detail && (
                <div style={{
                  padding: '0.75rem 1rem',
                  background: '#1e1b2e',
                  borderLeft: '3px solid var(--clr-warning)',
                  borderRadius: '0 6px 6px 0',
                  fontSize: '0.82rem',
                  color: '#e2e8f0',
                }}>
                  <strong style={{ color: 'var(--clr-warning)' }}>Why Flagged:</strong> {r.reason_detail}
                </div>
              )}

              {/* Settlement Breakdown (Matches table card in screenshot) */}
              <SettlementCardBlock s={s} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Unmatched summary ─────────────────────────────────────────────── */
function UnmatchedSummary({ report }) {
  const unmatchedPsp  = report.exceptions?.filter(r => r.reason_code === 'MISSING_BANK')  || []
  const unmatchedBank = report.exceptions?.filter(r => r.reason_code === 'MISSING_PSP')   || []
  const unmatchedOrder = report.results?.filter(r => r.reason_code === 'MISSING_ORDER')   || []

  if (!unmatchedPsp.length && !unmatchedBank.length && !unmatchedOrder.length) {
    return (
      <div className="card">
        <p style={{ color: 'var(--clr-success)', fontSize: '0.85rem' }}>
          ✅ All transactions matched — no unmatched rows.
        </p>
      </div>
    )
  }
  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>Unmatched Transactions</h3>
      <UnmatchedPanel label="Razorpay / PSP (no bank match)" icon="💳" color="#22d3a5"
        txns={unmatchedPsp.map(r => r.psp_txn).filter(Boolean)} />
      <UnmatchedPanel label="Bank (no PSP match)" icon="🏦" color="#f59e0b"
        txns={unmatchedBank.map(r => r.bank_txn).filter(Boolean)} />
      <UnmatchedPanel label="No Order Record" icon="📋" color="#6366f1"
        txns={unmatchedOrder.map(r => r.psp_txn).filter(Boolean)} />
    </div>
  )
}
