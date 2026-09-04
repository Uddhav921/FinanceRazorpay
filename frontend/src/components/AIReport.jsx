import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { generateAIReport, getLatestAIReport } from '../services/api'

export default function AIReport() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)

  // Try to load the latest report on mount
  useEffect(() => {
    getLatestAIReport()
      .then(res => setReport(res))
      .catch(err => {
        // If 404, it means no report generated yet, which is fine
        if (!err.message.includes('404')) {
          console.error(err)
        }
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

  return (
    <div className="card" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>AI Narrative Report</h2>
          <p style={{ color: 'var(--clr-muted)', margin: 0 }}>
            Powered by Google Gemini 2.0 Flash
          </p>
        </div>
        <button 
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={loading}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          {loading ? (
            <>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              Generating...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Generate Insight
            </>
          )}
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '1rem' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {!report && !loading && !error && (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--clr-muted)', background: 'var(--clr-surface-2)', borderRadius: '8px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '1rem', opacity: 0.5 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <p>No report generated for the latest reconciliation yet.</p>
          <p style={{ fontSize: '0.85rem' }}>Click "Generate Insight" to analyze the current run.</p>
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
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--clr-border)', fontSize: '0.85rem', color: 'var(--clr-muted)' }}>
            <div><strong>Model:</strong> {report.model_used}</div>
            <div><strong>Tokens:</strong> {report.tokens_used}</div>
            {report.anomaly_counts && (
              <div>
                <strong>Anomalies:</strong> {report.anomaly_counts.total} 
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
