/**
 * api.js — Centralised API service layer
 * All calls go through Vite's dev proxy (/api → http://localhost:8000)
 */

const BASE = '/api'

async function request(method, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { method, ...options })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body?.detail?.message || body?.detail || detail
    } catch {}
    throw new Error(detail)
  }
  return res.json()
}

// ─── Health ───────────────────────────────────────────────────────────────────
export const checkHealth = () => request('GET', '/health')

// ─── Upload / Data Sources ────────────────────────────────────────────────────
/**
 * Upload a CSV/XLSX file for a given data source.
 * @param {File}   file              - the File object
 * @param {string} source            - 'order_ledger' | 'razorpay_psp' | 'bank_statement'
 * @param {boolean} includeTransactions
 */
export async function uploadDataSource(file, source, includeTransactions = true) {
  const form = new FormData()
  form.append('file', file)
  form.append('source', source)
  form.append('include_transactions', String(includeTransactions))

  const res = await fetch(`${BASE}/upload/`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body?.detail?.message || body?.detail || detail
    } catch {}
    throw new Error(detail)
  }
  return res.json()
}

// ─── Schema / Normalization ───────────────────────────────────────────────────
/**
 * Fetch the canonical schema map: field definitions, source column aliases,
 * and normalization pipeline steps.
 */
export const getSchemaMapping = () => request('GET', '/schema/mapping')

// ─── Reconciliation ───────────────────────────────────────────────────────────
/**
 * Run 3-way matching by uploading one file per source.
 * @param {File}   orderFile  - Order/Ledger file
 * @param {File}   pspFile    - Razorpay/PSP file
 * @param {File}   bankFile   - Bank Statement file
 * @param {number} tolerance  - Amount tolerance % (default 0.5)
 * @param {number} dateWindow - Date window in days (default 2)
 */
export async function runReconciliation(orderFile, pspFile, bankFile, tolerance = 0.5, dateWindow = 2) {
  const form = new FormData()
  form.append('order_file',  orderFile)
  form.append('psp_file',    pspFile)
  form.append('bank_file',   bankFile)
  form.append('tolerance',   String(tolerance))
  form.append('date_window', String(dateWindow))

  const res = await fetch(`${BASE}/reconciliation/run`, { method: 'POST', body: form })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body?.detail?.message || body?.detail || detail
    } catch {}
    throw new Error(detail)
  }
  return res.json()
}

// ─── AI Narrative Report (Steps 7 & 8) ────────────────────────────────────────
export const generateAIReport = () => request('POST', '/report/generate')
export const getLatestAIReport = () => request('GET', '/report/latest')

// ─── Exception Workspace (Module 9) ───────────────────────────────────────────
export const listExceptions = (statusFilter) => {
  const qs = statusFilter ? `?status_filter=${statusFilter}` : ''
  return request('GET', `/exceptions/${qs}`)
}
export const getException   = (id) => request('GET', `/exceptions/${id}`)
export const assignException = (id, assigned_to) =>
  request('POST', `/exceptions/${id}/assign`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_to }),
  })
export const addComment = (id, author, text) =>
  fetch(`/api/exceptions/${id}/comment`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author, text }),
  }).then(r => r.json())
export const resolveException = (id, resolved_by, note = '') =>
  fetch(`/api/exceptions/${id}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolved_by, note }),
  }).then(r => r.json())
export const reopenException = (id) => request('POST', `/exceptions/${id}/reopen`)

// ─── Export ───────────────────────────────────────────────────────────────────
export const downloadExceptionsCsv     = () => window.open('/api/exceptions/export/csv', '_blank')
export const downloadReconciliationCsv = () => window.open('/api/exceptions/export/reconciliation', '_blank')
