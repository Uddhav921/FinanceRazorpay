import { useState, useRef } from 'react'
import { uploadDataSource } from '../services/api'

const SOURCES = [
  {
    key: 'order_ledger',
    label: 'Order / Ledger',
    desc: 'Internal ERP orders, invoices, adjustments',
    color: '#6366f1',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12h6M9 16h4"/>
      </svg>
    ),
  },
  {
    key: 'razorpay_psp',
    label: 'Razorpay / PSP',
    desc: 'Settlement report with fees, taxes, TDS',
    color: '#22d3a5',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
      </svg>
    ),
  },
  {
    key: 'bank_statement',
    label: 'Bank Statement',
    desc: 'Bank credits, debits, UTR references',
    color: '#f59e0b',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/>
      </svg>
    ),
  },
]

export default function FileUpload({ onResult }) {
  const [files, setFiles] = useState({ order_ledger: null, razorpay_psp: null, bank_statement: null })
  const [dragging, setDragging] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({})
  const inputRefs = useRef({})

  const handleFile = (source, file) => {
    if (!file) return
    setFiles(prev => ({ ...prev, [source]: file }))
  }

  const handleDrop = (source, e) => {
    e.preventDefault()
    setDragging(null)
    const file = e.dataTransfer.files?.[0]
    handleFile(source, file)
  }

  const handleUploadAll = async () => {
    const toUpload = SOURCES.filter(s => files[s.key])
    if (!toUpload.length) return

    setLoading(true)
    const results = []

    for (const src of toUpload) {
      setProgress(p => ({ ...p, [src.key]: 'uploading' }))
      try {
        const data = await uploadDataSource(files[src.key], src.key)
        setProgress(p => ({ ...p, [src.key]: 'done' }))
        results.push({ source: src.key, label: src.label, ...data })
      } catch (err) {
        setProgress(p => ({ ...p, [src.key]: 'error' }))
        results.push({ source: src.key, label: src.label, error: err.message })
      }
    }

    setLoading(false)
    onResult(results)
  }

  const anySelected = SOURCES.some(s => files[s.key])

  return (
    <div>
      <div className="upload-grid">
        {SOURCES.map(src => {
          const file = files[src.key]
          const state = progress[src.key]
          return (
            <div
              key={src.key}
              className={`upload-zone ${dragging === src.key ? 'dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(src.key) }}
              onDragLeave={() => setDragging(null)}
              onDrop={e => handleDrop(src.key, e)}
              onClick={() => inputRefs.current[src.key]?.click()}
            >
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                ref={el => (inputRefs.current[src.key] = el)}
                onChange={e => handleFile(src.key, e.target.files?.[0])}
                onClick={e => e.stopPropagation()}
              />
              <div className="upload-icon" style={{ color: src.color }}>
                {src.icon}
              </div>
              <h3>{src.label}</h3>
              <p>{src.desc}</p>

              {file && (
                <div className="file-name">
                  📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}

              {state === 'uploading' && (
                <span className="badge badge-info">⏳ Uploading…</span>
              )}
              {state === 'done' && (
                <span className="badge badge-success">✓ Uploaded</span>
              )}
              {state === 'error' && (
                <span className="badge badge-danger">✗ Failed</span>
              )}
              {!file && !state && (
                <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                  Drop file here or click to browse
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          className="btn btn-primary"
          disabled={!anySelected || loading}
          onClick={handleUploadAll}
        >
          {loading ? <span className="spinner" /> : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          )}
          {loading ? 'Uploading…' : `Upload ${SOURCES.filter(s => files[s.key]).length || ''} File(s)`}
        </button>

        {anySelected && !loading && (
          <button
            className="btn btn-ghost"
            onClick={() => { setFiles({ order_ledger: null, razorpay_psp: null, bank_statement: null }); setProgress({}) }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
