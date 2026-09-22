/**
 * The MCP tool implementations, as plain async functions.
 *
 * Kept separate from api/mcp.js (the transport) so every tool can be exercised
 * from a plain Node script with no MCP client, session or SSE handshake
 * involved — which is where nearly all the debugging happens.
 *
 * Each handler takes (args, ctx) where ctx = { origin }.
 *
 * These reuse the UI's own scoring modules (src/utils/search.js, matcher.js)
 * rather than reimplementing ranking. That is deliberate and load-bearing: it
 * is what makes an MCP result identical to what the user would see on the site.
 */
import { searchAndRank, deptLabel } from '../../src/utils/search.js'
import { matchFaculty, isMatchable } from '../../src/utils/matcher.js'
import { extractTopicsFromFaculty } from '../../src/utils/topics.js'
import { SCHOOLS } from '../../src/schools.js'
import { SCHOOL_SEO } from '../../src/lib/seo.js'
import { loadSchool, loadPubs, findProf, SCHOOL_CODES } from './data.js'
import { profBrief, profFull, briefsToMarkdown } from './serialize.js'
import {
  MUST, AVOID, STRUCTURE_NOTE, LENGTH_BANDS,
  groundingTier, TIER_NOTES, pickShapes,
} from './emailGuidance.js'

/** One call can never ask for the whole dataset. */
const MAX_LIMIT = 50
const clamp = (n, fallback = 10) => {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 1) return fallback
  return Math.min(Math.floor(v), MAX_LIMIT)
}

function assertSchool(code) {
  if (code && !SCHOOL_CODES.includes(code)) {
    throw new Error(`Unknown school "${code}". Valid codes: ${SCHOOL_CODES.join(', ')}. Call list_schools for details.`)
  }
}

/** Which schools a call covers: the one named, or all of them. */
const targetSchools = code => (code ? [code] : SCHOOL_CODES)

/**
 * Run `fn` over each school one at a time, keeping only the running top-N.
 *
 * Sequential and incremental on purpose: holding all six schools at once is
 * ~10 MB of JSON expanded into objects, and this endpoint runs in a 1024 MB
 * function alongside the MCP SDK. Peak heap here stays at one school.
 *
 * Caveat worth knowing, and reported to the caller rather than hidden: the
 * score is an absolute keyword-hit count, so it is NOT normalized across
 * schools. Schools whose scraped summaries run longer (TAMU most of all) score
 * higher for the same relevance, which biases an all-schools ranking toward
 * them. We do not renormalize, because the whole point of reusing
 * searchAndRank is that an MCP result matches what the site would show — a
 * private scoring tweak here would reintroduce exactly the drift that made
 * backend/services/matcher.py useless. Callers who want per-school ranking
 * should pass `school`.
 */
