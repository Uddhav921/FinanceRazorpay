import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { generateAIReport, getLatestAIReport } from '../services/api'

export default function AIReport({ onNavigate }) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  // Try to load the latest report on mount
  useEffect(() => {
    getLatestAIReport()
      .then(res => {
        if (res && res.has_report !== false && res.markdown) {
          setReport(res)
        }
      })
      .catch(() => {
        // No cached report yet is normal, ignore
      })
  }, [])

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await generateAIReport()
      setReport(res)
    } catch (err) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  const isNoReconError = error && error.toLowerCase().includes('no reconciliation')

  return (
    <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>AI Narrative Report</h2>
          <p style={{ color: 'var(--clr-muted)', margin: 0, fontSize: '0.85rem' }}>
            Powered by Google Gemini 3.6 Flash & Financial Intelligence
          </p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={loading}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.6rem 1.25rem' }}
        >
          {loading ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Generating Narrative…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              {report ? 'Regenerate Narrative' : 'Generate Insight'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div style={{ padding: '1.25rem', background: '#2d1215', border: '1px solid #7f1d1d', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <strong style={{ color: '#f87171' }}>Report Generation Notice:</strong>
              <p style={{ margin: '0.4rem 0 0', color: '#fca5a5', fontSize: '0.875rem' }}>{error}</p>
            </div>
            {isNoReconError && onNavigate && (
              <button 
                className="btn btn-primary" 
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', whiteSpace: 'nowrap' }}
                onClick={() => onNavigate('reconcile')}
              >
                ⚡ Go to Reconciliation
              </button>
            )}
          </div>
        </div>
      )}

      {!report && !loading && !error && (
        <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--clr-muted)', background: 'var(--clr-surface-2)', borderRadius: '8px', border: '1px dashed var(--clr-border)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
          <h3 style={{ color: 'var(--clr-text)', marginBottom: '0.5rem' }}>Automated Financial Analysis</h3>
          <p style={{ maxWidth: 520, margin: '0 auto 1.5rem', fontSize: '0.88rem', lineHeight: 1.6 }}>
            Generate executive-ready commentary, exception root-cause hypotheses, anomaly risk ratings, and actionable next steps based on your latest 3-way reconciliation run.
          </p>
          <button 
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={loading}
            style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}
          >
            ⚡ Generate Narrative Report
          </button>
        </div>
      )}

      {report && (
        <div className="report-content" style={{
          background: 'var(--clr-surface-2)',
          padding: '2rem',
          borderRadius: '8px',
          border: '1px solid var(--clr-border)',
          lineHeight: 1.6
        }}>
          {/* Metadata Strip */}
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--clr-border)', fontSize: '0.85rem', color: 'var(--clr-muted)', flexWrap: 'wrap' }}>
            <div><strong>Engine:</strong> <span style={{ color: 'var(--clr-primary)', fontWeight: 600 }}>{report.model_used || 'Gemini Flash'}</span></div>
            {report.tokens_used > 0 && <div><strong>Tokens:</strong> {report.tokens_used}</div>}
            {report.anomaly_counts && (
              <div>
                <strong>Anomalies Detected:</strong> {report.anomaly_counts.total} 
                <span style={{ marginLeft: '0.5rem', color: report.anomaly_counts.high > 0 ? 'var(--clr-danger)' : 'inherit' }}>
                  ({report.anomaly_counts.high} High, {report.anomaly_counts.medium} Med, {report.anomaly_counts.low} Low)
                </span>
              </div>
            )}
          </div>
          
          <div className="markdown-body">
            <ReactMarkdown>{report.markdown}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
