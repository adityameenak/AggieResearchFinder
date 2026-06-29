/**
 * Adaptive topic chip utilities.
 *
 * Extracts popular research topics from faculty data and merges them with
 * user search history so the "filter by topic" chips stay relevant.
 */

const DEFAULT_SCHOOL = 'tamu'

function searchCountsKey(schoolCode = DEFAULT_SCHOOL) {
  return `${schoolCode}_search_counts`
}

// ── Title-case helper ──────────────────────────────────────────────────

const LOWERCASE_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor',
  'on', 'at', 'to', 'by', 'of', 'in', 'with',
])

export function toTitleCase(str) {
  return str.replace(/\b\w+/g, (word, index) => {
    if (index > 0 && LOWERCASE_WORDS.has(word)) return word
    return word.charAt(0).toUpperCase() + word.slice(1)
  })
}

// ── Extract topics from faculty data ───────────────────────────────────

// Single-word terms too vague to be useful as standalone chip labels
const GENERIC_TERMS = new Set([
  'materials', 'energy', 'inorganic', 'organic', 'physical',
  'analytical', 'modeling', 'theory', 'design', 'systems',
  'control', 'imaging', 'synthesis', 'analysis', 'simulation',
])

// Section headings / boilerplate that leak in from scraped profiles and just
// pollute the chips and search (they're not research topics).
const JUNK_TOPICS = new Set([
  'research', 'research areas', 'research area', 'research interests',
  'research interest', 'research summary', 'research focus', 'research statement',
  'fields of interest', 'field of interest', 'areas of interest', 'area of interest',
  'contact information', 'biography', 'bio', 'overview', 'education',
  'publications', 'selected publications', 'awards', 'honors', 'honors and awards',
  'teaching', 'teaching areas', 'appointments', 'affiliations', 'affiliation',
  'centers and institutes', 'professional preparation', 'additional information',
  'email address', 'email', 'phone', 'office', 'fax', 'address',
  'curriculum vitae', 'cv', 'website', 'web site', 'google scholar', 'scholar',
  'n/a', 'na', 'none', 'tba', 'professor', 'associate professor',
  'assistant professor', 'faculty', 'lecturer', 'department',
])

/**
 * Is a string a genuinely useful research topic (vs. a heading, a stopword
 * fragment, a building code, a number, or a too-generic single word)?
 */
export function isUsefulTopic(term) {
  const t = (term || '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (t.length < 3 || t.length > 45) return false
  if (!/[a-z]/.test(t)) return false                 // must contain a letter
  if (/^\d/.test(t) || /^[a-z]{2,4}\s?\d/i.test(t)) return false  // codes like "WEL 3.120"
  if (JUNK_TOPICS.has(t)) return false
  if (!t.includes(' ') && GENERIC_TERMS.has(t)) return false
  if (/^(and|or|the|of|in|with|for|to|a|an)\b/.test(t)) return false  // fragment
  if (/\b(and|or|of|the)$/.test(t)) return false     // dangling-conjunction fragment
  return true
}

/**
 * Scan scholar_interests and research_summary across all faculty records.
 * Returns the top 30 topics ranked by how many faculty mention each one.
 *
 * @param {object[]} faculty
 * @returns {{label: string, q: string, count: number}[]}
 */
export function extractTopicsFromFaculty(faculty) {
  const counts = new Map() // normalized topic → faculty count

  for (const f of faculty) {
    const seen = new Set() // prevent double-counting per faculty member

    // Primary source: scholar_interests (curated, clean)
    for (const interest of (f.scholar_interests || [])) {
      const norm = interest.trim().toLowerCase()
      if (seen.has(norm) || !isUsefulTopic(norm)) continue
      seen.add(norm)
      counts.set(norm, (counts.get(norm) || 0) + 1)
    }

    // Fallback: research_summary pipe segments (skip first concatenated blob)
    if (f.research_summary) {
      const segments = f.research_summary.split('|')
      for (let i = 1; i < segments.length; i++) {
        const topic = segments[i].trim().toLowerCase()
        if (seen.has(topic) || !isUsefulTopic(topic)) continue
        seen.add(topic)
        counts.set(topic, (counts.get(topic) || 0) + 1)
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([topic, count]) => ({
      label: toTitleCase(topic),
      q: topic,
      count,
    }))
}

// ── Search history persistence ─────────────────────────────────────────

export function loadSearchCounts(schoolCode = DEFAULT_SCHOOL) {
  try {
    return JSON.parse(localStorage.getItem(searchCountsKey(schoolCode)) || '{}')
  } catch {
    return {}
  }
}

export function saveSearchCounts(counts, schoolCode = DEFAULT_SCHOOL) {
  try {
    localStorage.setItem(searchCountsKey(schoolCode), JSON.stringify(counts))
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

// ── Merge data topics with user search history ─────────────────────────

/**
 * Combine faculty-derived topics with user search counts.
 * Search history boosts existing topics and can promote new ones.
 *
 * @param {{label: string, q: string, count: number}[]} dataTopics
 * @param {Record<string, number>} searchCounts
 * @param {number} limit - max chips to return
 * @returns {{label: string, q: string}[]}
 */
export function mergeTopics(dataTopics, searchCounts, limit = 15) {
  const scored = dataTopics.map(t => ({
    ...t,
    finalScore: t.count + (searchCounts[t.q] || 0) * 3,
  }))

  // Promote user-searched terms not already in data topics
  // (only if searched at least 2 times to avoid noise)
  const existing = new Set(dataTopics.map(t => t.q))
  for (const [q, count] of Object.entries(searchCounts)) {
    if (!existing.has(q) && count >= 2 && q.length >= 3) {
      scored.push({
        label: toTitleCase(q),
        q,
        count: 0,
        finalScore: count * 3,
      })
    }
  }

  return scored
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit)
    .map(({ label, q }) => ({ label, q }))
}
