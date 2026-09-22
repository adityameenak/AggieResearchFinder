/**
 * Client-side faculty matching — mirrors the Python backend's scorer.
 * Interest-driven: stated interests are the primary signal.
 * Resume provides a secondary boost (0.35 weight).
 */
// Imported by plain Node (ui/api/_lib/*), so relative imports need the explicit
// .js extension — same reason as src/lib/seo.js. See CLAUDE.md.
import { tokenize, deptLabel, researchText, hasResearch } from './search.js'

function countHits(tokens, haystack) {
  let score = 0
  const hl = haystack.toLowerCase()
  for (const token of tokens) {
    let pos = 0, found = false
    while ((pos = hl.indexOf(token, pos)) !== -1) {
      score++
      found = true
      pos += token.length
    }
    if (found) score += 1.5
  }
  return score
}

// A professor is only matchable if we know what they research — otherwise
// there's no basis for a "research fit". Blank profiles are excluded entirely.
export function isMatchable(prof) {
  return hasResearch(prof)
}

// Appointment type from merge.py (quality.rank_type). A student matching for a
// research position is poorly served by an emeritus professor or a lecturer
// ranking level with an active PI, but they are still real matches — so they
// are ranked lower, never removed. Records without the field count as research.
export const RANK_WEIGHT = { research: 1, adjunct: 0.7, visiting: 0.7, teaching: 0.7, emeritus: 0.5 }

function scoreProf(prof, interestTokens, resumeTokens) {
  const research = researchText(prof)
  const haystack = `${research} ${prof.name || ''} ${prof.department || ''}`

  let primary = countHits(interestTokens, haystack)
  for (const t of interestTokens) {
    if (research.toLowerCase().includes(t)) primary += 2
  }

  // Resume is a secondary *boost*, not an independent signal. Its raw hit sum
  // grows with resume length and can dwarf the interest score, so a geology
  // professor whose bio shares generic words ("materials", "energy") with the
  // resume would outrank real matches for "batteries". Cap it at the interest
  // score so stated interests always dominate — a professor with no interest
  // relevance gets no resume boost at all. Uncapped only when no interests
  // were given and the resume is the only signal.
  let secondary = countHits(resumeTokens, research) * 0.35
  if (interestTokens.length) secondary = Math.min(secondary, primary)
  return (primary + secondary) * (RANK_WEIGHT[prof.rank_type] ?? 1)
}

function fitLabel(score, maxScore) {
  if (!maxScore) return 'adjacent_fit'
  const r = score / maxScore
  if (r >= 0.6) return 'strong_fit'
  if (r >= 0.25) return 'exploratory_fit'
  return 'adjacent_fit'
}

function buildExplanation(prof, interests) {
  // Was a local 10-slug map, so every other department showed up in match
  // explanations as a raw slug ("works in psychological-brain-sciences").
  const dept = prof.department
    ? deptLabel(prof.department)
    : 'their department'

  const research = (prof.research_summary || '').slice(0, 130).replace(/\|.*$/, '').trim()
    || (prof.scholar_interests || []).slice(0, 3).join(', ')
    || (prof.ai_review || '').split(/(?<=[.!?])\s/)[0].slice(0, 130).replace(/[.!?]$/, '')
  const iSnip = (interests || '').slice(0, 80)
  if (!research) {
    return `Prof. ${prof.name} works in ${dept} — related to your stated interest in ${iSnip}.`
  }
  return `Prof. ${prof.name}'s work in ${dept} focuses on ${research}… — closely related to your stated interest in ${iSnip}.`
}

export function matchFaculty(faculty, interests, resumeProfile, topN = 20) {
  const iTokens = tokenize(interests)
  const rTokens = tokenize([
    ...(resumeProfile?.inferred_themes   || []),
    ...(resumeProfile?.technical_skills  || []),
    ...(resumeProfile?.coursework        || []),
    ...(resumeProfile?.lab_techniques    || []),
  ].join(' '))

  // Never match against profiles with no research info — they can't be a fit.
  const matchable = faculty.filter(isMatchable)
  let scored = matchable.map(prof => ({ prof, score: scoreProf(prof, iTokens, rTokens) }))
  // No fallback to "everyone at score 1": that returned the first 20 faculty
  // in file order (a wall of one department) all labelled Strong Fit whenever
  // the query had zero hits. An empty list lets the page show "No matches".
  scored = scored.filter(x => x.score > 0)

  scored.sort((a, b) => b.score - a.score)
  scored = scored.slice(0, topN)
  const maxScore = scored[0]?.score || 1

  return scored.map(({ prof, score }, i) => ({
    professor:   prof,
    score:       Math.round(score * 1000) / 1000,
    fit_label:   fitLabel(score, maxScore),
    explanation: buildExplanation(prof, interests),
    rank:        i + 1,
  }))
}
