// Vercel serverless function — research-paper explainer.
//
// A student uploads a paper (PDF/DOCX) or pastes its text; this returns a
// plain-language version of it — summary, findings, methods, a jargon glossary —
// optionally written in another language, plus `research_topics`: English
// search phrases the UI feeds into matchFaculty() so the paper becomes a way
// into the match flow, not a dead end.
//
// Same degradation contract as api/parse.js and api/email.js: with no
// ANTHROPIC_API_KEY (or when the call fails or is declined) it falls back to a
// heuristic explanation pulled from the paper's own abstract and keywords, so
// the page always works. `mock_mode` stays literally `!apiKey`;
// `template_fallback` is the separate "key present, call failed" signal.
import { extractText } from './_lib/extract.js'
import { makeLimiter } from './_lib/ratelimit.js'

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
  // A full paper in, a structured explanation out: well past the 10s default.
  maxDuration: 60,
}

// Unlike /api/mcp this endpoint spends Anthropic tokens on every call, so its
// per-IP budget is far tighter. Still only a politeness guard — see
// _lib/ratelimit.js — the real lever is a Vercel Firewall rule.
const limit = makeLimiter([
  { name: 'minute', ms: 60_000, max: 4 },
  { name: 'hour', ms: 3_600_000, max: 20 },
])

// Claude Opus 5.5 at low effort: explaining dense, cross-disciplinary papers
// accurately is where model quality shows. Opus 5.5 rejects `temperature` and
// cannot disable thinking — effort is the only dial (its default is `medium`).
const MODEL = 'claude-opus-5-5'
const EFFORT = 'low'

// ~30k tokens. Longer than nearly any paper body once references are cut;
// beyond it the UI is told the explanation covers only the first part.
const MAX_CHARS = 120_000
const MIN_PASTE_CHARS = 300

export const LEVELS = {
  intro: 'a first- or second-year undergraduate who has taken only introductory science and math courses',
  advanced: 'an upper-level undergraduate in a related major who knows the basics of the field but not its research literature',
  grad: 'a new graduate student from a neighbouring field',
}

// Allowlisted so the value can't smuggle instructions into the prompt.
export const LANGUAGES = [
  'English', 'Spanish', 'Chinese (Simplified)', 'Hindi', 'Arabic', 'Vietnamese',
  'Korean', 'Portuguese', 'French', 'Urdu', 'Bengali', 'Japanese',
]

// ---------------------------------------------------------------------------
// Input preparation
// ---------------------------------------------------------------------------
/**
 * Normalize extracted text and drop the reference list, which is a third of a
 * typical paper's length and none of its meaning.
 */
export function prepareText(raw) {
  let text = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/-\n(?=[a-z])/g, '')        // re-join words hyphenated across lines
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Last heading-like "References"/"Bibliography" line in the back half.
  const refRe = /\n\s*(references|bibliography|works cited|literature cited)\s*\n/gi
  let cut = -1, m
  while ((m = refRe.exec(text))) if (m.index > text.length * 0.5) cut = m.index
  if (cut > 0) text = text.slice(0, cut).trim()

  const truncated = text.length > MAX_CHARS
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated }
}

// ---------------------------------------------------------------------------
// Heuristic explanation — no LLM required
// ---------------------------------------------------------------------------
const STOP = new Set(('a an the and or of in on for to with by from as at is are was were be been this that ' +
  'these those we our us it its into than then which using use used based via between such can may also ' +
  'study paper results result show shows shown here new two one however both each more most other within ' +
  'over under their they has have had not but all any how what when where while during after before').split(' '))

function sentences(text) {
  return (text.match(/[^.!?]+[.!?]+(\s|$)/g) || []).map(s => s.replace(/\s+/g, ' ').trim())
}

function section(text, startRe, endRe) {
  const start = text.search(startRe)
  if (start < 0) return ''
  const rest = text.slice(start).replace(startRe, '')
  const end = rest.search(endRe)
  return (end > 0 ? rest.slice(0, end) : rest.slice(0, 2500)).replace(/\s+/g, ' ').trim()
}

function topPhrases(text, n) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
  const counts = new Map()
  for (let i = 0; i < words.length - 1; i++) {
    const [a, b] = [words[i], words[i + 1]]
    if (a.length < 3 || b.length < 3 || STOP.has(a) || STOP.has(b) || /\d/.test(a + b)) continue
    const k = `${a} ${b}`
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  return [...counts.entries()].filter(([, c]) => c > 1)
    .sort((x, y) => y[1] - x[1]).slice(0, n).map(([k]) => k)
}

