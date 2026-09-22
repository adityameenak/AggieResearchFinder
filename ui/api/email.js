// Vercel serverless function — AI-powered email draft generation.
//
// This is the LIVE email path (the deployed UI calls it; the FastAPI backend in
// ../../backend is local-only). If you change what makes a draft good, change it
// here and in api/_lib/emailGuidance.js, which the MCP server shares.
//
// Design note on why drafts used to read as form letters: the prompt received
// only name/title/department plus 400 truncated characters of the pipe-joined
// `research_summary`, and never saw `ai_review`, `scholar_interests`, or the
// publication list — the three richest per-professor signals this project
// collects. The fix is mostly about inputs, not phrasing.
import {
  MUST, AVOID_NOTE, STRUCTURE_NOTE, LENGTH_BANDS,
  pickShapes, groundingTier, TIER_NOTES, hashString,
} from './_lib/emailGuidance.js'
import { loadPubs, originFrom } from './_lib/data.js'
import { splitResearch, deptLabel } from '../src/utils/search.js'

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

// Haiku 4.5 is pinned deliberately: this is a high-volume, cost-sensitive path.
// NOTE: `temperature` below is load-bearing for draft variety, and it is REMOVED
// (HTTP 400) on the 5-series models — Fable 5/5.1, Opus 5/4.8/4.7, Sonnet 5.
// Bumping this model means dropping `temperature` and leaning entirely on the
// structural shape menu in _lib/emailGuidance.js.
const MODEL = 'claude-haiku-4-5'

// ---------------------------------------------------------------------------
// Grounding — the per-professor specifics the model writes from
// ---------------------------------------------------------------------------
export async function gatherGrounding(prof, origin) {
  const { summary, keywords } = splitResearch(prof)
  const pubs = await loadPubs(prof.id, origin, prof.pub_count)
  return {
    // Untruncated apart from a safety valve. The old 400-char cut usually
    // landed inside the boilerplate at the head of a run-on summary.
    summary: summary.slice(0, 1200),
    keywords: keywords.slice(0, 8),
    papers: pubs.slice(0, 3).map(p => ({ title: p.title, year: p.year })),
    has_review: Boolean((prof.ai_review || '').trim()),
    has_interests: Boolean((prof.scholar_interests || []).length),
  }
}

/** What the UI shows the student about how much the model had to work with. */
function groundingReport(g) {
  return {
    papers: g.papers.length,
    has_review: g.has_review,
    has_interests: g.has_interests,
    tier: groundingTier({ papers: g.papers.length, summary: g.summary }),
  }
}

// ---------------------------------------------------------------------------
// Template drafts — used with no API key, and when the API call fails
// ---------------------------------------------------------------------------
function firstSentence(text) {
  const t = (text || '').trim()
  if (!t) return ''
  const m = t.match(/^.{20,220}?[.!?](\s|$)/)
  return (m ? m[0] : t.slice(0, 200)).trim()
}

