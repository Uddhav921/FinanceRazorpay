import { useState, useEffect } from 'react'
import FileUpload from './components/FileUpload'
import UploadResults from './components/UploadResults'
import { checkHealth } from './services/api'

/* ── Nav icons ────────────────────────────────────────────────────────────── */
const icons = {
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  reconcile: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
    </svg>
  ),
  anomaly: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
}

/* ── Toast ────────────────────────────────────────────────────────────────── */
function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
      ))}
    </div>
  )
}

/* ── App ──────────────────────────────────────────────────────────────────── */
export default function App() {
  const [page, setPage] = useState('upload')
  const [results, setResults] = useState([])
  const [backendStatus, setBackendStatus] = useState('checking') // 'ok' | 'error' | 'checking'
  const [toasts, setToasts] = useState([])

  const addToast = (msg, type = 'success') => {
    const id = Date.now()
    setToasts(p => [...p, { id, msg, type }])
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000)
  }

  /* health check on mount */
  useEffect(() => {
    checkHealth()
      .then(() => { setBackendStatus('ok'); addToast('Backend connected ✓') })
      .catch(() => { setBackendStatus('error'); addToast('Cannot reach backend at :8000', 'error') })
  }, [])

  const handleResult = (res) => {
    setResults(res)
    const ok = res.filter(r => !r.error).length
    const fail = res.filter(r => r.error).length
    if (ok)   addToast(`${ok} file(s) parsed successfully`)
    if (fail) addToast(`${fail} file(s) failed to parse`, 'error')
  }

  const NAV = [
    { key: 'upload',      label: 'Data Sources',    icon: icons.upload },
    { key: 'dashboard',   label: 'Dashboard',       icon: icons.dashboard },
    { key: 'reconcile',   label: 'Reconciliation',  icon: icons.reconcile },
    { key: 'anomalies',   label: 'Anomalies',       icon: icons.anomaly },
  ]

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">AI Finance<span>Controller</span></div>
        {NAV.map(n => (
          <button
            key={n.key}
            className={`nav-item ${page === n.key ? 'active' : ''}`}
            onClick={() => setPage(n.key)}
          >
            {n.icon}
            {n.label}
          </button>
        ))}

        {/* Backend status indicator */}
        <div style={{ marginTop: 'auto', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: backendStatus === 'ok' ? 'var(--clr-success)' : backendStatus === 'error' ? 'var(--clr-danger)' : 'var(--clr-warning)',
            flexShrink: 0,
            boxShadow: backendStatus === 'ok' ? '0 0 6px var(--clr-success)' : 'none',
          }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>
            {backendStatus === 'ok' ? 'API connected' : backendStatus === 'error' ? 'API offline' : 'Connecting…'}
          </span>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-area">
        <header className="topbar">
          <div>
            <h2 style={{ color: 'var(--clr-text)', marginBottom: '0.1rem' }}>
              {NAV.find(n => n.key === page)?.label}
            </h2>
            <p style={{ fontSize: '0.8rem', margin: 0 }}>
              {page === 'upload' && 'Upload CSV/XLSX files from your three data sources'}
              {page === 'dashboard' && 'Coming soon — Module 2'}
              {page === 'reconcile' && 'Coming soon — Module 3'}
              {page === 'anomalies' && 'Coming soon — Module 4'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', background: 'var(--clr-surface-2)', padding: '0.3rem 0.75rem', borderRadius: '999px', border: '1px solid var(--clr-border)' }}>
              MVP v0.1
            </span>
          </div>
        </header>

        <main className="page-content">
          {/* ── Upload / Data Sources page ── */}
          {page === 'upload' && (
            <>
              <div className="card" style={{ marginBottom: 0 }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ marginBottom: '0.35rem' }}>Upload Data Sources</h2>
                  <p>Select files for one or more sources. Accepted formats: <strong>CSV, XLSX, XLS</strong></p>
                </div>
                <FileUpload onResult={handleResult} />
              </div>
              <UploadResults results={results} />
            </>
          )}

          {/* ── Placeholder pages ── */}
          {page !== 'upload' && (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚧</div>
              <h2 style={{ marginBottom: '0.5rem' }}>Coming Soon</h2>
              <p>This module will be implemented in the next step.</p>
              <button className="btn btn-ghost" style={{ marginTop: '1.5rem' }} onClick={() => setPage('upload')}>
                ← Back to Data Sources
              </button>
            </div>
          )}
        </main>
      </div>

      <Toast toasts={toasts} />
    </div>
  )
}