async function acrossSchools(codes, origin, limit, fn) {
  let best = []
  for (const code of codes) {
    const faculty = await loadSchool(code, origin)
    best = best.concat(fn(faculty)).sort((a, b) => b._sortScore - a._sortScore).slice(0, limit)
  }
  return best
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export async function listSchools() {
  const schools = SCHOOL_CODES.map(code => ({
    code,
    name: SCHOOLS[code].name,
    short_name: SCHOOLS[code].shortName,
    city: SCHOOLS[code].city,
    state: SCHOOLS[code].state,
    faculty_count: SCHOOL_SEO[code]?.count ?? null,
  }))
  const total = schools.reduce((a, s) => a + (s.faculty_count || 0), 0)
  return {
    data: { schools, total_faculty: total },
    text: [
      `${schools.length} universities, ${total.toLocaleString()} research faculty:`,
      '',
      ...schools.map(s => `- **${s.name}** (\`${s.code}\`) — ${s.faculty_count?.toLocaleString() ?? '?'} faculty · ${s.city}`),
    ].join('\n'),
  }
}

export async function listDepartments({ school }, { origin }) {
  assertSchool(school)
  const counts = new Map()
  for (const code of targetSchools(school)) {
    const faculty = await loadSchool(code, origin)
    for (const p of faculty) {
      if (!p.department) continue
      counts.set(p.department, (counts.get(p.department) || 0) + 1)
    }
  }
  const departments = [...counts.entries()]
    .map(([slug, count]) => ({ slug, label: deptLabel(slug), count }))
    .sort((a, b) => b.count - a.count)
  return {
    data: { school: school || 'all', departments },
    text: [
      `Departments${school ? ` at ${SCHOOLS[school].name}` : ' across all schools'}:`,
      '',
      ...departments.map(d => `- ${d.label} (\`${d.slug}\`) — ${d.count}`),
    ].join('\n'),
  }
}

export async function listTopics({ school, limit }, { origin }) {
  assertSchool(school)
  const n = clamp(limit, 20)
  // Topic extraction reads the whole set, so this one is per-school by design.
  const code = school || 'tamu'
  const faculty = await loadSchool(code, origin)
  const topics = extractTopicsFromFaculty(faculty).slice(0, n)
  return {
    data: { school: code, topics },
    text: [
      `Most common research topics at ${SCHOOLS[code].name} (use one as a \`query\`):`,
      '',
      ...topics.map(t => `- ${t.label} — ${t.count} faculty`),
    ].join('\n'),
  }
}

export async function searchFaculty(args, { origin }) {
  const { query, school, department, has_research_only, active_labs_only } = args
  assertSchool(school)
  if (!query || !String(query).trim()) throw new Error('`query` is required.')
  const limit = clamp(args.limit, 10)

  const hits = await acrossSchools(targetSchools(school), origin, limit, faculty =>
    searchAndRank(faculty, query, {
      department: department || '',
      hasResearchOnly: Boolean(has_research_only),
      activeLabsOnly: Boolean(active_labs_only),
    }).slice(0, limit).map(p => ({ ...p, _sortScore: p._score })))

  const briefs = hits.map(profBrief)
  const crossSchool = !school
  const note = crossSchool
    ? '\n_Ranked across all six universities. Scores are raw keyword-hit counts and are not normalized between schools, so schools with longer profile text rank higher for equal relevance — pass `school` for a fair per-school ranking._'
    : ''
  return {
    data: {
      query,
      school: school || 'all',
      schools_searched: targetSchools(school),
      count: briefs.length,
      results: briefs,
      ...(crossSchool ? { ranking_caveat: 'Scores are not normalized across schools; pass `school` for per-school ranking.' } : {}),
    },
    text: briefsToMarkdown(briefs, {
      heading: `${briefs.length} faculty matching "${query}"${school ? ` at ${SCHOOLS[school].name}` : ''}:`,
    }) + note,
  }
}

export async function matchFacultyTool(args, { origin }) {
  const { interests, school } = args
  assertSchool(school)
  if (!interests || !String(interests).trim()) throw new Error('`interests` is required.')
  const limit = clamp(args.limit, 10)

  // matchFaculty() needs no resume — unlike the FastAPI /api/match route, which
  // requires an uploaded-resume session_id. So MCP can offer interests-only
  // matching, which is what a chatbot caller actually has.
  const hits = await acrossSchools(targetSchools(school), origin, limit, faculty =>
    matchFaculty(faculty, interests, null, limit).map(m => ({ ...m, _sortScore: m.score })))

  const results = hits.map((m, i) => ({
    rank: i + 1,
    fit_label: m.fit_label,
    score: m.score,
    explanation: m.explanation,
    professor: profBrief(m.professor),
  }))
  return {
    data: { interests, school: school || 'all', count: results.length, results },
    text: [
      `Best research-fit matches for "${interests}":`,
      '',
      ...results.map(r =>
        `**${r.rank}. ${r.professor.name}** — ${r.fit_label} (${r.score})\n${r.explanation}\n\`id: ${r.professor.id}\``),
    ].join('\n\n'),
  }
}

export async function getProfessor({ id, name, school }, { origin }) {
  assertSchool(school)
  if (!id && !name) throw new Error('Provide `id` or `name`.')

  let found = null
  for (const code of targetSchools(school)) {
    const faculty = await loadSchool(code, origin)
    found = findProf(faculty, { id, name })
    if (found) break
  }
  if (!found) {
    throw new Error(`No professor found for ${id ? `id "${id}"` : `name "${name}"`}${school ? ` at ${school}` : ''}.`)
  }

  // Publications fold in here rather than living in their own tool: an agent
  // looking at one professor always wants their papers, and a second
  // round-trip costs a whole turn for a few KB.
  const pubs = await loadPubs(found.id, origin, found.pub_count)
  const full = profFull(found, pubs)
  const lines = [briefsToMarkdown([full], { numbered: false })]
  if (full.publications?.length) {
    lines.push('**Most-cited publications**', '')
    lines.push(...full.publications.map(p =>
      `- ${p.title}${p.year ? ` (${p.year})` : ''}${p.cited_by ? ` — ${p.cited_by} citations` : ''}`))
  }
  if (!isMatchable(found)) {
    lines.push('', '_This profile has no research text on record, so it is excluded from research-fit matching._')
  }
  return { data: full, text: lines.join('\n') }
}

/**
 * Material for writing an outreach email — deliberately NOT a written email.
 *
 * The caller's own model writes the prose. Three reasons: /api/mcp is
 * unauthenticated, so proxying to Anthropic from here would let any script
 * spend the project's API budget; the calling chatbot already holds the
 * student's real voice and past messages, so it can write something better
 * than a short server-side prompt can; and no model call means no mock-mode
 * semantics to leak into MCP.
 */
export async function draftEmailBrief({ id, name, school, student }, { origin }) {
  const { data: prof } = await getProfessor({ id, name, school }, { origin })
  const papers = (prof.publications || []).slice(0, 3).map(p => ({ title: p.title, year: p.year }))
  const tier = groundingTier({ papers: papers.length, summary: prof.summary || '' })
  const shapes = pickShapes(prof.id, 'mcp', tier !== 'sparse')

  const caveats = []
  if (!papers.length) caveats.push('No publication list is on record for this professor — do not invent paper titles.')
  if (!prof.summary) caveats.push('No research summary is on record. Do not claim familiarity with specific work.')
  if (!prof.email) caveats.push('No email address is on record; point the student at the profile page instead.')

  return {
    data: {
      professor: prof,
      specifics: {
        research_focus: prof.summary || null,
        keywords: prof.keywords || [],
        recent_papers: papers,
        links: {
          profile_url: prof.profile_url || null,
          lab_website: prof.lab_website || null,
          google_scholar: prof.google_scholar || null,
        },
      },
      student: student || null,
      guidance: {
        must: MUST,
        avoid: AVOID,
        structure_note: STRUCTURE_NOTE,
        opening: shapes.opening,
        closing: shapes.closing,
        grounding_rule: TIER_NOTES[tier],
        length: LENGTH_BANDS.standard.words,
        subject_rule: "The subject must name something specific about this professor's work or the student's own project. Four to nine words. Never a generic phrase.",
      },
      recipient: prof.email || null,
      caveats,
    },
    text: [
      `## Material for an outreach email to Prof. ${prof.name}`,
      '',
      `**Position:** ${prof.title || '—'} · ${prof.department || '—'} · ${prof.school}`,
      prof.email ? `**Email:** ${prof.email}` : '**Email:** not on record',
      '',
      '',
      prof.summary ? `**Research focus**\n${prof.summary}` : '_No research summary on record._',
      prof.keywords?.length ? `\n**Specific topics:** ${prof.keywords.join(', ')}` : null,
      papers.length
        ? `\n**Recent papers**\n${papers.map(p => `- "${p.title}"${p.year ? ` (${p.year})` : ''}`).join('\n')}`
        : null,
      '',
      '**How to write it**',
      ...MUST.map(m => `- ${m}`),
      `- ${shapes.opening}`,
      `- ${shapes.closing}`,
      `- ${TIER_NOTES[tier]}`,
      `- Length: ${LENGTH_BANDS.standard.words}.`,
      `- ${STRUCTURE_NOTE}`,
      '',
      `**Never use these phrases:** ${AVOID.map(a => `"${a}"`).join(', ')}.`,
      caveats.length ? `\n**Caveats**\n${caveats.map(c => `- ${c}`).join('\n')}` : null,
      // filter drops only the conditional entries; the '' spacers are the
      // blank lines markdown needs between blocks.
    ].filter(l => l !== null).join('\n'),
  }
}

/** name → handler, used by api/mcp.js to register tools. */
export const TOOLS = {
  list_schools: listSchools,
  list_departments: listDepartments,
  list_topics: listTopics,
  search_faculty: searchFaculty,
  match_faculty: matchFacultyTool,
  get_professor: getProfessor,
  draft_email_brief: draftEmailBrief,
}