export function heuristicExplain(text) {
  // The title sits above the abstract. Text pasted from the abstract down has
  // none, and an empty title beats promoting the keyword line to one.
  const absAt = text.search(/\babstract\b/i)
  const head = absAt >= 0 ? text.slice(0, absAt) : text.slice(0, 600)
  const title = head.split('\n').map(l => l.trim()).find(l =>
    l.length > 15 && l.length < 220 &&
    !/^(arxiv|doi|http|keywords?|key words|index terms|\d)/i.test(l)) || ''

  const abstract = section(text, /\babstract\b[:.\s—-]*/i, /\n\s*(\d\.?\s*)?(introduction|keywords|index terms|1\s)/i)
  const lead = abstract || sentences(text.slice(0, 4000)).slice(0, 6).join(' ')
  const sents = sentences(lead)

  const kwLine = section(text, /\b(keywords|key words|index terms)\b[:.\s—-]*/i, /\n/)
  const keywords = kwLine
    ? kwLine.split(/[;,·•]/).map(k => k.trim().toLowerCase()).filter(k => k.length > 2 && k.length < 60)
    : []
  const topics = [...new Set([...keywords, ...topPhrases(abstract || text.slice(0, 20000), 8)])].slice(0, 8)

  const conclusion = section(text, /\n\s*(\d\.?\s*)?(conclusions?|summary and conclusions?|discussion)\s*\n/i, /\n\s*(\d\.?\s*)?[A-Z][a-z]+( [A-Za-z]+){0,3}\s*\n/)

  return {
    title,
    one_sentence: sents[0] || '',
    plain_summary: lead.slice(0, 1800),
    key_findings: sentences(conclusion).slice(0, 4),
    methods_plain: '',
    why_it_matters: '',
    glossary: [],
    research_topics: topics,
    fields: [],
    skills_to_learn: [],
    questions_to_ask: [],
  }
}

// ---------------------------------------------------------------------------
// LLM explanation
// ---------------------------------------------------------------------------
const str = { type: 'string' }
const strList = { type: 'array', items: { type: 'string' } }

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'one_sentence', 'plain_summary', 'key_findings', 'methods_plain',
    'why_it_matters', 'glossary', 'research_topics', 'fields', 'skills_to_learn', 'questions_to_ask'],
  properties: {
    title: str,
    one_sentence: str,
    plain_summary: str,
    key_findings: strList,
    methods_plain: str,
    why_it_matters: str,
    glossary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'definition'],
        properties: { term: str, definition: str },
      },
    },
    research_topics: strList,
    fields: strList,
    skills_to_learn: strList,
    questions_to_ask: strList,
  },
}

export const SYSTEM = `You explain academic research papers to university students who want to join a research lab but find papers hard to read — because of jargon, dense notation, or because English is not their first language.

Explain what the paper actually says. Never add claims, numbers or conclusions the paper does not contain; if the text is incomplete or garbled (it was extracted from a PDF), work with what is there and do not guess at what is missing. Keep the authors' hedges: "suggests" must not become "proves".

Fields:
- title: the paper's title, translated if a non-English output language is requested.
- one_sentence: what the paper found, in one sentence a student could repeat to a friend.
- plain_summary: 2–4 short paragraphs (separate with a blank line). The problem, what the authors did, what they found. Define a term the first time you use it, or avoid it.
- key_findings: 3–5 concrete results, each one sentence, keeping the paper's real numbers where they matter.
- methods_plain: how they did it, as you would describe it to someone who has never been in a lab. 1–2 paragraphs.
- why_it_matters: who benefits and what this enables next. 2–4 sentences, no hype.
- glossary: 5–10 technical terms from the paper that the reader is likely to meet again, each with a one- or two-sentence definition.
- research_topics: 4–8 short search phrases (1–4 words each) naming the research areas this paper belongs to, in the vocabulary a professor would use on their faculty page — e.g. "lithium-ion batteries", "solid electrolytes", "density functional theory". ALWAYS in English, whatever the output language, because they are matched against English faculty profiles.
- fields: 1–3 academic disciplines, e.g. "Materials Science", "Chemical Engineering".
- skills_to_learn: 3–6 concrete skills or techniques a student would need to contribute to work like this.
- questions_to_ask: 2–4 thoughtful questions a student could ask a professor working in this area — specific to this paper's open problems, not generic.

Write plainly. No marketing language, no "groundbreaking" or "revolutionary".`

