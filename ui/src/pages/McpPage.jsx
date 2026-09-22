/**
 * /mcp — how to connect this dataset to an AI assistant.
 *
 * Outside SchoolProvider (like Landing and StatePage), so it must not call
 * useSchool(). All SEO copy lives in src/lib/seo.js; this file is markup only.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import Seo from '../components/Seo'
import FeedbackModal from '../components/FeedbackModal'
import { TOTAL_FACULTY } from '../lib/seo'
import { SCHOOL_LIST } from '../schools'

const ENDPOINT = 'https://stemresearchfinder.tech/api/mcp'

const TOOLS = [
  ['list_schools', 'The universities covered, with faculty counts.'],
  ['list_departments', 'Departments at a school, with a count each.'],
  ['list_topics', 'The research topics this dataset actually uses — useful before searching.'],
  ['search_faculty', 'Keyword search over faculty research.'],
  ['match_faculty', 'Rank faculty by research fit against what you want to work on, with an explanation for each.'],
  ['get_professor', 'One professor in full, including their most-cited papers.'],
  ['draft_email_brief', 'The specifics needed to write a cold-outreach email to one professor.'],
]

const ASKS = [
  'Who at Rice works on anything close to protein design?',
  "I'm a sophomore into soft robotics — which MIT labs should I look at?",
  'Find me three Harvard professors doing machine learning for materials, then help me email the best fit.',
]

function Code({ children }) {
  return (
    <code className="font-mono text-[13px] bg-stone-100 text-stone-800 rounded px-1.5 py-0.5">
      {children}
    </code>
  )
}

export default function McpPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(ENDPOINT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (http, permissions) — the URL is on screen to copy.
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Seo />
      <div className="h-[3px] bg-gradient-to-r from-indigo-600 via-violet-500 to-purple-600" />

      <main className="flex-1 px-6 py-12">
        <div className="max-w-3xl mx-auto">

          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-stone-500
                                  hover:text-indigo-600 transition-colors mb-10 group">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd"
                d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd" />
            </svg>
            Back to universities
          </Link>

          <div className="mb-10">
            <div className="text-[11px] font-semibold text-indigo-600 uppercase tracking-[0.2em] mb-4">
              For AI assistants
            </div>
            <h1 className="font-display font-bold text-stone-900 text-4xl sm:text-5xl
                           leading-[1.06] tracking-tight mb-3">
              Search from your chatbot
            </h1>
            <p className="text-stone-600 text-[15px] leading-relaxed">
              Connect {TOTAL_FACULTY.toLocaleString()} research faculty across {SCHOOL_LIST.length} universities
              to Claude or any MCP-compatible assistant. You get the same ranking this site uses — without
              clicking through it.
            </p>
          </div>

          {/* Endpoint */}
          <section className="mb-10">
            <h2 className="font-display font-bold text-stone-900 text-xl mb-3">The endpoint</h2>
            <div className="flex items-center gap-2 flex-wrap bg-white border border-stone-200
                            rounded-xl px-4 py-3">
              <code className="font-mono text-[13px] text-stone-800 break-all flex-1">{ENDPOINT}</code>
              <button onClick={copyEndpoint}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700
                                 border border-indigo-200 rounded-lg px-3 py-1.5 transition-colors">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-sm text-stone-500 mt-3 leading-relaxed">
              In Claude, go to <strong>Settings → Connectors → Add custom connector</strong> and paste that
              URL. There is no key and no sign-up. It is read-only and rate-limited.
            </p>
          </section>

          {/* Asks */}
          <section className="mb-10">
            <h2 className="font-display font-bold text-stone-900 text-xl mb-3">Then just ask</h2>
            <ul className="space-y-2">
              {ASKS.map(a => (
                <li key={a} className="bg-white border border-stone-200 rounded-xl px-4 py-3
                                       text-[14px] text-stone-700 leading-relaxed">
                  “{a}”
                </li>
              ))}
            </ul>
          </section>

          {/* Tools */}
          <section className="mb-10">
            <h2 className="font-display font-bold text-stone-900 text-xl mb-3">What it exposes</h2>
            <dl className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
              {TOOLS.map(([name, desc]) => (
                <div key={name} className="px-4 py-3">
                  <dt className="font-mono text-[13px] text-indigo-700 mb-0.5">{name}</dt>
                  <dd className="text-[14px] text-stone-600 leading-relaxed">{desc}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-stone-500 mt-3 leading-relaxed">
              <Code>draft_email_brief</Code> deliberately returns material rather than a finished email —
              your assistant writes the prose, because it knows how you actually write and this server
              does not.
            </p>
          </section>

          {/* Honest limits */}
          <section className="mb-10">
            <h2 className="font-display font-bold text-stone-900 text-xl mb-3">Worth knowing</h2>
            <ul className="space-y-2 text-[14px] text-stone-600 leading-relaxed list-disc pl-5">
              <li>
                Coverage is six universities, not all of them. Faculty with no research text on record are
                excluded from <Code>match_faculty</Code>, since there is nothing to match on.
              </li>
              <li>
                Searching every school at once ranks by a raw keyword-hit count that is not normalized
                between schools, so schools with longer profile text come out ahead. Pass a{' '}
                <Code>school</Code> for a fair ranking.
              </li>
              <li>Data is refreshed by re-crawling, so a very new hire may be missing.</li>
            </ul>
          </section>

          <div className="border-t border-stone-200 pt-6 flex items-center gap-4 flex-wrap">
            <Link to="/" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Browse the site instead
            </Link>
            <button onClick={() => setFeedbackOpen(true)}
                    className="text-sm text-stone-500 hover:text-stone-700">
              Something broken? Tell us
            </button>
          </div>
        </div>
      </main>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
