import React, { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import DataQualityModule from './DataQualityModule'
import Reconciliation from './Reconciliation'
import SchemaMap from './SchemaMap'
import ExceptionWorkspace from './ExceptionWorkspace'
import AIReport from './AIReport'
import {
  getReconciliationHistory,
  loadPastReconRun,
  getLatestReconciliation,
} from '../services/api'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('quality') // 'quality' | 'reconcile' | 'exceptions' | 'ai-insights'
  const [reconSubTab, setReconSubTab] = useState('runner') // 'runner' | 'schema'
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState('')
  const [activeReport, setActiveReport] = useState(null)
  const [statusMessage, setStatusMessage] = useState(null)

  // Fetch reconciliation history on mount
  useEffect(() => {
    loadHistoryList()
    getLatestReconciliation()
      .then((rep) => {
        if (rep) setActiveReport(rep)
      })
      .catch(() => {
        // No report yet is okay
      })
  }, [])

  const loadHistoryList = async () => {
    setLoadingHistory(true)
    try {
      const runs = await getReconciliationHistory()
      setHistory(runs || [])
    } catch (err) {
      console.warn('Could not fetch run history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleSelectHistoryRun = async (e) => {
    const runId = e.target.value
    setSelectedRunId(runId)
    if (!runId) return

    try {
      setStatusMessage('Loading past reconciliation run from database...')
      await loadPastReconRun(runId)
      const freshReport = await getLatestReconciliation()
      setActiveReport(freshReport)
      setStatusMessage(`Successfully loaded Run #${runId}`)
      setTimeout(() => setStatusMessage(null), 3500)
    } catch (err) {
      alert(`Failed to load run: ${err.message}`)
      setStatusMessage(null)
    }
  }

  const handleReconciliationComplete = (newReport) => {
    setActiveReport(newReport)
    loadHistoryList()
    setStatusMessage('Reconciliation completed and saved to your audit history.')
    setTimeout(() => setStatusMessage(null), 4000)
  }

  const handleNavigateTab = (tabName) => {
    if (tabName === 'quality') {
      setActiveTab('quality')
    } else if (tabName === 'reconcile') {
      setActiveTab('reconcile')
      setReconSubTab('runner')
    } else if (tabName === 'schema') {
      setActiveTab('reconcile')
      setReconSubTab('schema')
    } else if (tabName === 'exceptions') {
      setActiveTab('exceptions')
    } else if (tabName === 'ai' || tabName === 'ai-insights') {
      setActiveTab('ai-insights')
    }
  }

  return (
    <div className="dashboard-layout">
      {/* ─── Global Top Navigation Bar ─── */}
      <header className="dashboard-header no-print">
        <div className="header-left">
          <div className="dash-brand">
            <div className="dash-logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="dash-brand-text">
              <span className="dash-title">FinCtrl</span>
              <span className="dash-badge">FinOps Enterprise</span>
            </div>
          </div>

          {/* Module Navigation Tabs */}
          <nav className="dash-nav-tabs">
            {/* Tab 1: Data Quality & Ingestion */}
            <button
              id="tab-quality"
              className={`nav-tab-btn ${activeTab === 'quality' ? 'active' : ''}`}
              onClick={() => setActiveTab('quality')}
            >
              <span className="tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </span>
              <span>Data Ingestion & Quality Audit</span>
            </button>

            {/* Tab 2: Schema Map & Reconciliation */}
            <button
              id="tab-reconciliation"
              className={`nav-tab-btn ${activeTab === 'reconcile' ? 'active' : ''}`}
              onClick={() => setActiveTab('reconcile')}
            >
              <span className="tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </span>
              <span>Schema Map & Reconciliation</span>
            </button>

            {/* Tab 3: Exceptions & Anomaly Management */}
            <button
              id="tab-exceptions"
              className={`nav-tab-btn ${activeTab === 'exceptions' ? 'active' : ''}`}
              onClick={() => setActiveTab('exceptions')}
            >
              <span className="tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <span>Exceptions & Anomaly Management</span>
              {activeReport?.total_exceptions > 0 && (
                <span className="tab-pill pill-danger">{activeReport.total_exceptions}</span>
              )}
            </button>

            {/* Tab 4: AI-Powered Insights */}
            <button
              id="tab-ai-insights"
              className={`nav-tab-btn ${activeTab === 'ai-insights' ? 'active' : ''}`}
              onClick={() => setActiveTab('ai-insights')}
            >
              <span className="tab-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </span>
              <span>AI-Powered Insights</span>
              <span className="tab-pill pill-primary">Autonomous AI</span>
            </button>
          </nav>
        </div>

        <div className="header-right">
          {/* History Run Dropdown */}
          <div className="history-picker">
            <label htmlFor="history-select" className="history-lbl">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5, verticalAlign: 'middle' }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Audit Runs ({history.length}):
            </label>
            <select
              id="history-select"
              className="history-select-input"
              value={selectedRunId}
              onChange={handleSelectHistoryRun}
              disabled={loadingHistory}
            >
              <option value="">-- Active / New Run --</option>
              {history.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {r.total_reconciled} reconciled ({r.match_rate}%) · {r.run_at?.slice(0, 16).replace('T', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* User Profile & Logout */}
          <div className="user-profile-menu">
            <img
              src={user?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
              alt={user?.name || 'User'}
              className="user-avatar"
            />
            <div className="user-meta">
              <span className="user-name">{user?.name || 'Finance Controller'}</span>
              <span className="user-role">{user?.role || 'FinOps Principal'}</span>
            </div>
            <button
              id="user-logout-btn"
              className="btn-logout"
              onClick={logout}
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ─── Status Toast / Notification ─── */}
      {statusMessage && (
        <div className="dashboard-status-banner no-print">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{statusMessage}</span>
        </div>
      )}

      {/* ─── Main Content Area ─── */}
      <main className="dashboard-main-content">
        {/* Module 1: Data Ingestion & Quality Audit (NEW - Before Reconciliation) */}
        {activeTab === 'quality' && (
          <div className="module-container">
            <DataQualityModule onNavigate={handleNavigateTab} />
          </div>
        )}

        {/* Module 2: Schema Map & Reconciliation */}
        {activeTab === 'reconcile' && (
          <div className="module-container">
            <div className="subtab-bar no-print">
              <button
                className={`subtab-btn ${reconSubTab === 'runner' ? 'active' : ''}`}
                onClick={() => setReconSubTab('runner')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                3-Way Match & Settlement Calculator
              </button>
              <button
                className={`subtab-btn ${reconSubTab === 'schema' ? 'active' : ''}`}
                onClick={() => setReconSubTab('schema')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6, verticalAlign: 'middle' }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="9" y1="21" x2="9" y2="9" />
                </svg>
                Canonical Schema Map & Normalizer Pipeline
              </button>
            </div>

            {reconSubTab === 'runner' && (
              <Reconciliation
                onNavigate={handleNavigateTab}
                onReconciliationComplete={handleReconciliationComplete}
                externalReport={activeReport}
              />
            )}

            {reconSubTab === 'schema' && (
              <SchemaMap />
            )}
          </div>
        )}

        {/* Module 3: Exceptions & Anomaly Management */}
        {activeTab === 'exceptions' && (
          <div className="module-container">
            <ExceptionWorkspace />
          </div>
        )}

        {/* Module 4: AI-Powered Insights */}
        {activeTab === 'ai-insights' && (
          <div className="module-container">
            <AIReport onNavigate={handleNavigateTab} />
          </div>
        )}
      </main>
    </div>
  )
}
