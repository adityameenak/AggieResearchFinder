/**
 * Client-side faculty matching — mirrors the Python backend's scorer.
 * Interest-driven: stated interests are the primary signal.
 * Resume provides a secondary boost (0.35 weight).
 */
import { tokenize } from './search'

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

function scoreProf(prof, interestTokens, resumeTokens) {
  const research = prof.research_summary || ''
  const haystack = `${research} ${prof.name || ''} ${prof.department || ''}`

  let primary = countHits(interestTokens, haystack)
  for (const t of interestTokens) {
    if (research.toLowerCase().includes(t)) primary += 2
  }

  const secondary = countHits(resumeTokens, research) * 0.35
  return primary + secondary
}

function fitLabel(score, maxScore) {
  if (!maxScore) return 'adjacent_fit'
  const r = score / maxScore
  if (r >= 0.6) return 'strong_fit'
  if (r >= 0.25) return 'exploratory_fit'
  return 'adjacent_fit'
}

function buildExplanation(prof, interests) {
  const dept = {
    chemical:'Chemical Engineering', mechanical:'Mechanical Engineering',
    cse:'Computer Science', electrical:'Electrical Engineering',
    materials:'Materials Science', civil:'Civil Engineering',
    nuclear:'Nuclear Engineering', industrial:'Industrial Engineering',
    ocean:'Ocean Engineering', petroleum:'Petroleum Engineering',
  }[prof.department] || prof.department || 'their department'

  const research = (prof.research_summary || '').slice(0, 130).replace(/\|.*$/, '').trim()
  const iSnip = (interests || '').slice(0, 80)
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

  let scored = faculty.map(prof => ({ prof, score: scoreProf(prof, iTokens, rTokens) }))
  scored = scored.filter(x => x.score > 0)
  if (!scored.length) scored = faculty.map(prof => ({ prof, score: 1 }))

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
