import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import { useSchool, useSchoolPath } from '../SchoolContext'
import { matchFaculty } from '../utils/matcher'
import { splitResearch } from '../utils/search'
import UploadZone from '../components/UploadZone'
import { extractText } from '../utils/extractText'
import { DeptBadge, Avatar } from '../components/ProfBits'

// Keep in step with LEVELS / LANGUAGES in api/paper.js — the server ignores
// anything not on its own list.
const LEVELS = [
  { value: 'intro',    label: 'New to the field' },
  { value: 'advanced', label: 'Took some courses in it' },
  { value: 'grad',     label: 'Graduate level' },
]
const LANGUAGES = [
  'English', 'Spanish', 'Chinese (Simplified)', 'Hindi', 'Arabic', 'Vietnamese',
  'Korean', 'Portuguese', 'French', 'Urdu', 'Bengali', 'Japanese',
]

const label = 'block text-[11px] font-semibold text-stone-400 uppercase tracking-[0.12em] mb-2'
const select = `w-full text-sm text-stone-900 bg-cream-50 border-2 border-cream-400 rounded-xl
                px-3 py-2.5 focus:outline-none focus:border-maroon-700 transition-colors`

/* ── Result sections ──────────────────────────────────────── */
function Section({ title, children }) {
  if (!children) return null
  return (
    <section className="mb-7">
      <h2 className="font-display font-bold text-stone-900 text-lg mb-2.5">{title}</h2>
      {children}
    </section>
  )
}

function Paragraphs({ text }) {
  if (!text) return null
  return text.split(/\n\s*\n/).map((p, i) => (
    <p key={i} className="text-[15px] text-stone-700 leading-relaxed mb-3">{p}</p>
  ))
}