function templateDraft(prof, resumeProfile, interests, tone, schoolName = 'Texas A&M University', grounding) {
  const name   = resumeProfile?.name  || 'Student'
  const major  = resumeProfile?.major || 'Engineering'
  const year   = resumeProfile?.year ? `${resumeProfile.year} ` : ''
  const skills = (resumeProfile?.technical_skills || []).slice(0, 3).join(', ') || 'engineering tools'
  const iSnip  = (interests || '').slice(0, 120)
  const profName = prof.name || 'Professor'
  const school = schoolName

  const g = grounding || { summary: '', keywords: [], papers: [] }
  const topic = g.keywords[0] || (prof.department ? deptLabel(prof.department) : 'your research area')
  // A complete sentence, never the old mid-word slice + "…" — that trailing
  // ellipsis after half a word was the loudest tell in this file.
  const focus = firstSentence(g.summary) || `work in ${topic}`

  // The subject used to be one identical string for all 5,260 professors.
  const subject = `${topic} — research inquiry from a ${major} student`

  // Three intros, so the opening sentence is not shared by every draft the way
  // it was when this function had one body per tone.
  const intros = [
    `I am ${name}, a ${year}${major} student at ${school}.`,
    `My name is ${name} and I study ${major} at ${school}.`,
    `I'm ${name} — ${year}${major} at ${school}.`,
  ]
  const intro = intros[hashString(`${prof.id || profName}|intro`) % intros.length]
  const variants = {
    professional: [
      `Dear Prof. ${profName},\n\n${intro} I have been reading about ${topic} and wanted to ask about your group. ${focus}\n\nMy own background is in ${skills}, and I am interested in ${iSnip}. I have attached my resume.\n\nIs your group taking student researchers this term?\n\nSincerely,\n${name}\n${school}`,
      `Dear Prof. ${profName},\n\nI am writing about research in ${topic}. ${focus}\n\n${intro} I work with ${skills} and my interest is in ${iSnip}. My resume is attached.\n\nWould you have time to talk about whether I could contribute?\n\nSincerely,\n${name}\n${school}`,
      `Dear Prof. ${profName},\n\n${intro} Your group's work on ${topic} is the closest I have found to what I want to study — ${iSnip}.\n\n${focus}\n\nI have attached my resume; I have worked with ${skills}. Is there a paper of yours I should read first?\n\nSincerely,\n${name}\n${school}`,
    ],
    warm: [
      `Dear Prof. ${profName},\n\n${intro} I have spent a while now reading about ${topic}, and your group keeps coming up.\n\n${focus} I would like to understand it better — my own interest is in ${iSnip}, and I have worked with ${skills}. My resume is attached.\n\nIs there room for a student in the group this term?\n\nBest,\n${name}\n${school}`,
      `Dear Prof. ${profName},\n\nI wanted to ask about ${topic}. ${focus}\n\n${intro} ${iSnip} is what I keep returning to, and I have some background in ${skills}. I have attached my resume.\n\nWould someone in your group have time to talk?\n\nBest,\n${name}\n${school}`,
      `Dear Prof. ${profName},\n\n${intro} ${focus}\n\nThat is close to what I want to work on — ${iSnip}. I have used ${skills} and have attached my resume.\n\nWhich of your papers would you suggest starting with?\n\nBest,\n${name}\n${school}`,
    ],
    concise: [
      `Dear Prof. ${profName},\n\n${intro} I am interested in ${topic} and in ${iSnip}.\n\nI have worked with ${skills}; my resume is attached. Is your group taking students this term?\n\nBest regards,\n${name}\n${school}`,
      `Dear Prof. ${profName},\n\nI am asking about student research in ${topic}. ${intro}\n\nMy interest is ${iSnip} and I have used ${skills}. Resume attached. Is there space in your group?\n\nBest regards,\n${name}\n${school}`,
      `Dear Prof. ${profName},\n\n${intro} ${focus}\n\nI would like to contribute — I work with ${skills} and care about ${iSnip}. Resume attached. Who is the right person to ask?\n\nBest regards,\n${name}\n${school}`,
    ],
  }

  const set = variants[tone] || variants.professional
  const body = set[hashString(prof.id || profName) % set.length]
  return { subject, body, tone }
}

// ---------------------------------------------------------------------------
// LLM draft
// ---------------------------------------------------------------------------
const TONES = {
  professional: 'Plain and professional. No flourishes.',
  warm: 'Warm and direct, like writing to someone whose work you respect.',
  concise: 'Spare. Every sentence carries information.',
}

export const SYSTEM = `You help a university student write a cold-outreach email to a professor about research opportunities.

You are writing ONE email from ONE student to ONE professor. It must not read like it came from a tool.

${MUST.map(m => `- ${m}`).join('\n')}

${AVOID_NOTE}

${STRUCTURE_NOTE}

The subject line must name something specific about this professor's work or about the student's own project. Four to nine words. Never a generic phrase.

Return the subject line first, on its own line, prefixed "Subject: ". Then a blank line. Then the email body. Nothing else — no preamble, no commentary, no notes after the sign-off.`

/**
 * Build the user prompt. Pure and exported so scripts/email-variance.mjs can
 * inspect exactly what the model receives without spending a token.
 */
