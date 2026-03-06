/**
 * Search & ranking utilities for the TAMU Research Finder.
 */

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
 * Filter, score, and sort the faculty array.
 * @param {object[]} faculty - full faculty array
 * @param {string}   query   - raw search string
 * @param {object}   filters - { department: string, hasResearchOnly: bool }
 * @returns {object[]} ranked results (each has a `_score` property)
 */
export function searchAndRank(faculty, query, filters = {}) {
  const tokens = tokenize(query)

  let results = faculty.filter(prof => {
    if (filters.department && prof.department !== filters.department) return false
    if (filters.hasResearchOnly && !(prof.research_summary || '').trim()) return false
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
  chemical:   'Chemical Engineering',
  civil:      'Civil & Environmental',
  cse:        'Computer Science & Eng.',
  electrical: 'Electrical & Computer Eng.',
  industrial: 'Industrial & Systems',
  materials:  'Materials Science',
  mechanical: 'Mechanical Engineering',
  nuclear:    'Nuclear Engineering',
  ocean:      'Ocean Engineering',
  petroleum:  'Petroleum Engineering',
}

export function deptLabel(slug) {
  return DEPT_DISPLAY[slug] || slug || 'Unknown'
}
