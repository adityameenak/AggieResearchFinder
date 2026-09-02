/**
 * Search & ranking utilities for the Texas STEM Research Finder.
 */
import { isUsefulTopic } from './topics.js'

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/** Convert a raw query string into lowercase search tokens (≥ 2 chars). */
export function tokenize(query) {
  if (!query) return []
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2)
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score a professor record against the given tokens.
 * Higher is better. Returns 0 if no tokens match.
 */
export function scoreProfessor(prof, tokens) {
  if (!tokens.length) return 1  // no query → equal weight

  // Scraped Google Scholar interests are part of the searchable text so a
  // query like "machine learning" matches a PI whose Scholar profile lists it
  // even if the bio doesn't spell it out.
  const scholarText = (prof.scholar_interests || []).join(' ')

  const parts = [
    (prof.research_summary || '') + ' ',
    (prof.name             || '') + ' ',
    (prof.title            || '') + ' ',
    (prof.department       || '') + ' ',
    scholarText            + ' ',
  ]
  const haystack = parts.join(' ').toLowerCase()

  let score = 0
  for (const token of tokens) {
    // Count occurrences in the full haystack
    let pos = 0
    while ((pos = haystack.indexOf(token, pos)) !== -1) {
      score++
      pos += token.length
    }
    // Bonus: token appears in name
    if ((prof.name || '').toLowerCase().includes(token)) score += 5
    // Bonus: token in research summary or Scholar interests specifically
    if ((prof.research_summary || '').toLowerCase().includes(token)) score += 2
    if (scholarText.toLowerCase().includes(token)) score += 2
  }
  return score
}

// ---------------------------------------------------------------------------
// Search + filter + rank
// ---------------------------------------------------------------------------

/**
 * Split a record into a readable `summary` (the card preview) and short
 * `keywords` (tag pills).
 *
 * The preview prefers `ai_review` — a clean generated paragraph — because
 * `research_summary` is frequently just a run-on of research areas (e.g. TAMU:
 * "High-speed combustion Laser diagnostics Turbulent flames"), which reads as
 * junk in a preview and belongs in the keyword pills instead. We only fall
 * back to a research_summary segment when it's genuinely sentence-like.
 * Keywords come from the " | "-joined research-area tail + scholar_interests,
 * junk-filtered.
 */
export function splitResearch(prof) {
  const parts = (prof.research_summary || '').split('|').map(s => s.trim()).filter(Boolean)

  let summary = (prof.ai_review || '').trim()
  let keywordParts = parts
  if (!summary) {
    // No AI review — use a real sentence from the summary if one exists.
    const sentence = parts.find(p => /[.!?]/.test(p) && p.split(/\s+/).length >= 10)
    if (sentence) {
      summary = sentence
      keywordParts = parts.filter(p => p !== sentence)
    }
  }

  const keywords = []
  for (const p of keywordParts) {
    if (p.length <= 60) keywords.push(p)   // run-on prose blobs are dropped, not shown
  }
  for (const k of prof.scholar_interests || []) {
    if (k && String(k).trim()) keywords.push(String(k).trim())
  }
  // de-dupe (case-insensitive), drop junk/heading terms, cap
  const seen = new Set()
  const dedup = keywords.filter(k => {
    const l = k.toLowerCase()
    if (seen.has(l) || !isUsefulTopic(k)) return false
    seen.add(l)
    return true
  }).slice(0, 10)
  return { summary, keywords: dedup }
}

/**
 * A lab website or Google Scholar profile is a proxy for an active, often-funded
 * research group — the most relevant signal for someone (e.g. an international
 * student) looking for a faculty member who can fund a research position.
 */
export function isActiveLab(prof) {
  return Boolean((prof.lab_website || '').trim() || (prof.google_scholar || '').trim())
}

/**
 * Filter, score, and sort the faculty array.
 * @param {object[]} faculty - full faculty array
 * @param {string}   query   - raw search string
 * @param {object}   filters - { department, hasResearchOnly, activeLabsOnly }
 * @returns {object[]} ranked results (each has a `_score` property)
 */
export function searchAndRank(faculty, query, filters = {}) {
  const tokens = tokenize(query)

  let results = faculty.filter(prof => {
    if (filters.department && prof.department !== filters.department) return false
    if (filters.hasResearchOnly && !(prof.research_summary || '').trim()) return false
    // "Active labs": proxy for an active, often-funded research group.
    if (filters.activeLabsOnly && !isActiveLab(prof)) return false
    return true
  })

  if (tokens.length > 0) {
    results = results
      .map(prof => ({ ...prof, _score: scoreProfessor(prof, tokens) }))
      .filter(prof => prof._score > 0)
      .sort((a, b) => b._score - a._score)
  } else {
    // No query: return all filtered results with equal score
    results = results.map(prof => ({ ...prof, _score: 1 }))
  }

  return results
}

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

/**
 * Split *text* into segments where matched tokens are flagged.
 * Returns an array of { text, highlight } objects suitable for rendering.
 *
 * Works by using String.split() with a capturing group regex — matched tokens
 * land at odd indices in the resulting array.
 */
export function highlightSegments(text, tokens) {
  if (!text || !tokens.length) return [{ text: text || '', highlight: false }]

  const escaped = tokens
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)
  if (!escaped.length) return [{ text, highlight: false }]

  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) => ({ text: part, highlight: i % 2 === 1 }))
}

// ---------------------------------------------------------------------------
// Department display names
// ---------------------------------------------------------------------------

