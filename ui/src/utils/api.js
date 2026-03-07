/**
 * Thin API client for the TAMUResearchFinder backend.
 * In dev, Vite proxies /api/* → localhost:8000.
 * In prod, set VITE_API_BASE_URL to your deployed backend URL.
 */

const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function request(path, options = {}) {
  const url = `${BASE}/api${path}`
  const res = await fetch(url, options)
  if (!res.ok) {
    let message = `Server error ${res.status}`
    try {
      const err = await res.json()
      message = err.detail || message
    } catch { /* ignore */ }
    throw new Error(message)
  }
  return res.json()
}

export async function apiGet(path) {
  return request(path)
}

export async function apiPost(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function apiUpload(path, formData) {
  return request(path, { method: 'POST', body: formData })
}

export async function checkHealth() {
  try {
    return await apiGet('/health')
  } catch {
    return null
  }
}
