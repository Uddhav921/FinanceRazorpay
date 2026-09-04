import React, { useState } from 'react'
import FileUpload from './FileUpload'
import UploadResults from './UploadResults'

export default function DataQualityModule({ onNavigate }) {
  const [results, setResults] = useState([])

  const handleUploadResults = (newResults) => {
    setResults(newResults)
  }

  const allPassed = results.length > 0 && results.every(r => !r.error)

  return (
    <div className="data-quality-module">
      {/* Module Banner / Header */}
      <div className="module-header-card">
        <div className="module-header-left">
          <div className="module-badge-row">
            <span className="finops-chip">Pre-Flight Audit</span>
            <span className="version-chip">Data Quality & Ingestion Engine</span>
          </div>
          <h2>Data Ingestion & Quality Audit</h2>
          <p className="module-subtext">
            Ingest raw multi-source financial exports (Order Ledgers, Payment Gateway settlements, and Bank statements).
            The engine automatically audits data hygiene, identifies duplicate references, validates mandatory columns,
            and detects format anomalies before executing 3-way reconciliation.
          </p>
        </div>

        {allPassed && (
          <div className="module-header-action">
            <button
              className="btn-proceed-action"
              onClick={() => onNavigate && onNavigate('reconcile')}
            >
              <span>Proceed to 3-Way Reconciliation</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Upload Zone */}
      <div className="upload-container-card">
        <div className="card-section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <h3>Upload Source Files for Quality Assessment</h3>
        </div>
        <p className="card-section-subtitle">
          Select or drop CSV or Excel (.xlsx) files for Order Ledger, Razorpay settlement, and Bank statement.
        </p>

        <FileUpload onResult={handleUploadResults} />
      </div>

      {/* Quality Results & Metrics */}
      {results.length > 0 && (
        <div className="quality-results-wrapper">
          <UploadResults results={results} />

          <div className="next-step-prompt card">
            <div className="prompt-text">
              <h4>Ready to Match & Reconcile?</h4>
              <p>
                {allPassed
                  ? 'All uploaded files passed initial hygiene and normalization checks. You can now execute the 3-way matching engine or review the canonical schema.'
                  : 'Files processed with warnings or issues. You may still proceed with reconciliation or re-upload corrected files.'}
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => onNavigate && onNavigate('reconcile')}
            >
              <span>Run Schema Map & 3-Way Match</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
