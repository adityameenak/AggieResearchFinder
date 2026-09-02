// Vercel serverless function — files user feedback as a GitHub issue

export const config = {
  api: { bodyParser: { sizeLimit: '16kb' } },
}

const REPO = 'adityameenak/AggieResearchFinder'

const CATEGORIES = {
  missing:  'Missing faculty or department',
  wrong:    'Incorrect data',
  feature:  'Feature request',
  other:    'Other',
}

const MAX_MESSAGE = 4000
const MIN_MESSAGE = 10

// ---------------------------------------------------------------------------
// Issue formatting
// ---------------------------------------------------------------------------
function buildIssue({ message, category, email, school, path, userAgent }) {
  const label = CATEGORIES[category] || CATEGORIES.other

  // Title is the first line, trimmed to something readable in a list view.
  const firstLine = message.split('\n')[0].trim()
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine

  const body = [
    message.trim(),
    '',
    '---',
    `**Category:** ${label}`,
    school ? `**School:** \`${school}\`` : null,
    path ? `**Page:** \`${path}\`` : null,
    email ? `**Reply to:** ${email}` : null,
    `**Submitted:** ${new Date().toISOString()}`,
    userAgent ? `**User agent:** \`${userAgent.slice(0, 200)}\`` : null,
    '',
    '_Filed automatically from the in-app feedback form._',
  ].filter(Boolean).join('\n')

  return { title: `[feedback] ${title}`, body, labels: ['feedback'] }
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------
async function fileIssue(issue, token) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      Accept:         'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent':   'stemresearchfinder-feedback',
    },
    body: JSON.stringify(issue),
  })
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  const data = await res.json()
  return data.html_url
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { message = '', category = 'other', email = '', school = '',
          path = '', website = '' } = req.body

  // Honeypot: a real person never fills a field they cannot see. Answer 200 so
  // a bot learns nothing from the response.
  if (website) return res.json({ ok: true })

  const text = String(message).trim()
  if (text.length < MIN_MESSAGE) {
    return res.status(400).json({ error: 'Please write a little more so we can act on it.' })
  }
  if (text.length > MAX_MESSAGE) {
    return res.status(400).json({ error: 'That message is too long — please trim it a little.' })
  }

  const issue = buildIssue({
    message: text,
    category,
    email: String(email).trim().slice(0, 200),
    school: String(school).trim().slice(0, 32),
    path: String(path).trim().slice(0, 200),
    userAgent: req.headers['user-agent'] || '',
  })

  // Same degradation contract as /api/email and /api/parse: when the
  // credential is missing the feature still "works" from the user's side. The
  // payload goes to the function log so nothing is lost.
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    console.log('[feedback] no GITHUB_TOKEN set — logging instead:', issue)
    return res.json({ ok: true, mock_mode: true })
  }

  try {
    const url = await fileIssue(issue, token)
    res.json({ ok: true, url, mock_mode: false })
  } catch (e) {
    // Never lose the message just because GitHub is unhappy.
    console.error('[feedback] GitHub call failed:', e.message, issue)
    res.status(502).json({ error: 'Could not send feedback right now. Please try again shortly.' })
  }
}
