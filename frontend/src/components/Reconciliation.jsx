import { useState, useRef } from 'react'
import { runReconciliation } from '../services/api'

/* ── Config ──────────────────────────────────────────────────────────────── */
const SOURCES = [
  { key: 'order',  label: 'Order / Ledger',  icon: '📋', color: '#6366f1', form: 'order_file' },
  { key: 'psp',    label: 'Razorpay / PSP',  icon: '💳', color: '#22d3a5', form: 'psp_file' },
  { key: 'bank',   label: 'Bank Statement',  icon: '🏦', color: '#f59e0b', form: 'bank_file' },
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
export default function Reconciliation() {
  const [files, setFiles] = useState({ order: null, psp: null, bank: null })
  const [dragging, setDragging] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tolerance, setTolerance] = useState('0.5')
  const [dateWindow, setDateWindow] = useState('2')
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const inputRefs = useRef({})

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
                {file
                  ? <div className="file-name">📄 {file.name} ({(file.size/1024).toFixed(1)} KB)</div>
                  : <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>Drop or click to browse</span>
                }
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
                {s.icon}
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
            {loading
              ? <><span className="spinner" /> Running…</>
              : <>⚡ Run 3-Way Matching</>
            }
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
          {/* Summary strip */}
          <div className="recon-stat-strip">
            <StatCard label="Order Rows"    value={report.total_order} color="#6366f1" />
            <StatCard label="PSP Rows"      value={report.total_psp}   color="#22d3a5" />
            <StatCard label="Bank Rows"     value={report.total_bank}  color="#f59e0b" />
            <StatCard label="Matched"       value={report.matched.length} color="var(--clr-success)" />
            <StatCard label="Match Rate"    value={`${report.match_rate}%`}
              sub={`${report.matched.length} / ${Math.max(report.total_order, report.total_psp, report.total_bank)}`}
              color={report.match_rate >= 80 ? 'var(--clr-success)' : report.match_rate >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)'} />
            <StatCard label="Reconciled"    value={`${report.reconciled_rate}%`}
              sub={`tol ${report.tolerance}%`}
              color={report.reconciled_rate >= 80 ? 'var(--clr-success)' : 'var(--clr-warning)'} />
          </div>

          {/* Matched table */}
          {report.matched.length > 0 && (
            <div className="card" style={{ marginBottom: '1.25rem' }}>
              <h3 style={{ marginBottom: '0.85rem' }}>
                Matched Transactions
                <span style={{ fontSize: '0.82rem', fontWeight: 400, color: 'var(--clr-muted)', marginLeft: '0.5rem' }}>
                  ({report.matched.length} matches)
                </span>
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Confidence</th>
                      <th>Strategy</th>
                      <th>Reconciled</th>
                      <th>Order TXN ID</th>
                      <th>PSP TXN ID</th>
                      <th>PSP Net</th>
                      <th>Bank Net</th>
                      <th>Δ Amount</th>
                      <th>Δ Days</th>
                      <th>Date (PSP)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.matched.map((m, i) => (
                      <tr key={i} className={m.is_reconciled ? 'match-reconciled' : 'match-exception'}>
                        <td><ConfBadge score={m.confidence} /></td>
                        <td><StrategyChip strategy={m.match_strategy} /></td>
                        <td>
                          {m.is_reconciled
                            ? <span style={{ color: 'var(--clr-success)', fontWeight: 600 }}>✓ Yes</span>
                            : <span style={{ color: 'var(--clr-danger)' }}>✗ No</span>}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {m.order_txn?.transaction_id ?? '—'}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                          {m.psp_txn?.transaction_id ?? '—'}
                        </td>
                        <td>₹{Number(m.psp_txn?.net_amount ?? 0).toFixed(2)}</td>
                        <td>₹{Number(m.bank_txn?.net_amount ?? 0).toFixed(2)}</td>
                        <td style={{ color: Number(m.amount_diff) > 0 ? 'var(--clr-warning)' : 'var(--clr-success)' }}>
                          ₹{Number(m.amount_diff).toFixed(2)}
                        </td>
                        <td style={{ color: 'var(--clr-muted)' }}>
                          {m.date_diff_days != null ? `${m.date_diff_days}d` : '—'}
                        </td>
                        <td>{m.psp_txn?.date ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unmatched panels */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Unmatched Transactions</h3>
            <UnmatchedPanel label="Order / Ledger" icon="📋" color="#6366f1" txns={report.unmatched_order} />
            <UnmatchedPanel label="Razorpay / PSP" icon="💳" color="#22d3a5" txns={report.unmatched_psp} />
            <UnmatchedPanel label="Bank Statement" icon="🏦" color="#f59e0b" txns={report.unmatched_bank} />
            {!report.unmatched_order?.length && !report.unmatched_psp?.length && !report.unmatched_bank?.length && (
              <p style={{ color: 'var(--clr-success)', fontSize: '0.85rem' }}>
                ✅ All transactions matched — no unmatched rows.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