export function buildPrompt(prof, resumeProfile, interests, tone, length, schoolName, grounding) {
  const g = grounding
  const tier = groundingTier({ papers: g.papers.length, summary: g.summary })
  const shapes = pickShapes(prof.id, tone, tier !== 'sparse')
  const band = LENGTH_BANDS[length] || LENGTH_BANDS.standard

  const list = (arr, n) => (arr || []).slice(0, n).filter(Boolean).join(', ')
  const experiences = [
    ...(resumeProfile?.research_experiences || []).map(e => e?.title).filter(Boolean),
    ...(resumeProfile?.project_experiences || []).map(e => e?.title).filter(Boolean),
  ].slice(0, 3)

  const profBlock = [
    `Professor: Prof. ${prof.name}`,
    prof.title ? `Title: ${prof.title}` : '',
    prof.department ? `Department: ${deptLabel(prof.department)}` : '',
    g.summary ? `Research focus: ${g.summary}` : '',
    g.keywords.length ? `Specific topics: ${g.keywords.join(', ')}` : '',
    g.papers.length
      ? `Recent papers:\n${g.papers.map(p => `  - "${p.title}"${p.year ? ` (${p.year})` : ''}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n')

  const studentBlock = [
    `Student: ${resumeProfile?.name || 'Student'}, ${resumeProfile?.year || ''} ${resumeProfile?.major || 'student'} at ${schoolName}`.replace(/\s+/g, ' '),
    // The verbatim interest string is the single best voice signal available.
    interests ? `What the student says they are interested in (their own words, quote or echo this rather than translating it into academic register): "${interests}"` : '',
    list(resumeProfile?.inferred_themes, 4) ? `Themes from resume: ${list(resumeProfile.inferred_themes, 4)}` : '',
    list(resumeProfile?.technical_skills, 5) ? `Skills: ${list(resumeProfile.technical_skills, 5)}` : '',
    list(resumeProfile?.coursework, 4) ? `Coursework: ${list(resumeProfile.coursework, 4)}` : '',
    list(resumeProfile?.lab_techniques, 4) ? `Lab techniques: ${list(resumeProfile.lab_techniques, 4)}` : '',
    experiences.length ? `Past projects: ${experiences.join('; ')}` : '',
  ].filter(Boolean).join('\n')

  const prompt = `${profBlock}

${studentBlock}

Grounding: ${TIER_NOTES[tier]}

Structure for this email:
- ${shapes.opening}
- ${shapes.closing}

Tone: ${TONES[tone] || TONES.professional}
Length: ${band.words}

The student attends ${schoolName} — sign off with that university name. Their resume will be attached.

Write the email now.`

  return prompt
}

async function llmDraft(prof, resumeProfile, interests, tone, length, apiKey, schoolName, grounding) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const prompt = buildPrompt(prof, resumeProfile, interests, tone, length, schoolName, grounding)

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 900,
    temperature: 0.9,   // see the MODEL comment: 5-series models reject this
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = msg.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
  const lines = raw.split('\n')
  let subject = '', bodyLines = [], inBody = false
  for (const line of lines) {
    if (!inBody && line.toLowerCase().startsWith('subject:')) {
      subject = line.slice('subject:'.length).trim()
    } else if (subject && !inBody && line.trim() === '') {
      inBody = true
    } else if (inBody) {
      bodyLines.push(line)
    }
  }
  const body = bodyLines.join('\n').trim()
  // If the model ignored the delimiter contract there is no body to show; fall
  // back rather than handing the student an empty textarea.
  if (!body) throw new Error('draft did not match the Subject:/body contract')
  return { subject, body, tone }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { prof, parsed_profile, interests = '', tone = 'professional',
          length = 'standard', school_name = 'Texas A&M University' } = req.body
  if (!prof) return res.status(400).json({ error: 'Professor data required.' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  const origin = originFrom(req)

  let grounding
  try {
    grounding = await gatherGrounding(prof, origin)
  } catch (err) {
    console.error('[email] grounding lookup failed:', err)
    grounding = { summary: '', keywords: [], papers: [], has_review: false, has_interests: false }
  }

  let draft, fellBack = false
  try {
    draft = apiKey
      ? await llmDraft(prof, parsed_profile, interests, tone, length, apiKey, school_name, grounding)
      : templateDraft(prof, parsed_profile, interests, tone, school_name, grounding)
  } catch (err) {
    // Silent to the user by design (same contract as api/feedback.js), but the
    // stack trace belongs in the function log — it used to be swallowed by a
    // bare `catch {}`, so a broken API key looked exactly like mock mode.
    console.error('[email] llmDraft failed, falling back to template:', err)
    draft = templateDraft(prof, parsed_profile, interests, tone, school_name, grounding)
    fellBack = true
  }

  res.json({
    ...draft,
    length,
    mock_mode: !apiKey,
    template_fallback: fellBack,
    grounding: groundingReport(grounding),
  })
}
