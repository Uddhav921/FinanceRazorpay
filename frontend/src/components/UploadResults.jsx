const SOURCE_LABEL = {
  order_ledger:   'Order / Ledger',
  razorpay_psp:   'Razorpay / PSP',
  bank_statement: 'Bank Statement',
}

const STATUS_BADGE = {
  captured:  'badge-info',
  settled:   'badge-success',
  refunded:  'badge-warning',
  failed:    'badge-danger',
  pending:   'badge-warning',
  unknown:   '',
}

export default function UploadResults({ results }) {
  if (!results?.length) return null

  return (
    <div className="result-section">
      <h2>Upload Results</h2>

      {results.map((r, i) => (
        <div key={i} className="card" style={{ marginBottom: '1.25rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>{SOURCE_LABEL[r.source] || r.source} — {r.filename}</h3>
            {r.error
              ? <span className="badge badge-danger">Error</span>
              : <span className="badge badge-success">✓ Parsed</span>}
          </div>

          {/* Error state */}
          {r.error && (
            <div className="error-list">
              <h4>Error</h4>
              <p style={{ fontSize: '0.85rem' }}>{r.error}</p>
            </div>
          )}

          {/* Stats */}
          {!r.error && (
            <>
              <div className="stats-row">
                <div className="stat-card">
                  <div className="label">Total Rows</div>
                  <div className="value">{r.total_rows}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Valid Rows</div>
                  <div className="value success">{r.valid_rows}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Skipped</div>
                  <div className={`value ${r.skipped_rows > 0 ? 'warning' : ''}`}>{r.skipped_rows}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Parse Errors</div>
                  <div className={`value ${r.parse_errors?.length ? 'danger' : ''}`}>{r.parse_errors?.length ?? 0}</div>
                </div>
              </div>

              {/* Row-level errors */}
              {r.parse_errors?.length > 0 && (
                <div className="error-list">
                  <h4>Row-level Errors</h4>
                  <ul>
                    {r.parse_errors.map((e, j) => <li key={j}>{e}</li>)}
                  </ul>
                </div>
              )}

              {/* Transaction table */}
              {r.transactions?.length > 0 && (
                <>
                  <h3 style={{ margin: '1.25rem 0 0.75rem' }}>
                    Parsed Transactions
                    <span style={{ fontWeight: 400, color: 'var(--clr-muted)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                      (showing first 50)
                    </span>
                  </h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Transaction ID</th>
                          <th>Order ID</th>
                          <th>Date</th>
                          <th>Gross</th>
                          <th>Fee</th>
                          <th>Tax</th>
                          <th>Net</th>
                          <th>Currency</th>
                          <th>Status</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.transactions.slice(0, 50).map((t, j) => (
                          <tr key={j}>
                            <td style={{ color: 'var(--clr-muted)' }}>{t.raw_row_index ?? j + 1}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{t.transaction_id ?? '—'}</td>
                            <td>{t.order_id ?? '—'}</td>
                            <td>{t.date ?? '—'}</td>
                            <td style={{ fontWeight: 600 }}>₹{Number(t.gross_amount).toFixed(2)}</td>
                            <td>₹{Number(t.fee_amount).toFixed(2)}</td>
                            <td>₹{Number(t.tax_amount).toFixed(2)}</td>
                            <td style={{ fontWeight: 600, color: 'var(--clr-success)' }}>
                              ₹{Number(t.net_amount).toFixed(2)}
                            </td>
                            <td>{t.currency}</td>
                            <td>
                              <span className={`badge ${STATUS_BADGE[t.status] ?? ''}`}>
                                {t.status}
                              </span>
                            </td>
                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {t.reference ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
