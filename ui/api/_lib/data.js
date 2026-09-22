/**
 * Server-side faculty data access, shared by the MCP server and /api/email.
 *
 * The `_lib` prefix keeps Vercel from routing these files as functions.
 *
 * Why fetch over HTTP instead of bundling the JSON into the function: the
 * per-school files already carry `max-age=3600, stale-while-revalidate=86400`
 * headers (see vercel.json), so a fetch from our own origin is an edge-cache
 * hit. Bundling all six via `includeFiles` would add ~10 MB to the lambda
 * artifact, paid on every cold start whether the school is used or not, and
 * would couple a data-only redeploy to the function code.
 */
import { SCHOOLS } from '../../src/schools.js'

export const SCHOOL_CODES = Object.keys(SCHOOLS)

/** Faculty payloads are refetched this often so a redeploy's data lands. */
const TTL_MS = 15 * 60 * 1000

// code → { at, promise }. Module scope, so it survives warm invocations —
// the same trick AppContext uses in the browser.
const schoolCache = new Map()

/**
 * The origin to fetch our own static files from. Derived from the request so
 * `vercel dev` works without configuration; VERCEL_URL covers preview deploys
 * where the request host may be an internal one.
 */
export function originFrom(req) {
  if (process.env.FACULTY_ORIGIN) return process.env.FACULTY_ORIGIN
  const host = req?.headers?.host
  if (host) {
    const proto = req.headers['x-forwarded-proto']
      || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://stemresearchfinder.tech'
}

/** One school's faculty array. Cached; throws if the fetch fails. */
export async function loadSchool(code, origin) {
  if (!SCHOOL_CODES.includes(code)) throw new Error(`Unknown school code: ${code}`)
  const key = `${origin}|${code}`
  const hit = schoolCache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise

  const promise = fetch(`${origin}/faculty-${code}.json`).then(r => {
    if (!r.ok) throw new Error(`faculty-${code}.json → HTTP ${r.status}`)
    return r.json()
  }).catch(err => {
    schoolCache.delete(key)   // don't cache a failure
    throw err
  })
  schoolCache.set(key, { at: Date.now(), promise })
  return promise
}

/**
 * A professor's publications. `pubCount` is the presence gate (same one
 * ProfDetail uses) — only 601 of 5,260 records have a pubs file, so without it
 * we'd 404-probe on most calls. Never throws: publications are a nice-to-have.
 */
export async function loadPubs(profId, origin, pubCount) {
  if (!profId || !pubCount) return []
  try {
    const r = await fetch(`${origin}/pubs/${profId}.json`)
    if (!r.ok) return []
    const pubs = await r.json()
    return Array.isArray(pubs) ? pubs : []
  } catch {
    return []
  }
}

/**
 * Resolve a professor within one school's array.
 *
 * `alias_ids` matters: merge.py collapses joint appointments into one record,
 * and a link or bookmark may still carry a retired id.
 */
export function findProf(faculty, { id, name } = {}) {
  if (id) {
    const byId = faculty.find(p => p.id === id)
      || faculty.find(p => (p.alias_ids || []).includes(id))
    if (byId) return byId
  }
  if (name) {
    const wanted = name.trim().toLowerCase().replace(/^(prof|professor|dr)\.?\s+/, '')
    return faculty.find(p => (p.name || '').toLowerCase() === wanted)
      || faculty.find(p => (p.name || '').toLowerCase().includes(wanted))
      || null
  }
  return null
}