const DEPT_DISPLAY = {
  // Generated from crawler/taxonomy.py CANONICAL — keep the two in step.
  // A slug with no entry renders raw, including into indexed page titles,
  // so add a label whenever taxonomy.CANONICAL grows.
  // Engineering
  aerospace:                        'Aerospace Engineering',
  biomedical:                       'Biomedical Engineering',
  chemical:                         'Chemical Engineering',
  civil:                            'Civil & Environmental',
  cse:                              'Computer Science & Eng.',
  electrical:                       'Electrical & Computer Eng.',
  etid:                             'Engineering Technology',
  industrial:                       'Industrial & Systems',
  materials:                        'Materials Science',
  mechanical:                       'Mechanical Engineering',
  nuclear:                          'Nuclear Engineering',
  ocean:                            'Ocean Engineering',
  petroleum:                        'Petroleum Engineering',

  // Natural sciences
  biology:                          'Biology',
  chemistry:                        'Chemistry',
  mathematics:                      'Mathematics',
  'physics-astronomy':              'Physics & Astronomy',
  statistics:                       'Statistics',
  'applied-physics':                'Applied Physics',
  'earth-atmospheric':              'Earth & Atmospheric Sciences',
  oceanography:                     'Oceanography',
  'psychological-brain-sciences':   'Psych. & Brain Sciences',

  // Health & life sciences
  'public-health':                  'Public Health',
  medicine:                         'Medicine',
  nursing:                          'Nursing',
  pharmacy:                         'Pharmacy',
  dentistry:                        'Dentistry',
  veterinary:                       'Veterinary Medicine',
  neuroscience:                     'Neuroscience',
  genetics:                         'Genetics & Genomics',
  immunology:                       'Immunology & Microbiology',
  nutrition:                        'Nutrition & Food Science',
  kinesiology:                      'Kinesiology & Health',
}


// ---------------------------------------------------------------------------
// Department badge styling
// ---------------------------------------------------------------------------
// One source for the dept badge colours. ProfCard, ProfDetail and Match each
// used to keep their own copy, which had drifted — Match knew about 10 slugs,
// ProfCard about 24, and neither had the MIT/Rice/Harvard ones, so those cards
// rendered grey. Class strings are written out in full because Tailwind's JIT
// cannot follow `bg-${color}-50`.
export const DEPT_STYLES = {
  aerospace:                        { dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-800 ring-indigo-200' },
  biomedical:                       { dot: 'bg-pink-500', pill: 'bg-pink-50 text-pink-800 ring-pink-200' },
  chemical:                         { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-800 ring-amber-200' },
  civil:                            { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  cse:                              { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-800 ring-violet-200' },
  electrical:                       { dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-800 ring-blue-200' },
  etid:                             { dot: 'bg-lime-500', pill: 'bg-lime-50 text-lime-800 ring-lime-200' },
  industrial:                       { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-800 ring-orange-200' },
  materials:                        { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-800 ring-rose-200' },
  mechanical:                       { dot: 'bg-teal-500', pill: 'bg-teal-50 text-teal-800 ring-teal-200' },
  nuclear:                          { dot: 'bg-red-500', pill: 'bg-red-50 text-red-800 ring-red-200' },
  ocean:                            { dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-800 ring-sky-200' },
  petroleum:                        { dot: 'bg-yellow-500', pill: 'bg-yellow-50 text-yellow-800 ring-yellow-200' },
  biology:                          { dot: 'bg-green-500', pill: 'bg-green-50 text-green-800 ring-green-200' },
  chemistry:                        { dot: 'bg-cyan-500', pill: 'bg-cyan-50 text-cyan-800 ring-cyan-200' },
  mathematics:                      { dot: 'bg-purple-500', pill: 'bg-purple-50 text-purple-800 ring-purple-200' },
  'physics-astronomy':              { dot: 'bg-slate-500', pill: 'bg-slate-50 text-slate-800 ring-slate-200' },
  statistics:                       { dot: 'bg-zinc-500', pill: 'bg-zinc-50 text-zinc-800 ring-zinc-200' },
  'applied-physics':                { dot: 'bg-fuchsia-500', pill: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200' },
  'earth-atmospheric':              { dot: 'bg-stone-500', pill: 'bg-stone-50 text-stone-800 ring-stone-200' },
  oceanography:                     { dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-800 ring-blue-200' },
  'psychological-brain-sciences':   { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-800 ring-rose-200' },
  'public-health':                  { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  medicine:                         { dot: 'bg-red-500', pill: 'bg-red-50 text-red-800 ring-red-200' },
  nursing:                          { dot: 'bg-pink-500', pill: 'bg-pink-50 text-pink-800 ring-pink-200' },
  pharmacy:                         { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-800 ring-violet-200' },
  dentistry:                        { dot: 'bg-cyan-500', pill: 'bg-cyan-50 text-cyan-800 ring-cyan-200' },
  veterinary:                       { dot: 'bg-lime-500', pill: 'bg-lime-50 text-lime-800 ring-lime-200' },
  neuroscience:                     { dot: 'bg-fuchsia-500', pill: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200' },
  genetics:                         { dot: 'bg-purple-500', pill: 'bg-purple-50 text-purple-800 ring-purple-200' },
  immunology:                       { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-800 ring-orange-200' },
  nutrition:                        { dot: 'bg-green-500', pill: 'bg-green-50 text-green-800 ring-green-200' },
  kinesiology:                      { dot: 'bg-teal-500', pill: 'bg-teal-50 text-teal-800 ring-teal-200' },
}

/** Badge classes for a department slug, with a neutral fallback. */
export function deptStyle(slug) {
  return DEPT_STYLES[slug] ?? { dot: 'bg-stone-400', pill: 'bg-stone-100 text-stone-600 ring-stone-200' }
}

export function deptLabel(slug) {
  return DEPT_DISPLAY[slug] || slug || 'Unknown'
}