function Bullets({ items }) {
  if (!items?.length) return null
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] text-stone-700 leading-relaxed">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-maroon-700 flex-shrink-0" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── Matches sidebar ──────────────────────────────────────── */
function PaperMatches({ matches, schoolName }) {
  const tx = useSchoolPath()
  if (!matches.length) {
    return (
      <p className="text-sm text-stone-500">
        No {schoolName} faculty list research close to this paper's topics. Try the full match with
        your own interests.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {matches.map(({ professor: prof }) => (
        <li key={prof.id}>
          <Link to={tx(`/prof/${prof.id}`)}
                className="flex items-start gap-3 p-3 rounded-xl border border-cream-300 bg-white
                           hover:border-maroon-300 hover:bg-maroon-50/40 transition-colors">
            <Avatar prof={prof} className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-stone-900 text-sm leading-snug">{prof.name}</div>
              <div className="mt-1 mb-1.5"><DeptBadge dept={prof.department} /></div>
              <p className="text-xs text-stone-500 leading-snug line-clamp-2">
                {splitResearch(prof).summary}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function PaperPage() {
  const navigate = useNavigate()
  const tx       = useSchoolPath()
  const school   = useSchool()
  const { faculty, loading: facultyLoading } = useApp()

  const [mode,     setMode]     = useState('upload')   // 'upload' | 'paste'
  const [file,     setFile]     = useState(null)
  const [pasted,   setPasted]   = useState('')
  const [level,    setLevel]    = useState('advanced')
  const [language, setLanguage] = useState('English')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [result,   setResult]   = useState(null)

  const ex = result?.explanation
  const interests = (ex?.research_topics || []).join(', ')

  // Same scorer as the Match page, run on the paper's topics instead of a
  // student's typed interests.
  const matches = useMemo(() => (
    interests && faculty.length ? matchFaculty(faculty, interests, null, 6) : []
  ), [interests, faculty])

  // After render, not in the submit handler: scrolling before the results
  // mount left the page parked at the bottom of the new, taller layout.
  useEffect(() => { window.scrollTo(0, 0) }, [result])

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'upload' && !file) { setError('Upload a paper first.'); return }
    if (mode === 'paste' && pasted.trim().length < 300) {
      setError('Paste more of the paper — at least the abstract and introduction.'); return
    }
    setError(null)
    setLoading(true)
    try {
      // Uploaded files are read here and only their text is sent — see
      // utils/extractText.js for why (Vercel's 4.5 MB request-body cap).
      // The cap below keeps even a book-length file well under that; the
      // server keeps the first 120k characters after dropping references.
      const text = mode === 'upload' ? await extractText(file) : pasted
      const body = { text: text.slice(0, 400_000), level, language,
                     ...(mode === 'upload' ? { filename: file.name } : {}) }
      const res = await fetch('/api/paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json.error || (res.status === 413
          ? 'That was too large to send. Try pasting the abstract, introduction and results instead.'
          : `Server error ${res.status}`))
      }
      setResult(json)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function matchWithPaper() {
    navigate(tx('/discover'), { state: { paper: { title: ex.title, interests } } })
  }

  /* ── Results view ── */
  if (ex) {
    const notTranslated = language !== 'English' && result.language === 'English'
    return (
      <div className="min-h-[calc(100vh-54px)] bg-cream-100 px-4 sm:px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <button onClick={() => setResult(null)}
                  className="text-xs text-stone-400 hover:text-maroon-700 font-medium mb-6">
            ← Explain another paper
          </button>

          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-4 h-px bg-maroon-700" />
            <span className="text-xs font-semibold text-maroon-700 uppercase tracking-[0.16em]">
              Paper, explained
            </span>
          </div>
          {ex.title && (
            <h1 className="font-display font-bold text-stone-900 text-2xl sm:text-3xl tracking-tight leading-tight mb-4">
              {ex.title}
            </h1>
          )}

          {(result.mock_mode || result.template_fallback || result.truncated || notTranslated) && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-6 text-sm text-amber-800 space-y-1">
              {(result.mock_mode || result.template_fallback) && (
                <p>
                  The AI explainer is unavailable right now, so this shows the paper's own abstract and
                  keywords instead of a rewritten version.
                </p>
              )}
              {notTranslated && <p>Translation needs the AI explainer, so this is in English.</p>}
              {result.truncated && (
                <p>This paper is very long; the explanation covers its first part.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
            <article>
              {ex.one_sentence && (
                <div className="rounded-2xl bg-maroon-50 border border-maroon-200 px-5 py-4 mb-7">
                  <div className="text-[10px] font-semibold text-maroon-700 uppercase tracking-[0.14em] mb-1">
                    In one sentence
                  </div>
                  <p className="text-[16px] text-stone-800 leading-relaxed font-medium">{ex.one_sentence}</p>
                </div>
              )}

              <Section title="What this paper is about">
                {ex.plain_summary && <Paragraphs text={ex.plain_summary} />}
              </Section>
              <Section title="Key findings">
                {ex.key_findings.length > 0 && <Bullets items={ex.key_findings} />}
              </Section>
              <Section title="How they did it">
                {ex.methods_plain && <Paragraphs text={ex.methods_plain} />}
              </Section>
              <Section title="Why it matters">
                {ex.why_it_matters && <Paragraphs text={ex.why_it_matters} />}
              </Section>
              <Section title="Words to know">
                {ex.glossary.length > 0 && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ex.glossary.map(g => (
                      <div key={g.term} className="rounded-xl bg-cream-50 border border-cream-300 px-4 py-3">
                        <dt className="font-semibold text-stone-900 text-sm mb-0.5">{g.term}</dt>
                        <dd className="text-[13px] text-stone-600 leading-relaxed">{g.definition}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Section>
              <Section title="Skills you'd need to work on this">
                {ex.skills_to_learn.length > 0 && <Bullets items={ex.skills_to_learn} />}
              </Section>
              <Section title="Questions you could ask a professor">
                {ex.questions_to_ask.length > 0 && <Bullets items={ex.questions_to_ask} />}
              </Section>
            </article>

            <aside className="lg:sticky lg:top-20 self-start space-y-5">
              <div className="rounded-2xl bg-cream-50 border border-cream-300 p-5">
                <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.14em] mb-2">
                  Research topics
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {ex.research_topics.map(t => (
                    <span key={t} className="text-[11px] px-2.5 py-0.5 rounded-full bg-maroon-50
                                             border border-maroon-200 text-maroon-700 font-medium">{t}</span>
                  ))}
                  {ex.fields.map(f => (
                    <span key={f} className="text-[11px] px-2.5 py-0.5 rounded-full bg-cream-200
                                             border border-cream-300 text-stone-600">{f}</span>
                  ))}
                </div>
                {interests && (
                  <button onClick={matchWithPaper}
                          className="w-full px-4 py-2.5 bg-maroon-700 text-cream-100 rounded-xl text-sm
                                     font-semibold hover:bg-maroon-600 transition-colors">
                    Match me using this paper →
                  </button>
                )}
                <p className="text-[11px] text-stone-400 mt-2 leading-snug">
                  Starts the resume match with these topics as your interests.
                </p>
              </div>

              <div className="rounded-2xl bg-cream-50 border border-cream-300 p-5">
                <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.14em] mb-3">
                  {school.shortName} faculty working on this
                </div>
                {facultyLoading
                  ? <p className="text-sm text-stone-400">Loading faculty…</p>
                  : <PaperMatches matches={matches} schoolName={school.shortName} />}
              </div>
            </aside>
          </div>
        </div>
      </div>
    )
  }

  /* ── Input view ── */
  return (
    <div className="min-h-[calc(100vh-54px)] bg-cream-100 flex items-start justify-center px-4 sm:px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-10">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-5 h-px bg-maroon-700" />
            <span className="text-xs font-semibold text-maroon-700 uppercase tracking-[0.18em]">
              Paper Explainer
            </span>
          </div>
          <h1 className="font-display font-bold text-stone-900 text-4xl sm:text-5xl tracking-tight leading-[1.06] mb-4">
            Make a research paper<br />
            <em className="not-italic text-maroon-700">readable.</em>
          </h1>
          <p className="text-[15px] text-stone-600 leading-relaxed max-w-lg">
            Upload a paper you found — or one a professor wrote. We'll explain it in plain language
            (or your own language), define the jargon, and show which {school.shortName} faculty
            work on the same thing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" aria-busy={loading}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-[0.12em]">01 — The paper</span>
              <div className="flex text-xs rounded-lg border border-cream-400 overflow-hidden" role="tablist">
                {[['upload', 'Upload'], ['paste', 'Paste text']].map(([v, l]) => (
                  <button key={v} type="button" role="tab" aria-selected={mode === v}
                          onClick={() => { setMode(v); setError(null) }}
                          className={`px-3 py-1 font-medium transition-colors ${
                            mode === v ? 'bg-maroon-700 text-cream-100' : 'bg-cream-50 text-stone-500 hover:text-stone-900'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {mode === 'upload' ? (
              <UploadZone file={file} onFile={setFile} prompt="Drop a research paper here" what="a research paper"
                          maxMB={50} exts={['pdf', 'docx']} />
            ) : (
              <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={9}
                        aria-label="Paper text"
                        placeholder="Paste the abstract, introduction, or the whole paper…"
                        className="w-full text-sm text-stone-900 bg-cream-50 border-2 border-cream-400 rounded-2xl
                                   px-4 py-3.5 leading-relaxed resize-y placeholder-stone-400
                                   focus:outline-none focus:border-maroon-700 transition-colors" />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="level" className={label}>02 — Your background</label>
              <select id="level" value={level} onChange={e => setLevel(e.target.value)} className={select}>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="language" className={label}>03 — Explain it in</label>
              <select id="language" value={language} onChange={e => setLanguage(e.target.value)} className={select}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 px-8 py-4 bg-maroon-700
                             text-cream-100 rounded-2xl font-semibold text-sm hover:bg-maroon-600
                             transition-all duration-200 shadow-lg shadow-maroon-950/25
                             disabled:opacity-50 disabled:cursor-not-allowed">
            {loading && (
              <span className="w-4 h-4 border-2 border-cream-100 border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? 'Reading the paper — this takes up to a minute…' : 'Explain this paper'}
          </button>
        </form>

        <p className="text-center text-xs text-stone-400 mt-8 leading-relaxed">
          Papers are processed to produce the explanation and are not stored.
          <br />AI explanations can contain mistakes — check anything important against the paper.
        </p>
      </div>
    </div>
  )
}
