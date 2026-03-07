// Vercel serverless function — AI-powered email draft generation

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
}

// ---------------------------------------------------------------------------
// Template drafts (mock mode)
// ---------------------------------------------------------------------------
function templateDraft(prof, resumeProfile, interests, tone) {
  const name    = resumeProfile?.name    || 'Student'
  const major   = resumeProfile?.major   || 'Engineering'
  const year    = resumeProfile?.year    ? `${resumeProfile.year} ` : ''
  const skills  = (resumeProfile?.technical_skills || []).slice(0, 3).join(', ') || 'engineering tools'
  const snippet = (prof.research_summary || '').slice(0, 160).replace(/\|.*$/, '').trim()
  const iSnip   = (interests || '').slice(0, 120)
  const profName = prof.name || 'Professor'
  const subject  = `Research Opportunity Inquiry — ${name}`

  const bodies = {
    concise: `Dear Prof. ${profName},\n\nI am ${name}, a ${year}${major} student at Texas A&M. Your research on ${snippet}… resonates with my interest in ${iSnip}.\n\nI would love to learn about opportunities to contribute to your lab. I have experience with ${skills} and have attached my resume.\n\nWould you be open to a brief meeting?\n\nBest regards,\n${name}\nTexas A&M University`,

    warm: `Dear Prof. ${profName},\n\nHope this message finds you well! My name is ${name} and I'm a ${year}${major} student at Texas A&M. I came across your research on ${snippet}… and found it genuinely exciting — it connects closely with my interest in ${iSnip}.\n\nI'd love to learn more about your work and whether there's any way I could contribute. I have some background in ${skills} and have attached my resume.\n\nThanks so much for taking the time to read this!\n\nWarm regards,\n${name}\nTexas A&M University`,

    professional: `Dear Prof. ${profName},\n\nMy name is ${name}, and I am a ${year}${major} student at Texas A&M University. I have been exploring research opportunities in ${iSnip} and was particularly drawn to your work on ${snippet}…\n\nI am writing to inquire whether there are any openings in your research group. My background includes experience with ${skills}, and I am committed to contributing meaningfully to ongoing projects. I have attached my resume for your consideration.\n\nI would welcome the opportunity to discuss your current research at your convenience.\n\nSincerely,\n${name}\nTexas A&M University`,
  }

  return { subject, body: bodies[tone] || bodies.professional, tone }
}

// ---------------------------------------------------------------------------
// LLM draft
// ---------------------------------------------------------------------------
const TONES = {
  professional: 'Formal and professional, appropriate for a faculty email.',
  warm: 'Warm and conversational while remaining respectful.',
  concise: 'Very concise — under 200 words. Get to the point quickly.',
}

const SYSTEM = `You are helping a university student write a professional cold-outreach email to a professor about research opportunities.
Rules: sound like a real student (not a template), be concise (3-4 short paragraphs), reference specific research topics, mention relevant background naturally, ask about opportunities rather than presuming acceptance, avoid clichés like "deeply passionate".
Format exactly as:
Subject: [subject line]

[email body starting with "Dear Prof. [name],"]`

async function llmDraft(prof, resumeProfile, interests, tone, apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const skills  = (resumeProfile?.technical_skills || []).slice(0, 5).join(', ') || 'various tools'
  const themes  = (resumeProfile?.inferred_themes  || []).slice(0, 4).join(', ') || interests

  const prompt = `Professor: Prof. ${prof.name}\nTitle: ${prof.title || ''}\nDepartment: ${prof.department || ''}\nResearch: ${(prof.research_summary || '').slice(0, 400)}\n\nStudent: ${resumeProfile?.name || 'Student'}, ${resumeProfile?.year || ''} ${resumeProfile?.major || 'Engineering student'}\nInterests: ${interests}\nThemes from resume: ${themes}\nSkills: ${skills}\n\nTone: ${TONES[tone] || TONES.professional}\n\nWrite the email now.`

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = msg.content[0].text.trim()
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
  return { subject, body: bodyLines.join('\n').trim(), tone }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { prof, parsed_profile, interests = '', tone = 'professional' } = req.body
  if (!prof) return res.status(400).json({ error: 'Professor data required.' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  let draft
  try {
    draft = apiKey
      ? await llmDraft(prof, parsed_profile, interests, tone, apiKey)
      : templateDraft(prof, parsed_profile, interests, tone)
  } catch {
    draft = templateDraft(prof, parsed_profile, interests, tone)
  }

  res.json({ ...draft, mock_mode: !apiKey })
}
