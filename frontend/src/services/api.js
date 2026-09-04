/**
 * api.js — Centralised API service layer
 * All calls go through Vite's dev proxy (/api → http://localhost:8000)
 * Supports JWT Token injection & User-Scoped Multi-Tenant operations.
 */

const BASE = '/api'
const TOKEN_KEY = 'finops_auth_token'

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function removeAuthToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function getAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken()
  const headers = { ...extraHeaders }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function request(method, path, options = {}) {
  const headers = getAuthHeaders(options.headers || {})
  const res = await fetch(`${BASE}${path}`, {
    method,
    ...options,
    headers,
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

// ─── Authentication ───────────────────────────────────────────────────────────

export const getAuthConfig = () => request('GET', '/auth/config')

export async function loginWithGoogle(credential) {
  const data = await request('POST', '/auth/google', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })
  if (data?.token) setAuthToken(data.token)
  return data
}

export async function loginDemo() {
  const data = await request('POST', '/auth/demo')
  if (data?.token) setAuthToken(data.token)
  return data
}

export async function fetchCurrentUser() {
  return request('GET', '/auth/me')
}

export function logoutUser() {
  removeAuthToken()
}

// ─── Health ───────────────────────────────────────────────────────────────────
export const checkHealth = () => request('GET', '/health')

// ─── Upload / Data Sources ────────────────────────────────────────────────────
export async function uploadDataSource(file, source, includeTransactions = true) {
  const form = new FormData()
  form.append('file', file)
  form.append('source', source)
  form.append('include_transactions', String(includeTransactions))

  const headers = getAuthHeaders()
  const res = await fetch(`${BASE}/upload/`, {
    method: 'POST',
    headers,
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
export const getSchemaMapping = () => request('GET', '/schema/mapping')

// ─── Reconciliation ───────────────────────────────────────────────────────────
export async function runReconciliation(orderFile, pspFile, bankFile, tolerance = 0.5, dateWindow = 2) {
  const form = new FormData()
  form.append('order_file',  orderFile)
  form.append('psp_file',    pspFile)
  form.append('bank_file',   bankFile)
  form.append('tolerance',   String(tolerance))
  form.append('date_window', String(dateWindow))

  const headers = getAuthHeaders()
  const res = await fetch(`${BASE}/reconciliation/run`, {
    method: 'POST',
    headers,
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

export const getReconciliationHistory = () => request('GET', '/reconciliation/history')
export const loadPastReconRun = (runId) => request('POST', `/reconciliation/${runId}/load`)
export const getLatestReconciliation = () => request('GET', '/reconciliation/latest')

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assigned_to }),
  })

export const addComment = (id, author, text) =>
  request('POST', `/exceptions/${id}/comment`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author, text }),
  })

export const resolveException = (id, resolved_by, note = '') =>
  request('POST', `/exceptions/${id}/resolve`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolved_by, note }),
  })

export const reopenException = (id) => request('POST', `/exceptions/${id}/reopen`)

// ─── Export ───────────────────────────────────────────────────────────────────
export const downloadExceptionsCsv = () => {
  const token = getAuthToken()
  window.open(`${BASE}/exceptions/export/csv${token ? `?token=${token}` : ''}`, '_blank')
}

export const downloadReconciliationCsv = () => {
  const token = getAuthToken()
  window.open(`${BASE}/exceptions/export/reconciliation${token ? `?token=${token}` : ''}`, '_blank')
}
