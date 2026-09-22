/**
 * How a faculty record is presented to an LLM caller (the MCP server).
 *
 * Two rules drive the shape:
 *
 * 1. Never emit the raw `research_summary`. It is a pipe-joined run-on of
 *    scraped fragments and often opens with navigation boilerplate.
 *    `splitResearch()` already resolves the ai_review-first preference and the
 *    scholar_interests merge that the UI shows on every card — reusing it is
 *    what makes MCP results match what a user sees on the site.
 * 2. Omit empty keys rather than emitting nulls. Across ten search hits the
 *    difference is real tokens in the caller's context.
 */
import { splitResearch, deptLabel, isActiveLab } from '../../src/utils/search.js'
import { SCHOOLS } from '../../src/schools.js'

/** Drop null/undefined/''/[] so the payload carries only real values. */
function compact(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out
}

function schoolName(code) {
  return SCHOOLS[code]?.name || code
}

/** Search/match hit. Compact by design — callers page through many of these. */
export function profBrief(prof) {
  const { summary, keywords } = splitResearch(prof)
  return compact({
    id: prof.id,
    name: prof.name,
    title: prof.title,
    school: schoolName(prof.university),
    school_code: prof.university,
    department: prof.department ? deptLabel(prof.department) : '',
    // The slug, so an agent can feed it straight back as a `department` filter.
    department_slug: prof.department,
    summary,
    keywords,
    email: prof.email,
    profile_url: prof.profile_url,
    lab_website: prof.lab_website,
    google_scholar: prof.google_scholar,
    active_lab: isActiveLab(prof) || undefined,
    pub_count: prof.pub_count,
  })
}

/** Everything we know about one professor, plus their papers. */
export function profFull(prof, publications = []) {
  return compact({
    ...profBrief(prof),
    phone: prof.phone,
    office: prof.office,
    photo_url: prof.photo_url,
    also_departments: (prof.also_departments || []).map(d => deptLabel(d)),
    also_profile_urls: prof.also_profile_urls,
    publications: publications.slice(0, 8).map(p => compact({
      title: p.title, year: p.year, cited_by: p.cited_by,
    })),
  })
}

/**
 * A compact markdown rendering of hits. Several MCP clients display only the
 * text content block and ignore structuredContent, so every tool returns both.
 */
export function briefsToMarkdown(briefs, { heading = '', numbered = true } = {}) {
  if (!briefs.length) return heading ? `${heading}\n\n(no results)` : '(no results)'
  const lines = heading ? [heading, ''] : []
  briefs.forEach((b, i) => {
    const n = numbered && briefs.length > 1 ? `${i + 1}. ` : ''
    lines.push(`**${n}${b.name}** — ${b.title || ''}`.trim())
    const meta = [b.department, b.school].filter(Boolean).join(' · ')
    if (meta) lines.push(meta)
    if (b.summary) lines.push(b.summary.length > 320 ? `${b.summary.slice(0, 320)}…` : b.summary)
    if (b.keywords?.length) lines.push(`_Topics:_ ${b.keywords.slice(0, 6).join(', ')}`)
    const links = [
      b.email ? `email: ${b.email}` : '',
      b.profile_url ? `profile: ${b.profile_url}` : '',
      b.lab_website ? `lab: ${b.lab_website}` : '',
      b.google_scholar ? `scholar: ${b.google_scholar}` : '',
    ].filter(Boolean)
    if (links.length) lines.push(links.join(' · '))
    lines.push(`\`id: ${b.id}\``)
    lines.push('')
  })
  return lines.join('\n').trim()
}