export function buildPrompt(text, { level, language, truncated }) {
  return `Reader: ${LEVELS[level] || LEVELS.advanced}.
Output language: ${language}.${language !== 'English' ? ' Write every field in this language except research_topics, which stays in English. Keep standard technical terms recognizable — give the English term in parentheses after a translated one.' : ''}
${truncated ? '\nThe paper was too long to send in full; this is the first part of it. Say so in plain_summary if the findings are cut off.\n' : ''}
<paper>
${text}
</paper>`
}

async function llmExplain(text, opts, apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: {
      effort: EFFORT,
      format: { type: 'json_schema', schema: SCHEMA },
    },
    // A biology or chemistry paper can trip a safety classifier on what is
    // ordinary published science; "default" re-runs a decline on Anthropic's
    // recommended fallback model instead of failing the request.
    fallbacks: 'default',
    messages: [{ role: 'user', content: buildPrompt(text, opts) }],
  }, {
    headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' },
  })

  if (msg.stop_reason === 'refusal') {
    const err = new Error(`declined (${msg.stop_details?.category ?? 'no category'})`)
    err.declined = true
    throw err
  }
  if (msg.stop_reason === 'max_tokens') throw new Error('explanation hit max_tokens')

  const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
  return JSON.parse(raw)
}

/** Trim and bound everything the client will render, whatever produced it. */
function clean(e) {
  const s = (v, n) => String(v || '').trim().slice(0, n)
  const list = (v, n, len) => (Array.isArray(v) ? v : []).map(x => s(x, len)).filter(Boolean).slice(0, n)
  return {
    title: s(e.title, 300),
    one_sentence: s(e.one_sentence, 400),
    plain_summary: s(e.plain_summary, 4000),
    key_findings: list(e.key_findings, 6, 500),
    methods_plain: s(e.methods_plain, 2500),
    why_it_matters: s(e.why_it_matters, 1200),
    glossary: (Array.isArray(e.glossary) ? e.glossary : [])
      // Roomy: a translated term carries its English original in parentheses.
      .map(g => ({ term: s(g?.term, 160), definition: s(g?.definition, 400) }))
      .filter(g => g.term && g.definition).slice(0, 12),
    research_topics: list(e.research_topics, 8, 60),
    fields: list(e.fields, 3, 60),
    skills_to_learn: list(e.skills_to_learn, 6, 120),
    questions_to_ask: list(e.questions_to_ask, 4, 300),
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const limited = limit(req)
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({
      error: `You've explained a lot of papers in the last ${limited.window} — try again in ${limited.retryAfter}s.`,
    })
  }

  const { filename = '', data, text: pasted = '', level = 'advanced', language = 'English' } = req.body || {}
  const lang = LANGUAGES.includes(language) ? language : 'English'
  const lvl = LEVELS[level] ? level : 'advanced'

  let raw
  if (data) {
    try {
      raw = await extractText(filename, data)
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message })
    }
  } else if (String(pasted).trim().length >= MIN_PASTE_CHARS) {
    raw = String(pasted)
  } else {
    return res.status(400).json({
      error: `Upload a PDF or Word file, or paste at least ${MIN_PASTE_CHARS} characters of the paper.`,
    })
  }

  const { text, truncated } = prepareText(raw)
  const apiKey = process.env.ANTHROPIC_API_KEY

  let explanation, fellBack = false, declined = false
  try {
    explanation = apiKey
      ? await llmExplain(text, { level: lvl, language: lang, truncated }, apiKey)
      : heuristicExplain(text)
  } catch (err) {
    // Silent to the user by design (same contract as api/email.js), but logged.
    console.error('[paper] llmExplain failed, falling back to heuristic:', err)
    explanation = heuristicExplain(text)
    fellBack = true
    declined = Boolean(err.declined)
  }

  res.json({
    explanation: clean(explanation),
    level: lvl,
    // The heuristic can't translate; report the language actually delivered.
    language: apiKey && !fellBack ? lang : 'English',
    truncated,
    source_chars: text.length,
    mock_mode: !apiKey,
    template_fallback: fellBack,
    declined,
  })
}
