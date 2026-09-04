import { useState, useEffect } from 'react'
import { getSchemaMapping } from '../services/api'

/* ── Category config ──────────────────────────────────────────────────────── */
const CATEGORY_STYLE = {
  identifier: { label: 'Identifier', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  temporal:   { label: 'Temporal',   color: '#22d3a5', bg: 'rgba(34,211,165,0.12)' },
  amount:     { label: 'Amount',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  meta:       { label: 'Meta',       color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
}

const SOURCE_TABS = [
  { key: 'order_ledger',   label: 'Order / Ledger',   icon: '📋' },
  { key: 'razorpay_psp',   label: 'Razorpay / PSP',   icon: '💳' },
  { key: 'bank_statement', label: 'Bank Statement',    icon: '🏦' },
]

/* ── Badge components ─────────────────────────────────────────────────────── */
function CategoryBadge({ category }) {
  const s = CATEGORY_STYLE[category] || { label: category, color: '#888', bg: 'rgba(128,128,128,0.12)' }
  return (
    <span className="schema-badge" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

function AliasPill({ name }) {
  return <span className="alias-pill">{name}</span>
}

/* ── Canonical Fields Table ───────────────────────────────────────────────── */
function CanonicalFieldsTable({ fields }) {
  const [expanded, setExpanded] = useState(null)

  return (
    <div className="schema-table-wrap">
      <table className="schema-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Field</th>
            <th>Type</th>
            <th>Category</th>
            <th>Required</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <>
              <tr
                key={f.field}
                className={`schema-row ${expanded === f.field ? 'expanded' : ''}`}
                onClick={() => setExpanded(expanded === f.field ? null : f.field)}
                style={{ cursor: 'pointer' }}
              >
                <td style={{ color: 'var(--clr-muted)', fontFamily: 'monospace' }}>{i + 1}</td>
                <td>
                  <span className="field-name">{f.field}</span>
                  {f.field === 'net_amount' && (
                    <span className="derived-badge">DERIVED</span>
                  )}
                </td>
                <td><code className="type-code">{f.type}</code></td>
                <td><CategoryBadge category={f.category} /></td>
                <td>
                  {f.required
                    ? <span style={{ color: 'var(--clr-danger)', fontWeight: 600 }}>Required</span>
                    : <span style={{ color: 'var(--clr-muted)' }}>Optional</span>
                  }
                </td>
                <td style={{ color: 'var(--clr-muted)', fontSize: '0.82rem' }}>{f.description}</td>
              </tr>
              {expanded === f.field && (
                <tr key={`${f.field}-detail`} className="schema-row-detail">
                  <td colSpan={6}>
                    <div className="norm-rule-box">
                      <span className="norm-rule-label">⚙ Normalization Rule:</span>
                      <span className="norm-rule-text">{f.norm_rule}</span>
                      {f.example && (
                        <span className="norm-example">
                          e.g. <code>{f.example}</code>
                        </span>
                      )}
                      {f.enum_values && (
                        <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {f.enum_values.map(v => (
                            <span key={v} className="alias-pill" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa' }}>{v}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Source Mapping Explorer ──────────────────────────────────────────────── */
function SourceMappingExplorer({ fields, sourceMappings }) {
  const [activeTab, setActiveTab] = useState('order_ledger')

  const mapping = sourceMappings[activeTab] || {}

  return (
    <div className="source-explorer">
      {/* Tab bar */}
      <div className="source-tabs">
        {SOURCE_TABS.map(tab => (
          <button
            key={tab.key}
            className={`source-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mapping rows */}
      <div className="mapping-grid">
        {fields.map(f => {
          const aliases = mapping[f.field] || []
          const isDerived = f.field === 'net_amount' || f.field === 'status'
          const isNotAvailable = aliases.length === 0 && !isDerived

          return (
            <div key={f.field} className={`mapping-row ${isNotAvailable ? 'not-available' : ''}`}>
              <div className="mapping-canonical">
                <CategoryBadge category={f.category} />
                <span className="field-name">{f.field}</span>
                {f.field === 'net_amount' && <span className="derived-badge">DERIVED</span>}
              </div>
              <div className="mapping-arrow">→</div>
              <div className="mapping-aliases">
                {aliases.length > 0
                  ? aliases.map(a => <AliasPill key={a} name={a} />)
                  : isDerived
                    ? <span className="derived-note">Computed from other fields</span>
                    : <span className="na-note">Not available in this source</span>
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Pipeline Steps ───────────────────────────────────────────────────────── */
function NormalizationPipeline({ steps }) {
  return (
    <div className="pipeline-steps">
      {steps.map((step, i) => (
        <div key={i} className="pipeline-step">
          <div className="pipeline-num">{i + 1}</div>
          <div className="pipeline-body">
            <div className="pipeline-title">{step.step.replace(/^\d+\.\s*/, '')}</div>
            <div className="pipeline-fields">
              {step.fields.split(', ').map(f => <AliasPill key={f} name={f} />)}
            </div>
            <p className="pipeline-desc">{step.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main SchemaMap Component ─────────────────────────────────────────────── */
export default function SchemaMap() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [view, setView] = useState('fields') // 'fields' | 'mapping' | 'pipeline'

  useEffect(() => {
    getSchemaMapping()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="card schema-loading">
      <span className="spinner" style={{ borderTopColor: 'var(--clr-accent)' }} />
      <span style={{ marginLeft: '0.75rem', color: 'var(--clr-muted)' }}>Loading schema map…</span>
    </div>
  )

  if (error) return (
    <div className="card">
      <div className="error-list">
        <h4>Failed to load schema</h4>
        <p>{error}</p>
      </div>
    </div>
  )

  return (
    <div>
      {/* ── Header stat strip ── */}
      <div className="schema-stat-strip">
        <div className="schema-stat">
          <span className="schema-stat-val">{data.total_canonical_fields}</span>
          <span className="schema-stat-label">Canonical Fields</span>
        </div>
        <div className="schema-stat">
          <span className="schema-stat-val">{data.sources_supported.length}</span>
          <span className="schema-stat-label">Data Sources</span>
        </div>
        <div className="schema-stat">
          <span className="schema-stat-val">{data.normalization_pipeline.length}</span>
          <span className="schema-stat-label">Pipeline Steps</span>
        </div>
        {Object.entries(CATEGORY_STYLE).map(([cat, s]) => (
          <div key={cat} className="schema-stat">
            <span className="schema-stat-val" style={{ color: s.color }}>
              {data.canonical_fields.filter(f => f.category === cat).length}
            </span>
            <span className="schema-stat-label">{s.label} Fields</span>
          </div>
        ))}
      </div>

      {/* ── View toggle ── */}
      <div className="schema-view-tabs">
        {[
          { key: 'fields',   label: '📄 Canonical Fields' },
          { key: 'mapping',  label: '🔀 Source Mappings' },
          { key: 'pipeline', label: '⚙ Norm. Pipeline' },
        ].map(v => (
          <button
            key={v.key}
            className={`view-tab-btn ${view === v.key ? 'active' : ''}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Views ── */}
      <div className="card" style={{ marginTop: '1rem' }}>
        {view === 'fields' && (
          <>
            <h3 style={{ marginBottom: '1rem' }}>
              Standardized Schema
              <span style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>
                All 14 canonical fields every transaction must have after normalization
              </span>
            </h3>
            <CanonicalFieldsTable fields={data.canonical_fields} />
          </>
        )}

        {view === 'mapping' && (
          <>
            <h3 style={{ marginBottom: '1rem' }}>
              Source Column Mappings
              <span style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>
                Which raw columns from each source map to each canonical field
              </span>
            </h3>
            <SourceMappingExplorer
              fields={data.canonical_fields}
              sourceMappings={data.source_mappings}
            />
          </>
        )}

        {view === 'pipeline' && (
          <>
            <h3 style={{ marginBottom: '1rem' }}>
              Normalization Pipeline
              <span style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>
                6 sequential transformation steps applied to every row
              </span>
            </h3>
            <NormalizationPipeline steps={data.normalization_pipeline} />
          </>
        )}
      </div>
    </div>
  )
}
