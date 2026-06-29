/**
 * Search & ranking utilities for the Texas STEM Research Finder.
 */
import { isUsefulTopic } from './topics'

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

  const parts = [
    (prof.research_summary || '') + ' ',
    (prof.name             || '') + ' ',
    (prof.title            || '') + ' ',
    (prof.department       || '') + ' ',
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
    // Bonus: token appears in research summary specifically
    if ((prof.research_summary || '').toLowerCase().includes(token)) score += 2
  }
  return score
}

// ---------------------------------------------------------------------------
// Search + filter + rank
// ---------------------------------------------------------------------------

/**
 * Crawlers append research areas/keywords to the bio as " | "-joined tails
 * (e.g. "Our lab studies ... | Biophysics | Nanoscience"). Split a record's
 * research_summary into a prose `summary` (the preview) and short `keywords`
 * (shown as tags), folding in scholar_interests. A part is "prose" if it's
 * long or sentence-like; short parts become keywords.
 */
export function splitResearch(prof) {
  const raw = (prof.research_summary || '').trim()
  const parts = raw.split('|').map(s => s.trim()).filter(Boolean)

  let summary = ''
  let i = 0
  if (parts.length && (parts[0].length > 80 || /[.!?]/.test(parts[0]))) {
    summary = parts[0]
    i = 1
  }
  const keywords = []
  for (; i < parts.length; i++) {
    if (parts[i].length <= 60) keywords.push(parts[i])
    else if (!summary) summary = parts[i]   // no prose yet → use the long part
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
  }).slice(0, 8)
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
  // Engineering
  aerospace:   'Aerospace Engineering',
  biomedical:  'Biomedical Engineering',
  chemical:    'Chemical Engineering',
  civil:       'Civil & Environmental',
  cse:         'Computer Science & Eng.',
  electrical:  'Electrical & Computer Eng.',
  etid:        'Engineering Technology',
  industrial:  'Industrial & Systems',
  materials:   'Materials Science',
  mechanical:  'Mechanical Engineering',
  multidisciplinary: 'Multidisciplinary Eng.',
  nuclear:     'Nuclear Engineering',
  ocean:       'Ocean Engineering',
  petroleum:   'Petroleum Engineering',
  // Arts & Sciences
  biology:     'Biology',
  chemistry:   'Chemistry',
  mathematics: 'Mathematics',
  'physics-astronomy':  'Physics & Astronomy',
  statistics:  'Statistics',
  'atmos-science':      'Atmospheric Sciences',
  'geology-geophysics': 'Geology & Geophysics',
  oceanography:         'Oceanography',
  'psychological-brain-sciences': 'Psych. & Brain Sciences',
  // Rice-specific STEM departments (see crawler/crawl_rice.py STEM_RULES)
  biosciences:          'BioSciences',
  bioengineering:       'Bioengineering',
  'earth-environmental': 'Earth & Environmental',
  'systems-synthetic-biology': 'Systems & Synthetic Biology',
  'applied-physics':    'Applied Physics',
  cmor:                 'Computational & Applied Math',
  kinesiology:          'Kinesiology',
  // UT Dallas-specific STEM departments (see crawler/crawl_utd.py STEM_RULES)
  'systems-engineering': 'Systems Engineering',
  geosciences:          'Geosciences',
}

export function deptLabel(slug) {
  return DEPT_DISPLAY[slug] || slug || 'Unknown'
}
