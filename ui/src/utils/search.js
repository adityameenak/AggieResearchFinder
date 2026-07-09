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
  // Harvard SEAS / MIT-specific
  environmental:        'Environmental Engineering',
  'applied-physics':    'Applied Physics',
  // MIT-specific STEM departments (see crawler/crawl_mit2.py DEPT_MAP)
  'brain-cognitive-sciences':    'Brain & Cognitive Sciences',
  'earth-atmospheric-planetary': 'Earth, Atmos. & Planetary Sci.',
}

export function deptLabel(slug) {
  return DEPT_DISPLAY[slug] || slug || 'Unknown'
}
