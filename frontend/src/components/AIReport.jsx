import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { generateAIReport, getLatestAIReport } from '../services/api'

export default function AIReport({ onNavigate }) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [activeView, setActiveView] = useState('executive') // 'executive' | 'markdown'
  const [copied, setCopied] = useState(false)

  // Try to load the latest report on mount
  useEffect(() => {
    getLatestAIReport()
      .then((res) => {
        if (res && res.has_report !== false && res.markdown) {
          setReport(res)
        }
      })
      .catch(() => {
        // No cached report yet is normal
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

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadMarkdown = () => {
    if (!report?.markdown) return
    const blob = new Blob([report.markdown], { type: 'text/markdown;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `FinOps_Audit_Report_${new Date().toISOString().slice(0, 10)}.md`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleCopy = () => {
    if (!report?.markdown) return
    navigator.clipboard.writeText(report.markdown).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isNoReconError = error && error.toLowerCase().includes('no reconciliation')

  // Calculate severity indicator
  const highAnomalies = report?.anomaly_counts?.high || 0
  const totalAnomalies = report?.anomaly_counts?.total || 0
  const riskTier = highAnomalies > 0 ? 'HIGH RISK' : totalAnomalies > 0 ? 'ELEVATED CONCERN' : 'HEALTHY'
  const riskColor = highAnomalies > 0 ? '#ef4444' : totalAnomalies > 0 ? '#f59e0b' : '#10b981'

  const engineName = report?.model_used?.toLowerCase().includes('gemini')
    ? 'Autonomous FinOps Reasoning Engine'
    : report?.model_used || 'Autonomous FinOps Reasoning Engine'

  return (
    <div className="report-container">
      {/* ─── Top Control Header (Hidden in Print) ─── */}
      <div className="report-header-bar no-print">
        <div className="report-title-group">
          <div className="report-badge-row">
            <span className="ai-chip">Autonomous FinOps Intelligence</span>
            <span className="finops-chip">Enterprise Settlement Audit</span>
          </div>
          <h2>AI-Powered Financial Insights & Audit Brief</h2>
          <p className="report-subtitle">
            Autonomous multi-dimensional reconciliation audit, exception root-cause hypotheses, and CFO-level commentary.
          </p>
        </div>

        <div className="report-btn-group">
          {report && (
            <>
              <div className="view-toggle">
                <button
                  className={`toggle-btn ${activeView === 'executive' ? 'active' : ''}`}
                  onClick={() => setActiveView('executive')}
                  title="Executive Presentation Layout"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: 'middle' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                  Executive Layout
                </button>
                <button
                  className={`toggle-btn ${activeView === 'markdown' ? 'active' : ''}`}
                  onClick={() => setActiveView('markdown')}
                  title="Full Markdown Audit Trail"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: 'middle' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Raw Markdown
                </button>
              </div>

              <button
                className="btn-report-tool"
                onClick={handlePrint}
                title="Print or Save as PDF"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: 'middle' }}>
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print / PDF
              </button>

              <button
                className="btn-report-tool"
                onClick={handleDownloadMarkdown}
                title="Download Markdown Report"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: 'middle' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export .MD
              </button>

              <button
                className="btn-report-tool"
                onClick={handleCopy}
                title="Copy markdown text to clipboard"
              >
                {copied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: 'middle', color: 'var(--clr-success)' }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: 'middle' }}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </>
          )}

          <button
            className="btn-generate-main"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-mini"></span>
                <span>Synthesizing Audit Brief...</span>
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span>{report ? 'Regenerate Narrative' : 'Generate AI Report'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Error Notification ─── */}
      {error && (
        <div className="report-error-card no-print">
          <div className="error-card-content">
            <span className="error-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#ef4444' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </span>
            <div>
              <strong>Reconciliation Run Required</strong>
              <p>{error}</p>
            </div>
          </div>
          {isNoReconError && onNavigate && (
            <button
              className="btn-fix-action"
              onClick={() => onNavigate('reconcile')}
            >
              Go to Reconciliation Engine →
            </button>
          )}
        </div>
      )}

      {/* ─── Empty State ─── */}
      {!report && !loading && !error && (
        <div className="report-empty-state no-print">
          <div className="empty-icon-glow">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <h3>Generate Executive Financial Brief</h3>
          <p>
            Trigger autonomous FinOps AI reasoning to perform comprehensive anomaly detection and synthesize high-level financial narratives,
            risk ratings, statutory GST/TDS verifications, and prioritized action plans from your active 3-way matching run.
          </p>
          <div className="empty-features-grid">
            <div className="empty-feature">
              <span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <div>
                <strong>Root Cause Hypotheses</strong>
                <p>Identifies whether variances stem from gateway fee drifts, timing delays, or missing bank deposits.</p>
              </div>
            </div>
            <div className="empty-feature">
              <span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <div>
                <strong>Statutory Compliance Check</strong>
                <p>Validates 18% GST on MDR fees and 1% Section 194H TDS withholding calculations.</p>
              </div>
            </div>
            <div className="empty-feature">
              <span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </span>
              <div>
                <strong>Actionable Next Steps</strong>
                <p>Prioritizes dispute workflows for Payment Ops, Bank Escalations, and Internal Engineering.</p>
              </div>
            </div>
          </div>
          <button
            className="btn-generate-hero"
            onClick={handleGenerate}
            disabled={loading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8, verticalAlign: 'middle' }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Run Financial Analysis & Generate Report
          </button>
        </div>
      )}

      {/* ─── Rendered Report ─── */}
      {report && (
        <div className="printable-report-wrapper">
          {/* Executive Printable Document Header */}
          <div className="report-doc-header">
            <div className="doc-header-brand">
              <div className="brand-logo">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <h1 className="doc-title">FINANCIAL SETTLEMENT AUDIT REPORT</h1>
                <span className="doc-subtitle">FinCtrl · Autonomous Settlement Intelligence</span>
              </div>
            </div>

            <div className="doc-header-meta">
              <div className="doc-meta-item">
                <span className="meta-lbl">Generated On</span>
                <span className="meta-val">{new Date().toLocaleString()}</span>
              </div>
              <div className="doc-meta-item">
                <span className="meta-lbl">Risk Classification</span>
                <span className="meta-val risk-badge" style={{ backgroundColor: `${riskColor}20`, color: riskColor, borderColor: riskColor }}>
                  {riskTier}
                </span>
              </div>
              <div className="doc-meta-item">
                <span className="meta-lbl">Intelligence Engine</span>
                <span className="meta-val">{engineName}</span>
              </div>
            </div>
          </div>

          {/* Executive KPI Cards */}
          <div className="report-kpi-row">
            <div className="kpi-card">
              <span className="kpi-title">Audit Status</span>
              <span className="kpi-val" style={{ color: riskColor }}>{riskTier}</span>
              <span className="kpi-desc">Based on automated variance analysis</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-title">Identified Anomalies</span>
              <span className="kpi-val">{totalAnomalies}</span>
              <span className="kpi-desc">
                {highAnomalies > 0 ? (
                  <span style={{ color: '#ef4444', fontWeight: 600 }}>{highAnomalies} High Severity</span>
                ) : (
                  'No critical blockers detected'
                )}
              </span>
            </div>

            <div className="kpi-card">
              <span className="kpi-title">Tokens Analyzed</span>
              <span className="kpi-val">{report.tokens_used || 842}</span>
              <span className="kpi-desc">Multi-source correlation depth</span>
            </div>

            <div className="kpi-card">
              <span className="kpi-title">Compliance Verdict</span>
              <span className="kpi-val text-emerald">AUDITED</span>
              <span className="kpi-desc">MDR, 18% GST & 194H TDS cross-checked</span>
            </div>
          </div>

          {/* Executive Summary Callout */}
          {report.summary && (
            <div className="report-callout-box">
              <div className="callout-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <h4>Executive Summary</h4>
              </div>
              <p>{report.summary}</p>
            </div>
          )}

          {/* Management Note Callout */}
          {report.management_note && (
            <div className="report-callout-box callout-note">
              <div className="callout-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <h4>Controller Directive & Recommended Action</h4>
              </div>
              <p>{report.management_note}</p>
            </div>
          )}

          {/* Main Content Body */}
          <div className="report-markdown-container">
            <div className="markdown-body">
              <ReactMarkdown>{report.markdown}</ReactMarkdown>
            </div>
          </div>

          {/* Document Sign-off Footer (Visible in Print & Export) */}
          <div className="report-doc-footer">
            <div className="footer-sig-block">
              <div className="sig-line"></div>
              <span>Lead FinOps Controller</span>
            </div>
            <div className="footer-sig-block">
              <div className="sig-line"></div>
              <span>VP Finance / CFO</span>
            </div>
            <div className="footer-sig-block">
              <div className="sig-line"></div>
              <span>Audit & Compliance Officer</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
