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
