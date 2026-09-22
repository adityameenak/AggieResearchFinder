/**
 * MCP server — lets a chatbot search this dataset directly.
 *
 * Connect it in Claude Desktop / claude.ai:
 *   Settings → Connectors → Add custom connector →
 *   https://stemresearchfinder.tech/api/mcp
 *
 * Public and read-only. No auth, because every byte it serves is already public
 * JSON on this site. See api/_lib/ratelimit.js for what the rate limiting is and
 * is not.
 *
 * Why a real MCP library rather than hand-rolled JSON-RPC (this repo otherwise
 * avoids new dependencies — see api/feedback.js, which uses raw fetch): remote
 * MCP is not one wire shape. Clients are split across streamable HTTP and the
 * older HTTP+SSE transport, with session-id and protocol-version negotiation
 * either way. A hand-rolled handler passes a curl test and then fails inside
 * half the connector UIs, which is the one failure the user cannot debug. Since
 * "paste one URL into your chatbot" IS this feature, client compatibility is
 * the requirement. @modelcontextprotocol/server serves both legs and is
 * framework-agnostic (its stateless mode needs no Redis and no Next.js).
 */
import { createMcpHandler } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

import { TOOLS } from './_lib/tools.js'
import { originFrom, SCHOOL_CODES } from './_lib/data.js'
import { check as rateCheck } from './_lib/ratelimit.js'
import { TOTAL_FACULTY } from '../src/lib/seo.js'

// An all-schools cold search is six sequential fetches; the 10s default is too
// tight. Memory stays at the 1024 MB default *because* the search is
// sequential per school (see acrossSchools in _lib/tools.js) — the two
// decisions are linked, so don't make one without the other.
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

const schoolArg = z.enum(SCHOOL_CODES)

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------
const SCHOOL_HINT = `University code. Call list_schools for valid codes (${SCHOOL_CODES.join(', ')}). Omit to cover all six.`

function register(server, ctx) {
  const wrap = name => async args => {
    const { data, text } = await TOOLS[name](args || {}, ctx)
    // Both shapes, always: several clients render only the text block and
    // ignore structuredContent.
    return { content: [{ type: 'text', text }], structuredContent: data }
  }

  server.registerTool('list_schools', {
    title: 'List universities',
    description: 'List the universities covered, with faculty counts. Start here to get the school codes the other tools take.',
    inputSchema: z.object({}),
  }, wrap('list_schools'))

  server.registerTool('list_departments', {
    title: 'List departments',
    description: 'List departments with a faculty count each. Use it to get a valid `department` slug for search_faculty.',
    inputSchema: z.object({
      school: schoolArg.optional().describe(SCHOOL_HINT),
    }),
  }, wrap('list_departments'))

  server.registerTool('list_topics', {
    title: 'List research topics',
    description: "List the most common research topics at a school, as query strings. Use this when you don't yet know what terms this dataset uses — guessing a query and getting no hits is the usual failure.",
    inputSchema: z.object({
      school: schoolArg.optional().describe('University code. Defaults to tamu.'),
      limit: z.number().int().min(1).max(50).optional().describe('How many topics (default 20).'),
    }),
  }, wrap('list_topics'))

  server.registerTool('search_faculty', {
    title: 'Search faculty by keyword',
    description: 'Keyword search over faculty research. Use this when you have specific terms to look for; use match_faculty instead when you have a description of what a student is interested in.',
    inputSchema: z.object({
      query: z.string().min(2).describe('Research keywords, e.g. "protein folding" or "battery materials".'),
      school: schoolArg.optional().describe(SCHOOL_HINT),
      department: z.string().optional().describe('Department slug from list_departments.'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10, cap 50).'),
      has_research_only: z.boolean().optional().describe('Only professors with research text on record.'),
      active_labs_only: z.boolean().optional().describe('Only professors with a lab website or Google Scholar profile — a proxy for an active, funded group.'),
    }),
  }, wrap('search_faculty'))

  server.registerTool('match_faculty', {
    title: 'Match faculty to research interests',
    description: "Rank faculty by research fit against a description of what someone wants to work on, with a fit label and an explanation for each. Use this rather than search_faculty when you have the student's interests in prose. Professors with no research text on record are excluded, since there is no basis for a fit.",
    inputSchema: z.object({
      interests: z.string().min(3).describe("What the student wants to research, in their own words."),
      school: schoolArg.optional().describe(SCHOOL_HINT),
      limit: z.number().int().min(1).max(50).optional().describe('Max matches (default 10, cap 50).'),
    }),
  }, wrap('match_faculty'))

  server.registerTool('get_professor', {
    title: 'Get one professor',
    description: 'Full record for one professor, including their most-cited publications when known. Pass the `id` from a search or match result; `name` also works.',
    inputSchema: z.object({
      id: z.string().optional().describe('Faculty id from a search/match result.'),
      name: z.string().optional().describe('Full name, if you have no id.'),
      school: schoolArg.optional().describe(SCHOOL_HINT),
    }),
  }, wrap('get_professor'))

  server.registerTool('draft_email_brief', {
    title: 'Get material for an outreach email',
    description: "Everything needed to write a cold-outreach email to one professor: their specific research focus, topics, recent paper titles, the recipient address, and house rules on what makes such an email land. It returns MATERIAL, not a finished email — you write the prose, because you have the student's own voice and this endpoint does not.",
    inputSchema: z.object({
      id: z.string().optional().describe('Faculty id from a search/match result.'),
      name: z.string().optional().describe('Full name, if you have no id.'),
      school: schoolArg.optional().describe(SCHOOL_HINT),
      student: z.object({
        name: z.string().optional(),
        year: z.string().optional(),
        major: z.string().optional(),
        interests: z.string().optional(),
        skills: z.array(z.string()).optional(),
      }).optional().describe('What you know about the student, echoed back into the guidance.'),
    }),
  }, wrap('draft_email_brief'))
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  // Without this a browser-based client cannot read the session id and the
  // handshake fails with no useful error. Classic remote-MCP footgun.
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
}

