import React, { useState, useEffect, useCallback } from 'react'
import {
  listExceptions, assignException, addComment,
  resolveException, reopenException,
  downloadExceptionsCsv, downloadReconciliationCsv,
} from '../services/api'

const STATUS_COLORS = {
  OPEN: { bg: '#fee2e2', color: '#dc2626', dot: '#dc2626' },
  IN_REVIEW: { bg: '#fef3c7', color: '#d97706', dot: '#f59e0b' },
  RESOLVED: { bg: '#dcfce7', color: '#16a34a', dot: '#22c55e' },
}

const REASON_LABELS = {
  AMOUNT_MISMATCH: 'Amount Mismatch',
  MISSING_BANK: 'Missing in Bank',
  MISSING_PSP: 'Missing in PSP',
  DATE_MISMATCH: 'Date Mismatch',
  FEE_DISCREPANCY: 'Fee Discrepancy',
  DUPLICATE: 'Duplicate',
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.OPEN
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.2rem 0.65rem', borderRadius: '999px', fontSize: '0.72rem',
      fontWeight: 600, background: c.bg, color: c.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
      {status}
    </span>
  )
}

function DiffBadge({ diff }) {
  const v = Number(diff)
  const sign = v >= 0 ? '+' : ''
  return (
    <span style={{ fontWeight: 700, color: v >= 0 ? 'var(--clr-success)' : 'var(--clr-danger)', fontFamily: 'monospace' }}>
      {sign}₹{Math.abs(v).toFixed(2)}
    </span>
  )
}

