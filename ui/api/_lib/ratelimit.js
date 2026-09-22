/**
 * Per-IP request limiting for /api/mcp.
 *
 * BE CLEAR ABOUT WHAT THIS IS: an in-memory counter lives in one serverless
 * instance, so the real ceiling is (limit × concurrent instances) and a
 * determined caller routes around it. This is a politeness guard against a
 * runaway agent loop, NOT a defence.
 *
 * It is adequate here because /api/mcp is read-only over data that is already
 * public on the site and already CDN-cached, and because the one genuinely
 * expensive resource — Anthropic tokens — is deliberately not reachable from
 * the MCP surface (see draft_email_brief: it returns material, never prose).
 *
 * The real lever is a Vercel Firewall rate-limit rule on /api/mcp, configured
 * in the dashboard. Like GITHUB_TOKEN, that is dashboard state invisible to
 * this repo — it is recorded in HANDOFF.md.
 */

const WINDOWS = [
  { name: 'minute', ms: 60_000, max: 60 },
  { name: 'hour', ms: 3_600_000, max: 600 },
]

// ip → timestamps[]. Pruned on access; also swept when it grows unbounded.
const hits = new Map()
const MAX_TRACKED_IPS = 5_000

function clientIp(req) {
  const fwd = req.headers?.['x-forwarded-for']
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim()
  if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim()
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown'
}

/**
 * @returns {{ok: true} | {ok: false, retryAfter: number, window: string}}
 */
export function check(req) {
  const ip = clientIp(req)
  const now = Date.now()
  const longest = WINDOWS[WINDOWS.length - 1].ms

  if (hits.size > MAX_TRACKED_IPS) {
    for (const [k, ts] of hits) if (!ts.some(t => now - t < longest)) hits.delete(k)
  }

  const recent = (hits.get(ip) || []).filter(t => now - t < longest)

  for (const w of WINDOWS) {
    const inWindow = recent.filter(t => now - t < w.ms)
    if (inWindow.length >= w.max) {
      hits.set(ip, recent)   // record the prune, not the rejected hit
      const oldest = Math.min(...inWindow)
      return {
        ok: false,
        window: w.name,
        retryAfter: Math.max(1, Math.ceil((w.ms - (now - oldest)) / 1000)),
      }
    }
  }

  recent.push(now)
  hits.set(ip, recent)
  return { ok: true }
}
