// Vercel serverless function — resume text extraction + AI parsing
// Runs in Node.js (not the browser). Has access to pdf-parse, mammoth, anthropic.

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
}

// ---------------------------------------------------------------------------
// Mock parser — keyword heuristics, no LLM required
// ---------------------------------------------------------------------------
const TECH = ['python','matlab','r','java','c++','javascript','sql','julia',
  'tensorflow','pytorch','scikit-learn','pandas','numpy','ros','ansys','comsol',
  'autocad','solidworks','labview','opencv']
const TECHNIQUES = ['sem','tem','xrd','ftir','nmr','pcr','hplc','gc-ms',
  'electrochemistry','cell culture','microscopy','spectroscopy','raman','afm']
const THEMES = {
  'machine learning': ['neural','deep learning','machine learning','nlp','ai'],
  'robotics': ['robot','autonomous','drone','manipulation'],
  'energy storage': ['battery','fuel cell','supercapacitor','electrode'],
  'materials science': ['material','polymer','alloy','composite','nanomaterial'],
  'biomedical engineering': ['biomedical','tissue','implant','drug delivery'],
  'sustainability': ['sustainability','renewable','carbon','co2','climate'],
  'fluid dynamics': ['fluid','cfd','turbulence','aerodynamics'],
  'semiconductors': ['semiconductor','transistor','cmos','photovoltaic'],
  'computational methods': ['simulation','finite element','molecular dynamics'],
}

function mockParse(text) {
  const lower = text.toLowerCase()
  const skills = TECH.filter(s => lower.includes(s))
  const techniques = TECHNIQUES.filter(t => lower.includes(t))
  const themes = Object.entries(THEMES)
    .filter(([, kws]) => kws.some(k => lower.includes(k)))
    .map(([theme]) => theme)

  const firstLine = text.split('\n').find(l => l.trim())?.trim() ?? null
  const name = firstLine && firstLine.split(' ').length <= 4 ? firstLine : null

  let year = null
  for (const y of ['freshman','sophomore','junior','senior','graduate','phd','master']) {
    if (lower.includes(y)) { year = y.charAt(0).toUpperCase() + y.slice(1); break }
  }
  let major = null
  for (const m of ['chemical engineering','mechanical engineering','electrical engineering',
    'computer science','materials science','civil engineering','biomedical engineering']) {
    if (lower.includes(m)) { major = m.split(' ').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' '); break }
  }
  return { name, year, major, gpa: null, coursework: [], technical_skills: skills,
    software_tools: [], lab_techniques: techniques, research_experiences: [],
    project_experiences: [], inferred_themes: themes }
}

// ---------------------------------------------------------------------------
// LLM parser
// ---------------------------------------------------------------------------
const PARSE_SYSTEM = `You are a precise resume parser for an academic research-matching tool.
Extract structured information from the resume text and return ONLY valid JSON — no explanation outside the JSON.

Schema:
{
  "name": string|null, "year": string|null, "major": string|null, "gpa": string|null,
  "coursework": [string], "technical_skills": [string], "software_tools": [string],
  "lab_techniques": [string],
  "research_experiences": [{"title":string,"lab":string,"description":string}],
  "project_experiences": [{"title":string,"description":string}],
  "inferred_themes": [string]
}
"inferred_themes" = broad research areas inferred from the resume.`

async function llmParse(text, apiKey) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: PARSE_SYSTEM,
    messages: [{ role: 'user', content: `Resume text:\n\n${text.slice(0, 6000)}` }],
  })
  let raw = msg.content[0].text.trim()
  if (raw.startsWith('```')) raw = raw.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '').trim()
  return JSON.parse(raw)
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { filename = '', data, interests = '' } = req.body
  if (!data) return res.status(400).json({ error: 'No file data provided.' })

  const buffer = Buffer.from(data, 'base64')
  const ext = filename.split('.').pop().toLowerCase()

  let text = ''
  try {
    if (ext === 'pdf') {
      // pdf-parse is CommonJS; dynamic import wraps module.exports as default
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(buffer)
      text = result.text
    } else if (ext === 'docx' || ext === 'doc') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else {
      return res.status(422).json({ error: 'Only PDF and DOCX files are supported.' })
    }
  } catch (e) {
    return res.status(500).json({ error: `Text extraction failed: ${e.message}` })
  }

  if (!text.trim()) {
    return res.status(422).json({ error: 'No text could be extracted from the file.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  let parsed
  try {
    parsed = apiKey ? await llmParse(text, apiKey) : mockParse(text)
  } catch {
    parsed = mockParse(text)
  }

  res.json({ parsed_profile: parsed, interests, mock_mode: !apiKey })
}
