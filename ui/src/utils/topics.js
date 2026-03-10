/**
 * Adaptive topic chip utilities.
 *
 * Extracts popular research topics from faculty data and merges them with
 * user search history so the "filter by topic" chips stay relevant.
 */

const SEARCH_COUNTS_KEY = 'tamu_search_counts'

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
      if (norm.length < 3 || seen.has(norm)) continue
      // Skip single-word generic terms that aren't useful as chip labels
      if (!norm.includes(' ') && GENERIC_TERMS.has(norm)) continue
      seen.add(norm)
      counts.set(norm, (counts.get(norm) || 0) + 1)
    }

    // Fallback: research_summary pipe segments (skip first concatenated blob)
    if (f.research_summary) {
      const segments = f.research_summary.split('|')
      for (let i = 1; i < segments.length; i++) {
        const topic = segments[i].trim().toLowerCase()
        if (topic.length < 3 || topic.length > 40 || seen.has(topic)) continue
        if (!topic.includes(' ') && GENERIC_TERMS.has(topic)) continue
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

export function loadSearchCounts() {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_COUNTS_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveSearchCounts(counts) {
  try {
    localStorage.setItem(SEARCH_COUNTS_KEY, JSON.stringify(counts))
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
