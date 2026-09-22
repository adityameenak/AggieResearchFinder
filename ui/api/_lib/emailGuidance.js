/**
 * The one place that defines what a good outreach email looks like.
 *
 * Imported by BOTH /api/email.js (which prompts a model with it) and the MCP
 * server's `draft_email_brief` tool (which hands it to the caller's own model).
 * Keeping it here is what stops those two paths drifting apart — the lesson of
 * backend/services/matcher.py, which is a copy of the UI's scorer that silently
 * diverged.
 *
 * The AVOID list is not generic advice: every entry is a phrase the previous
 * version of this prompt and its template fallback actually produced. That is
 * why professors could tell these emails came from a tool.
 */

export const MUST = [
  'Sound like one specific student writing to one specific professor.',
  "Name something concrete from this professor's work — an idea, a method, a question — not their field.",
  'Ask about opportunities; never presume acceptance.',
  "State once, naturally, that the resume is attached.",
]

export const AVOID = [
  'I hope this email finds you well',
  'I hope you are doing well',
  'I am reaching out',
  'I came across your work',
  'I came across your research',
  'resonates with',
  'deeply passionate',
  'aligns with my interests',
  'align with my research interests',
  'I would be honored',
  'at your convenience',
  'Research Opportunity Inquiry',
]

export const AVOID_NOTE = `Never use these phrases or close variants of them: ${AVOID.map(p => `"${p}"`).join(', ')}. \
Do not list several of the professor's research areas in one sentence — pick one thing and say something real about it. \
Do not open with a weather-report pleasantry, and do not close by offering a meeting "at your convenience".`

export const STRUCTURE_NOTE = `Do not follow a fixed paragraph template. Vary sentence length. \
It is fine to open mid-thought, to ask a question, or to lead with the student's own work rather than an introduction.`

/**
 * Structural menus. The caller picks one of each deterministically from the
 * professor's id, so a student regenerating for the same professor gets a
 * stable shape while *different* professors get different ones — the
 * repetition worth fixing is across professors, not across retries.
 */
/**
 * `needsSpecifics` marks a shape that only works when we actually know
 * something concrete about the professor. Without this flag the sparse tier
 * produced a self-contradictory prompt: "do not claim familiarity with
 * specific research" alongside "open on the specific paper that prompted the
 * email". pickShapes() filters on it.
 */
export const OPENING_SHAPES = [
  { needsSpecifics: true,  text: 'Open on the specific paper or idea of the professor\'s that prompted the email — no self-introduction first; introduce the student in the second paragraph.' },
  { needsSpecifics: false, text: 'Open with what the student has been building or studying themselves, then connect it to why they are writing to this professor.' },
  { needsSpecifics: false, text: 'Open with a genuine question about the professor\'s research, then say who is asking.' },
  { needsSpecifics: true,  text: 'Open with one plain sentence of who the student is, then go straight to the specific work — no preamble.' },
  { needsSpecifics: true,  text: 'Open with the course, paper, or experience that created the interest, concretely named.' },
]

export const CLOSING_SHAPES = [
  { needsSpecifics: false, text: 'Close by asking whether the lab is taking undergraduate researchers this term.' },
  { needsSpecifics: true,  text: 'Close with one substantive question about the research direction.' },
  { needsSpecifics: false, text: 'Close by asking whether someone else in the group would be the better person to talk to.' },
  { needsSpecifics: false, text: 'Close by asking which paper to read first to get up to speed.' },
]

/** Word budgets. `length` replaces the old overload where a "concise" tone also meant short. */
export const LENGTH_BANDS = {
  short:    { label: 'Short',    words: '120–160 words' },
  standard: { label: 'Standard', words: '180–250 words' },
  detailed: { label: 'Detailed', words: '260–340 words' },
}

/** Stable small hash of a string → non-negative int. */
export function hashString(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h | 0)
}

/**
 * Deterministic per-professor structure pick.
 * @param {string} profId
 * @param {string} salt      usually the tone, so a tone switch reshapes too
 * @param {boolean} haveSpecifics  false for the sparse tier — restricts the menu
 *                                 to shapes that presume no knowledge of the work
 */
export function pickShapes(profId, salt = '', haveSpecifics = true) {
  const opens = haveSpecifics ? OPENING_SHAPES : OPENING_SHAPES.filter(s => !s.needsSpecifics)
  const closes = haveSpecifics ? CLOSING_SHAPES : CLOSING_SHAPES.filter(s => !s.needsSpecifics)
  const h = hashString(`${profId || 'x'}|${salt}`)
  return {
    opening: opens[h % opens.length].text,
    closing: closes[Math.floor(h / opens.length) % closes.length].text,
  }
}

/**
 * Which grounding tier a professor falls into. Stated explicitly in the prompt
 * rather than left implicit, because tier 3 is where the old prompt invented
 * enthusiasm about nothing — itself a tell.
 */
export function groundingTier({ papers = 0, summary = '' }) {
  if (papers > 0) return 'papers'
  if ((summary || '').trim()) return 'summary'
  return 'sparse'
}

export const TIER_NOTES = {
  papers: 'Cite at most ONE paper, by title, and only if it genuinely connects to the student\'s stated interests. Never list two.',
  summary: 'No publication list is available. Ground the email in one specific idea from the research focus above — name the idea, not the field.',
  sparse: 'Very little is known about this professor\'s work beyond their department. Write a short, honest inquiry that does NOT claim familiarity with specific research, and ask what the group is currently working on.',
}