// One handler per origin, cached across warm invocations. Keyed by origin
// because the tools fetch our own static faculty files, and that base URL
// differs between localhost, a preview deploy and production.
const handlers = new Map()
function getHandler(origin) {
  if (!handlers.has(origin)) {
    handlers.set(origin, createMcpHandler(
      () => buildServer(origin),
      { serverInfo: { name: 'stem-research-finder', version: '1.0.0' } },
    ))
  }
  return handlers.get(origin)
}

async function buildServer(origin) {
  const { McpServer } = await import('@modelcontextprotocol/server')
  const server = new McpServer(
    { name: 'stem-research-finder', version: '1.0.0' },
    {
      instructions: [
        `Search ${TOTAL_FACULTY.toLocaleString('en-US')} STEM research faculty across six universities (Texas A&M, Rice, UT Austin, UT Dallas, MIT, Harvard)`,
        'to help a student find a research group and reach out to it.',
        '',
        'Typical flow: list_schools → list_topics or list_departments to learn the vocabulary →',
        'match_faculty (from the student\'s interests) or search_faculty (from keywords) →',
        'get_professor for detail → draft_email_brief to write an outreach email.',
        '',
        'The ranking is the same one the stemresearchfinder.tech website uses.',
      ].join(' '),
    },
  )
  register(server, { origin })
  return server
}

/**
 * Vercel Node functions get (req, res). The MCP handler is web-standard
 * (Request → Response), so translate at the boundary.
 */
export default async function nodeHandler(req, res) {
  const applyCors = () => { for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v) }
  applyCors()
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(204).end()

  const limited = rateCheck(req)
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfter))
    return res.status(429).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: `Rate limit exceeded (per ${limited.window}). Retry in ${limited.retryAfter}s.`,
      },
      id: null,
    })
  }

  const origin = originFrom(req)
  const url = `${origin}${req.url || '/api/mcp'}`

  // Vercel may have parsed the body already; re-serialize so the web Request
  // gets a stream, and hand the parsed copy over too.
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
  const rawBody = hasBody && req.body !== undefined
    ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
    : undefined

  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (Array.isArray(v)) v.forEach(one => headers.append(k, one))
    else if (v !== undefined) headers.set(k, String(v))
  }
  // The re-serialized body may differ in length from the original.
  headers.delete('content-length')

  const request = new Request(url, {
    method: req.method,
    headers,
    body: rawBody,
  })

  let response
  try {
    // parsedBody avoids a second parse of what Vercel already decoded.
    response = await getHandler(origin)
      .fetch(request, { parsedBody: hasBody ? req.body : undefined })
  } catch (err) {
    console.error('[mcp] request failed:', err)
    return res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal error' },
      id: null,
    })
  }

  res.status(response.status)
  applyCors()
  res.setHeader('Cache-Control', 'no-store')
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-encoding') return
    res.setHeader(key, value)
  })

  if (!response.body) return res.end()

  // Stream rather than buffer. Buffering via arrayBuffer() would hang forever
  // on an SSE response, which the modern streamable-HTTP leg can return.
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
      // Push each SSE event out immediately instead of waiting on Node's buffer.
      if (typeof res.flush === 'function') res.flush()
    }
  } catch (err) {
    console.error('[mcp] stream aborted:', err)
  } finally {
    res.end()
  }
}
