import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAuthConfig } from '../services/api'

export default function LandingPage({ onLoginSuccess }) {
  const { loginWithGoogle, authError } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [googleClientReady, setGoogleClientReady] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [manualClientId, setManualClientId] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const initializedRef = useRef(false)

  const initGoogleGsi = (clientId) => {
    if (!clientId) return
    const initFn = () => {
      if (window.google?.accounts?.id) {
        if (!initializedRef.current) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: async (response) => {
              try {
                await loginWithGoogle(response.credential)
                if (onLoginSuccess) onLoginSuccess()
              } catch (err) {
                console.error('Google login error:', err)
              }
            },
          })
          initializedRef.current = true
          setGoogleClientReady(true)
        }

        // Render official button if target element is mounted
        const target = document.getElementById('google-signin-target')
        if (target) {
          window.google.accounts.id.renderButton(target, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'continue_with',
          })
        }
      }
    }

    if (window.google?.accounts?.id) {
      initFn()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = initFn
      document.body.appendChild(script)
    }
  }

  // Detect and resolve Google Client ID from backend or frontend env
  useEffect(() => {
    let resolved =
      import.meta.env.VITE_GOOGLE_CLIENT_ID ||
      window.ENV_GOOGLE_CLIENT_ID ||
      localStorage.getItem('saved_google_client_id') ||
      ''

    getAuthConfig()
      .then((cfg) => {
        if (cfg?.google_client_id) {
          resolved = cfg.google_client_id
        }
        if (resolved) {
          setGoogleClientId(resolved)
          initGoogleGsi(resolved)
        }
      })
      .catch(() => {
        if (resolved) {
          setGoogleClientId(resolved)
          initGoogleGsi(resolved)
        }
      })
  }, [])

  // Re-render button when modal opens
  useEffect(() => {
    if (showAuthModal && googleClientId && window.google?.accounts?.id) {
      setTimeout(() => {
        const target = document.getElementById('google-signin-target')
        if (target) {
          window.google.accounts.id.renderButton(target, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'continue_with',
          })
        }
      }, 100)
    }
  }, [showAuthModal, googleClientId])

  const handleApplyManualClientId = (e) => {
    e.preventDefault()
    const trimmed = manualClientId.trim()
    if (!trimmed) return
    setSavingKey(true)
    localStorage.setItem('saved_google_client_id', trimmed)
    setGoogleClientId(trimmed)
    initGoogleGsi(trimmed)
    setTimeout(() => {
      setSavingKey(false)
      if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt()
      }
    }, 400)
  }

  const triggerGoogleSignIn = () => {
    if (window.google?.accounts?.id && googleClientReady) {
      window.google.accounts.id.prompt()
    } else {
      setShowAuthModal(true)
    }
  }

  return (
    <div className="landing-page-container">
      {/* ─── Top Navigation Bar ─── */}
      <header className="landing-navbar">
        <div className="nav-brand">
          <div className="brand-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="brand-titles">
            <span className="brand-title">FinCtrl</span>
            <span className="brand-tag">AI FinOps Suite</span>
          </div>
        </div>

        <nav className="nav-links">
          <a href="#what-we-provide" className="nav-link">What We Provide</a>
          <a href="#how-it-works" className="nav-link">How It Works</a>
          <a href="#key-usps" className="nav-link">Key USPs</a>
        </nav>

        <div className="nav-cta-group">
          <button
            id="nav-signin-btn"
            className="btn-primary-gradient"
            onClick={() => setShowAuthModal(true)}
          >
            Sign In with Google
          </button>
        </div>
      </header>

      {/* ─── Hero Section ─── */}
      <section className="hero-section">
        <div className="hero-badge">
          <span className="badge-pulse"></span>
          Autonomous 3-Way Reconciliation & Anomaly Intelligence
        </div>

        <h1 className="hero-headline">
          Master Payment Settlements.<br />
          <span className="text-gradient">Eliminate Financial Leakage with AI.</span>
        </h1>

        <p className="hero-subtext">
          Reconcile transactions across Internal Order Ledgers, Payment Gateways (Razorpay/PSP),
          and Bank Statements with sub-second precision, automated statutory fee auditing, and autonomous root-cause explanations.
        </p>

        <div className="hero-actions">
          <button
            id="hero-google-login-btn"
            className="btn-hero-primary"
            onClick={triggerGoogleSignIn}
          >
            <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
            <span className="arrow-icon">→</span>
          </button>
        </div>

        {authError && (
          <div className="hero-auth-alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#ef4444' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{authError}</span>
          </div>
        )}

        {/* Live Trust Metrics Strip */}
        <div className="hero-metrics-strip">
          <div className="metric-item">
            <span className="metric-num">99.98%</span>
            <span className="metric-lbl">Matching Accuracy</span>
          </div>
          <div className="metric-divider"></div>
          <div className="metric-item">
            <span className="metric-num">&lt; 1.2s</span>
            <span className="metric-lbl">3-Way Processing Time</span>
          </div>
          <div className="metric-divider"></div>
          <div className="metric-item">
            <span className="metric-num">100%</span>
            <span className="metric-lbl">Statutory GST & TDS Audit</span>
          </div>
          <div className="metric-divider"></div>
          <div className="metric-item">
            <span className="metric-num">Automated</span>
            <span className="metric-lbl">Full Audit Continuity</span>
          </div>
        </div>
      </section>

      {/* ─── What We Provide Section ─── */}
      <section id="what-we-provide" className="content-section">
        <div className="section-header">
          <span className="section-kicker">CAPABILITIES</span>
          <h2 className="section-title">What We Provide</h2>
          <p className="section-subtitle">
            An end-to-end FinOps reconciliation engine purpose-built for finance teams managing high transaction volume.
          </p>
        </div>

        <div className="grid-cards-3">
          <div className="feature-card">
            <div className="card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <h3>3-Way Reconciliation Engine</h3>
            <p>
              Simultaneously correlates <strong>Order Ledgers</strong>, <strong>Razorpay/Payment Gateway</strong> logs,
              and <strong>Bank Statements</strong> using multi-stage candidate matching, fuzzy tolerance, and sliding date windows.
            </p>
            <div className="card-tag">Multi-Pass Algorithmic Matching</div>
          </div>

          <div className="feature-card">
            <div className="card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <h3>Data Ingestion & Schema Map</h3>
            <p>
              Auto-normalizes disparate raw CSV and XLSX exports into a standardized canonical financial model.
              Pre-flight data quality checks detect duplicate references, missing columns, and format errors.
            </p>
            <div className="card-tag">Self-Adapting Normalizer</div>
          </div>

          <div className="feature-card">
            <div className="card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h3>Settlement & Tax Audit</h3>
            <p>
              Computes exact expected settlements row-by-row: <code>Gross − Fee − 18% GST + 1% Section 194H TDS − Refunds</code>.
              Flags PSP fee deviations down to the exact paisa.
            </p>
            <div className="card-tag">Statutory Compliance Ready</div>
          </div>

          <div className="feature-card">
            <div className="card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3>Exception & Anomaly Workspace</h3>
            <p>
              Centralized triage board for discrepancies. Assign flagged rows to stakeholders (Payment Ops, Engineering, Bank),
              append audit trail comments, and resolve or reopen items with timestamped tracking.
            </p>
            <div className="card-tag">Collaborative FinOps Triage</div>
          </div>

          <div className="feature-card">
            <div className="card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <h3>AI-Powered Financial Insights</h3>
            <p>
              Generates comprehensive executive audit narratives. Synthesizes risk scores, root cause hypotheses,
              and strategic recommendations formatted for CFO review and presentation.
            </p>
            <div className="card-tag">Enterprise Executive Briefs</div>
          </div>

          <div className="feature-card">
            <div className="card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <h3>Multi-Format Export & History</h3>
            <p>
              User-scoped persistent historical runs stored in SQL. Preview, print, or export audit findings,
              reconciliation tables, and AI reports directly to CSV, Markdown, and print-ready PDF layouts.
            </p>
            <div className="card-tag">Audit-Ready Reporting</div>
          </div>
        </div>
      </section>

      {/* ─── How It Works Section ─── */}
      <section id="how-it-works" className="content-section alternate-bg">
        <div className="section-header">
          <span className="section-kicker">WORKFLOW ARCHITECTURE</span>
          <h2 className="section-title">How It Works</h2>
          <p className="section-subtitle">
            From raw transaction files to resolved settlements in three seamless automated stages.
          </p>
        </div>

        <div className="workflow-steps-container">
          <div className="step-card">
            <div className="step-number">01</div>
            <div className="step-badge">Ingest & Map</div>
            <h4>Upload 3 Data Sources</h4>
            <p>
              Upload Order Ledger, Razorpay settlement, and Bank Statement files. The engine automatically inspects
              data hygiene, verifies column types, and normalizes amounts into standard financial decimals.
            </p>
            <ul className="step-features">
              <li>• Header fuzzy auto-detection</li>
              <li>• Currency & date sanitization</li>
              <li>• Duplicate transaction detection</li>
            </ul>
          </div>

          <div className="workflow-arrow">→</div>

          <div className="step-card">
            <div className="step-number">02</div>
            <div className="step-badge">Reconcile & Audit</div>
            <h4>3-Way Mathematical Matching</h4>
            <p>
              The matching pipeline runs cascading strategies (Exact Reference, Order ID + Amount, Date Window).
              Settlement breakdowns calculate exact MDR fees, GST, and TDS to detect overcharges or missing bank credits.
            </p>
            <ul className="step-features">
              <li>• Configurable tolerance & date windows</li>
              <li>• Instant calculation of fee variance</li>
              <li>• Automated exception segmentation</li>
            </ul>
          </div>

          <div className="workflow-arrow">→</div>

          <div className="step-card">
            <div className="step-number">03</div>
            <div className="step-badge">Resolve & Explain</div>
            <h4>Triage Workspace & AI Intelligence</h4>
            <p>
              Discrepancies appear directly in the collaborative Exception Workspace with full historical context.
              Autonomous FinOps reasoning synthesizes executive narratives and actionable recommendations ready for immediate leadership export.
            </p>
            <ul className="step-features">
              <li>• Stakeholder ticketing & audit logs</li>
              <li>• Executive AI narrative synthesis</li>
              <li>• 1-click CSV & PDF exports</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ─── Key USPs Section ─── */}
      <section id="key-usps" className="content-section">
        <div className="section-header">
          <span className="section-kicker">WHY FINCTRL</span>
          <h2 className="section-title">Key Unique Selling Propositions</h2>
          <p className="section-subtitle">
            Engineered to overcome the limitations of fragile spreadsheets and legacy ERP batch systems.
          </p>
        </div>

        <div className="grid-cards-2">
          <div className="usp-box">
            <div className="usp-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h4>Zero-Leakage Financial Shield</h4>
              <p>
                Prevent silent PSP overcharges and timing mismatches. Our engine audits every single settlement breakdown
                against your agreed contract MDR rates, ensuring fee inflation is caught before month-end closing.
              </p>
            </div>
          </div>

          <div className="usp-box">
            <div className="usp-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div>
              <h4>Sub-Second Processing at Scale</h4>
              <p>
                Built on high-performance vector-optimized Python algorithms. Reconcile thousands of rows in under
                2 seconds without waiting for overnight batch cron jobs or ERP lockups.
              </p>
            </div>
          </div>

          <div className="usp-box">
            <div className="usp-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div>
              <h4>Executive-Grade AI Narrative Reports</h4>
              <p>
                Don't just get raw numbers. AI FinOps intelligence generates plain-language executive summaries detailing exactly
                where financial variance occurred, potential operational root causes, and proactive preventive measures.
              </p>
            </div>
          </div>

          <div className="usp-box">
            <div className="usp-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h4>Secure Multi-Tenant Persistence</h4>
              <p>
                Every user session is isolated and protected via JWT authentication and database foreign key scoping.
                All reconciliation runs, exception tickets, and generated reports persist across logins.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA Banner ─── */}
      <section className="cta-banner">
        <div className="cta-content">
          <h2>Ready to Automate Your Financial Reconciliation?</h2>
          <p>Access your personalized enterprise workspace and sign in securely with Google.</p>
          <div className="hero-actions cta-btn-row">
            <button
              id="bottom-google-btn"
              className="btn-hero-primary"
              onClick={triggerGoogleSignIn}
            >
              <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Sign In with Google</span>
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="footer-left">
          <span className="footer-logo">FinCtrl</span>
          <span className="footer-copy">© 2026 FinCtrl Systems Inc. Enterprise FinOps Platform.</span>
        </div>
        <div className="footer-right">
          <span>Enterprise Grade</span>
          <span>•</span>
          <span>RBI FinTech Standards</span>
          <span>•</span>
          <span>Statutory 194H Compliant</span>
        </div>
      </footer>

      {/* ─── Google / Demo Auth Modal ─── */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowAuthModal(false)}>✕</button>

            <div className="modal-header">
              <div className="modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h3>Sign In to FinCtrl</h3>
              <p>Access your personalized multi-tenant finance workspace</p>
            </div>

            <div className="modal-body">
              {/* Google Sign In Option */}
              <div className="auth-option-block">
                <p className="auth-option-desc">Connect with your verified corporate or personal Google Account.</p>

                {/* If Client ID is active */}
                {googleClientId ? (
                  <div className="google-btn-container">
                    <div id="google-signin-target" style={{ width: '100%' }}>
                      <button
                        className="btn-google-full"
                        onClick={() => {
                          if (window.google?.accounts?.id) {
                            window.google.accounts.id.prompt()
                          }
                        }}
                      >
                        <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <span>Continue with Google</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Manual input if env file was not saved */
                  <div className="google-manual-setup" style={{ marginTop: '0.75rem' }}>
                    <form onSubmit={handleApplyManualClientId} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                        Paste your Google Client ID below:
                      </label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input
                          type="text"
                          value={manualClientId}
                          onChange={(e) => setManualClientId(e.target.value)}
                          placeholder="e.g. 123456789-xxxxxx.apps.googleusercontent.com"
                          style={{
                            flex: 1,
                            padding: '0.5rem 0.75rem',
                            background: 'var(--clr-surface-2)',
                            border: '1px solid var(--clr-border)',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.8rem',
                          }}
                        />
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={savingKey || !manualClientId.trim()}
                          style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
                        >
                          {savingKey ? 'Connecting...' : 'Connect'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>

              {authError && (
                <div className="modal-error-alert">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#ef4444' }}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{authError}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