function SettlementCard({ s }) {
  const rows = [
    { label: 'Gross Amount', val: s.gross_amount, neg: false },
    { label: '− Platform Fee', val: s.fee_amount, neg: true },
    { label: '− GST (18% on fee)', val: s.tax_amount, neg: true },
    { label: '− TDS (2%)', val: s.tds_amount, neg: true },
    { label: '− Refunds', val: s.refund_amount, neg: true },
    { label: '− Adjustments', val: s.other_adjustments, neg: true },
  ]
  return (
    <div style={{ background: 'var(--clr-surface)', borderRadius: 8, padding: '1rem', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.75rem', color: 'var(--clr-text)' }}>Settlement Breakdown</div>
      {rows.map(r => r.val > 0 && (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: '1px solid var(--clr-border)' }}>
          <span style={{ color: 'var(--clr-muted)' }}>{r.label}</span>
          <span style={{ color: r.neg ? 'var(--clr-danger)' : 'var(--clr-text)' }}>
            {r.neg ? '−' : ''}₹{Number(r.val).toFixed(2)}
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', marginTop: '0.25rem', fontWeight: 700 }}>
        <span>Expected Net</span>
        <span style={{ color: 'var(--clr-success)' }}>₹{Number(s.expected_net).toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0' }}>
        <span style={{ color: 'var(--clr-muted)' }}>Actual Bank Credit</span>
        <span style={{ color: '#60a5fa' }}>₹{Number(s.actual_bank_credit).toFixed(2)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderTop: '2px solid var(--clr-border)', marginTop: '0.25rem', fontWeight: 700 }}>
        <span>Difference (Bank − Expected)</span>
        <DiffBadge diff={s.difference} />
      </div>
    </div>
  )
}

function ExceptionDetailPanel({ exc, onUpdate }) {
  const [assignInput, setAssignInput] = useState(exc.assigned_to || '')
  const [commentAuthor, setCommentAuthor] = useState('FinOps Team')
  const [commentText, setCommentText] = useState('')
  const [resolveNote, setResolveNote] = useState('')
  const [busy, setBusy] = useState(false)

  const doAssign = async () => {
    if (!assignInput.trim()) return
    setBusy(true)
    await assignException(exc.id, assignInput.trim())
    onUpdate()
    setBusy(false)
  }

  const doComment = async () => {
    if (!commentText.trim()) return
    setBusy(true)
    await addComment(exc.id, commentAuthor, commentText.trim())
    setCommentText('')
    onUpdate()
    setBusy(false)
  }

  const doResolve = async () => {
    setBusy(true)
    await resolveException(exc.id, 'FinOps Team', resolveNote)
    onUpdate()
    setBusy(false)
  }

  const doReopen = async () => {
    setBusy(true)
    await reopenException(exc.id)
    onUpdate()
    setBusy(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--clr-muted)' }}>#{exc.id}</span>
            <StatusBadge status={exc.status} />
            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: '#1e293b', borderRadius: 4, color: '#94a3b8' }}>
              {REASON_LABELS[exc.reason_code] || exc.reason_code}
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>
            {exc.transaction_id && <><strong>TXN:</strong> <span style={{ fontFamily: 'monospace' }}>{exc.transaction_id}</span></>}
            {exc.merchant_id && <span style={{ marginLeft: '1rem' }}><strong>Merchant:</strong> {exc.merchant_id}</span>}
            {exc.txn_date && <span style={{ marginLeft: '1rem' }}><strong>Date:</strong> {exc.txn_date}</span>}
          </div>
        </div>
      </div>

      {/* Reason detail */}
      {exc.reason_detail && (
        <div style={{ padding: '0.75rem', background: '#1e1b2e', borderLeft: '3px solid var(--clr-warning)', borderRadius: '0 6px 6px 0', fontSize: '0.82rem', color: '#e2e8f0' }}>
          <strong>Why Flagged:</strong> {exc.reason_detail}
        </div>
      )}

      {/* Settlement breakdown */}
      <SettlementCard s={exc.settlement} />

      {/* Assign */}
      <div style={{ background: 'var(--clr-surface)', borderRadius: 8, padding: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>Assign / Tag Stakeholder</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={assignInput} onChange={e => setAssignInput(e.target.value)}
            placeholder="e.g. Finance Team, John Doe…"
            style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)', fontSize: '0.85rem' }}
          />
          <button className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }} disabled={busy} onClick={doAssign}>
            Assign
          </button>
        </div>
        {exc.assigned_to && (
          <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--clr-success)' }}>
            ✓ Assigned to: <strong>{exc.assigned_to}</strong>
          </div>
        )}
      </div>

      {/* Comments */}
      <div style={{ background: 'var(--clr-surface)', borderRadius: 8, padding: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.85rem' }}>Comments</div>
        {exc.comments.length === 0 ? (
          <p style={{ color: 'var(--clr-muted)', fontSize: '0.8rem' }}>No comments yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {exc.comments.map((c, i) => (
              <div key={i} style={{ padding: '0.6rem', background: 'var(--clr-surface-2)', borderRadius: 6, fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <strong>{c.author}</strong>
                  <span style={{ color: 'var(--clr-muted)', fontSize: '0.75rem' }}>{c.created_at?.slice(0, 16).replace('T', ' ')}</span>
                </div>
                <div style={{ color: '#cbd5e1' }}>{c.text}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <input
            value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)}
            placeholder="Your name"
            style={{ padding: '0.4rem 0.7rem', borderRadius: 5, border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)', fontSize: '0.8rem' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              value={commentText} onChange={e => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              onKeyDown={e => e.key === 'Enter' && doComment()}
              style={{ flex: 1, padding: '0.4rem 0.7rem', borderRadius: 5, border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)', fontSize: '0.8rem' }}
            />
            <button className="btn btn-ghost" style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} disabled={busy} onClick={doComment}>Post</button>
          </div>
        </div>
      </div>

      {/* Resolve / Reopen */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
        {exc.status !== 'RESOLVED' ? (
          <>
            <input
              value={resolveNote} onChange={e => setResolveNote(e.target.value)}
              placeholder="Resolution note (optional)"
              style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 6, border: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)', color: 'var(--clr-text)', fontSize: '0.8rem' }}
            />
            <button
              onClick={doResolve} disabled={busy}
              style={{ padding: '0.5rem 1.25rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: 'var(--clr-success)', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              ✓ Mark Resolved
            </button>
          </>
        ) : (
          <button
            onClick={doReopen} disabled={busy}
            style={{ padding: '0.5rem 1.25rem', borderRadius: 6, border: '1px solid var(--clr-border)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', background: 'transparent', color: 'var(--clr-warning)' }}
          >
            ↩ Reopen
          </button>
        )}
      </div>
    </div>
  )
}

export default function ExceptionWorkspace({ onNavigate, initialSelectedId }) {
  const [exceptions, setExceptions] = useState([])
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const sf = filter === 'ALL' ? undefined : filter
      const data = await listExceptions(sf)
      setExceptions(data)
      setError(null)

      if (initialSelectedId !== null && initialSelectedId !== undefined) {
        const matched = data.find(e => e.id === Number(initialSelectedId))
        if (matched) {
          setSelected(matched)
          return
        }
      }

      if (selected !== null) {
        const updated = data.find(e => e.id === selected.id)
        if (updated) {
          setSelected(updated)
        } else if (data.length > 0) {
          setSelected(data[0])
        }
      } else if (data.length > 0) {
        // Auto-select first exception so the right detail panel is immediately showcased
        setSelected(data[0])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filter, selected?.id, initialSelectedId])

  useEffect(() => { load() }, [filter])

  useEffect(() => {
    if (initialSelectedId !== null && initialSelectedId !== undefined && exceptions.length > 0) {
      const matched = exceptions.find(e => e.id === Number(initialSelectedId))
      if (matched) setSelected(matched)
    }
  }, [initialSelectedId, exceptions])

  const counts = {
    ALL: exceptions.length,
    OPEN: exceptions.filter(e => e.status === 'OPEN').length,
    IN_REVIEW: exceptions.filter(e => e.status === 'IN_REVIEW').length,
    RESOLVED: exceptions.filter(e => e.status === 'RESOLVED').length,
  }

  if (loading) return (
    <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
      <div className="spinner" style={{ margin: '0 auto 1rem' }} />
      <p>Loading exceptions…</p>
    </div>
  )

  if (error) return (
    <div className="card" style={{ textAlign: 'center', padding: '3.5rem 2rem' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
      <h3 style={{ marginBottom: '0.5rem', color: 'var(--clr-text)' }}>No Reconciliation Run Found</h3>
      <p style={{ color: 'var(--clr-muted)', fontSize: '0.875rem', maxWidth: 460, margin: '0 auto 1.5rem' }}>
        Exceptions are generated during 3-way matching. Upload your Order, PSP, and Bank statement files in Reconciliation, run matching, and your exceptions will appear here automatically.
      </p>
      {onNavigate && (
        <button className="btn btn-primary" onClick={() => onNavigate('reconcile')}>
          ⚡ Go to Reconciliation
        </button>
      )}
    </div>
  )

  const FILTERS = ['ALL', 'OPEN', 'IN_REVIEW', 'RESOLVED']

  return (
    <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>

      {/* ── Left Panel: Exception List ── */}
      <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'hidden' }}>
        {/* Filters + Export */}
        <div className="card" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Exception Workspace</h3>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button onClick={downloadExceptionsCsv} title="Download exceptions CSV"
                style={{ padding: '0.3rem 0.6rem', borderRadius: 5, border: '1px solid var(--clr-border)', background: 'transparent', cursor: 'pointer', color: 'var(--clr-muted)', fontSize: '0.75rem' }}>
                ↓ CSV
              </button>
              <button onClick={downloadReconciliationCsv} title="Download full reconciliation CSV"
                style={{ padding: '0.3rem 0.6rem', borderRadius: 5, border: '1px solid var(--clr-border)', background: 'transparent', cursor: 'pointer', color: 'var(--clr-muted)', fontSize: '0.75rem' }}>
                ↓ Full
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  padding: '0.25rem 0.65rem', borderRadius: 999, border: '1px solid var(--clr-border)',
                  background: filter === f ? 'var(--clr-primary)' : 'transparent',
                  color: filter === f ? '#fff' : 'var(--clr-muted)',
                  cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                }}>
                {f} ({counts[f] ?? 0})
              </button>
            ))}
          </div>
        </div>

        {/* Exception list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {exceptions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--clr-muted)' }}>
              {filter === 'ALL' ? 'No exceptions in this run 🎉' : `No ${filter} exceptions.`}
            </div>
          ) : exceptions.map(exc => (
            <div
              key={exc.id}
              onClick={() => setSelected(exc)}
              style={{
                padding: '0.85rem', borderRadius: 8, cursor: 'pointer',
                background: selected?.id === exc.id ? 'rgba(99,102,241,0.12)' : 'var(--clr-surface)',
                border: selected?.id === exc.id ? '1.5px solid var(--clr-primary)' : '1px solid var(--clr-border)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--clr-muted)' }}>#{exc.id}</span>
                <StatusBadge status={exc.status} />
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                {REASON_LABELS[exc.reason_code] || exc.reason_code}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{exc.transaction_id || '—'}</span>
                <DiffBadge diff={exc.settlement?.difference} />
              </div>
              {exc.assigned_to && (
                <div style={{ fontSize: '0.72rem', color: 'var(--clr-success)', marginTop: '0.25rem' }}>
                  👤 {exc.assigned_to}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Panel: Detail ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selected ? (
          <div className="card">
            <ExceptionDetailPanel exc={selected} onUpdate={load} />
          </div>
        ) : (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--clr-muted)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.4 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p>Select an exception from the list to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
