import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import { apiPost } from '../utils/api'
import { deptLabel } from '../utils/search'
import EmailModal from '../components/EmailModal'

/* ── Fit badge ─────────────────────────────────────────────── */
const FIT_CONFIG = {
  strong_fit:      { label: 'Strong Fit',      cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  exploratory_fit: { label: 'Exploratory Fit', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  adjacent_fit:    { label: 'Adjacent Fit',    cls: 'bg-blue-50 text-blue-800 ring-blue-200' },
}

function FitBadge({ label }) {
  const cfg = FIT_CONFIG[label] ?? FIT_CONFIG.adjacent_fit
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px]
                      font-semibold ring-1 ring-inset leading-none ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

/* ── Department badge (reused style) ───────────────────────── */
const DEPT_STYLES = {
  chemical:   'bg-amber-50  text-amber-800  ring-amber-200',
  civil:      'bg-emerald-50 text-emerald-800 ring-emerald-200',
  cse:        'bg-violet-50 text-violet-800  ring-violet-200',
  electrical: 'bg-blue-50   text-blue-800   ring-blue-200',
  industrial: 'bg-orange-50 text-orange-800 ring-orange-200',
  materials:  'bg-rose-50   text-rose-800   ring-rose-200',
  mechanical: 'bg-teal-50   text-teal-800   ring-teal-200',
  nuclear:    'bg-red-50    text-red-800    ring-red-200',
  ocean:      'bg-sky-50    text-sky-800    ring-sky-200',
  petroleum:  'bg-yellow-50 text-yellow-800 ring-yellow-200',
}

function DeptBadge({ dept }) {
  const s = DEPT_STYLES[dept] ?? 'bg-stone-100 text-stone-600 ring-stone-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px]
                      font-semibold ring-1 ring-inset ${s}`}>
      {deptLabel(dept)}
    </span>
  )
}

/* ── Match card ────────────────────────────────────────────── */
function MatchCard({ result, rank, sessionId, interests, onDraftEmail }) {
  const { toggleSave, isSaved } = useApp()
  const { professor: prof, fit_label, explanation } = result
  const saved = isSaved(prof.id)
  const snippet = (prof.research_summary ?? '').slice(0, 220)

  return (
    <article
      className="group bg-cream-50 rounded-2xl border border-cream-300
                 shadow-sm shadow-stone-900/[0.04]
                 hover:shadow-xl hover:shadow-stone-900/[0.09]
                 hover:border-stone-300 hover:-translate-y-0.5
                 transition-all duration-200 flex flex-col overflow-hidden"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-display font-bold text-maroon-700/40 text-[13px]
                           flex-shrink-0 select-none">
            #{rank}
          </span>
          <FitBadge label={fit_label} />
          <DeptBadge dept={prof.department} />
        </div>
        <button
          onClick={() => toggleSave(prof.id)}
          title={saved ? 'Remove from saved' : 'Save'}
          className={`flex-shrink-0 p-1.5 rounded-lg transition-all active:scale-90 ${
            saved
              ? 'text-maroon-700 bg-maroon-100 hover:bg-maroon-200'
              : 'text-stone-300 hover:text-maroon-700 hover:bg-maroon-50'
          }`}
        >
          {saved ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
                 className="w-4 h-4">
              <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
            </svg>
          )}
        </button>
      </div>

      {/* Name */}
      <div className="px-5 pb-3">
        <Link
          to={`/prof/${prof.id}`}
          className="font-display font-bold text-stone-900 text-[17px] leading-snug
                     hover:text-maroon-700 transition-colors block mb-1"
        >
          {prof.name}
        </Link>
        {prof.title && (
          <p className="text-[12px] text-stone-400 italic leading-snug line-clamp-1">
            {prof.title}
          </p>
        )}
      </div>

      <div className="h-px bg-cream-300 mx-5" />

      {/* Match explanation */}
      <div className="px-5 pt-3.5 pb-1">
        <div className="text-[10px] font-semibold text-maroon-700/70 uppercase
                        tracking-[0.14em] mb-1.5">
          Why you match
        </div>
        <p className="text-[12.5px] text-stone-600 leading-relaxed line-clamp-3">
          {explanation}
        </p>
      </div>

      {/* Research snippet */}
      <div className="flex-1 px-5 py-3">
        {snippet ? (
          <p className="text-[12px] text-stone-500 leading-relaxed line-clamp-3">
            {snippet}
            {(prof.research_summary ?? '').length > 220 && (
              <span className="text-stone-400"> &hellip;</span>
            )}
          </p>
        ) : (
          <p className="text-xs text-stone-400 italic">No research summary available.</p>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-3 bg-cream-100/80 border-t border-cream-300
                      flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onDraftEmail(prof)}
          className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                     rounded-lg bg-maroon-700 text-cream-100 hover:bg-maroon-600
                     transition-colors font-semibold"
        >
          Draft Email
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
            <path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 5.193v7.057c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.193l-5.412 3.608a1.5 1.5 0 0 1-1.676 0L1.5 5.193Zm13-1.676-6.263 4.175a.25.25 0 0 1-.274 0L1.5 3.517v-.267a.25.25 0 0 1 .25-.25h12.5a.25.25 0 0 1 .25.25v.267Z" />
          </svg>
        </button>
        {prof.profile_url && (
          <a
            href={prof.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] px-3 py-1.5
                       rounded-lg border border-cream-400 text-stone-600
                       hover:border-maroon-300 hover:text-maroon-700 hover:bg-maroon-50
                       transition-colors font-medium"
          >
            Profile
            <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-60">
              <path d="M3.5 3a.5.5 0 0 0 0 1H7.29L2.15 9.15a.5.5 0 1 0 .7.7L8 4.71V8.5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5h-5Z" />
            </svg>
          </a>
        )}
        <Link
          to={`/prof/${prof.id}`}
          className="text-[11px] px-3 py-1.5 rounded-lg text-stone-400
                     hover:text-maroon-700 hover:bg-cream-200 transition-colors
                     font-medium ml-auto"
        >
          Details →
        </Link>
      </div>
    </article>
  )
}

/* ── Resume profile summary card ───────────────────────────── */
function ResumeCard({ profile, filename, interests, onReset }) {
  if (!profile) return null
  const name   = profile.name   || null
  const major  = profile.major  || null
  const year   = profile.year   || null
  const themes = (profile.inferred_themes || []).slice(0, 5)
  const skills = (profile.technical_skills || []).slice(0, 5)

  return (
    <div className="bg-cream-50 rounded-2xl border border-cream-300 p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] font-semibold text-stone-400 uppercase
                          tracking-[0.14em] mb-0.5">
            Matched from your resume
          </div>
          {name && (
            <div className="font-semibold text-stone-800 text-sm">{name}</div>
          )}
          {(year || major) && (
            <div className="text-xs text-stone-500 mt-0.5">
              {[year, major].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <button
          onClick={onReset}
          className="text-xs text-stone-400 hover:text-maroon-700 transition-colors
                     font-medium whitespace-nowrap"
        >
          Start over
        </button>
      </div>

      {themes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {themes.map(t => (
            <span key={t}
                  className="text-[11px] px-2.5 py-0.5 rounded-full bg-maroon-50
                             border border-maroon-200 text-maroon-700 font-medium">
              {t}
            </span>
          ))}
        </div>
      )}

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {skills.map(s => (
            <span key={s}
                  className="text-[11px] px-2.5 py-0.5 rounded-full bg-cream-200
                             border border-cream-300 text-stone-600">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-cream-300">
        <span className="text-[11px] text-stone-400">
          Interests: <span className="text-stone-600">{interests}</span>
        </span>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function Match() {
  const navigate = useNavigate()
  const [session,   setSession]   = useState(null)
  const [matches,   setMatches]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [emailProf, setEmailProf] = useState(null)

  useEffect(() => {
    const raw = localStorage.getItem('tamu_session')
    if (!raw) { navigate('/discover'); return }

    let parsed
    try { parsed = JSON.parse(raw) } catch { navigate('/discover'); return }

    setSession(parsed)
    runMatch(parsed)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const runMatch = useCallback(async (sess) => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost('/match', {
        session_id: sess.session_id,
        interests:  sess.interests,
        top_n: 20,
      })
      setMatches(res.matches || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleReset() {
    localStorage.removeItem('tamu_session')
    navigate('/discover')
  }

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-54px)] bg-cream-100 flex items-center
                      justify-center flex-col text-center px-4">
        <div className="w-10 h-10 border-[3px] border-maroon-700 border-t-transparent
                        rounded-full animate-spin mb-5" />
        <p className="font-semibold text-stone-800 text-sm mb-1">Matching faculty…</p>
        <p className="text-xs text-stone-400">Ranking professors by how well they fit your interests</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[calc(100vh-54px)] bg-cream-100 flex items-center
                      justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200
                          flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                 className="w-7 h-7 text-red-500">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="font-display font-bold text-stone-900 text-xl mb-2">
            Matching failed
          </h2>
          <p className="text-sm text-stone-500 mb-6 leading-relaxed">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => session && runMatch(session)}
              className="px-5 py-2.5 bg-maroon-700 text-cream-100 rounded-xl
                         text-sm font-semibold hover:bg-maroon-600 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={handleReset}
              className="px-5 py-2.5 border border-cream-400 text-stone-600
                         rounded-xl text-sm font-medium hover:bg-cream-200 transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-54px)] bg-cream-100">
      {/* Header */}
      <div className="relative bg-cream-50 border-b border-cream-300 overflow-hidden">
        <div className="absolute inset-0 dot-texture opacity-40 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-4 h-px bg-maroon-700" />
            <span className="text-xs font-semibold text-maroon-700 uppercase tracking-[0.16em]">
              Your Matches
            </span>
          </div>
          <h1 className="font-display font-bold text-stone-900 text-3xl sm:text-4xl
                         tracking-tight mb-1.5">
            {matches.length} Research Matches Found
          </h1>
          <p className="text-[15px] text-stone-500">
            Ranked by alignment with your interests. Click any card to draft an outreach email.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7">

        {/* Resume summary */}
        {session && (
          <ResumeCard
            profile={session.parsed_profile}
            filename={session.filename}
            interests={session.interests}
            onReset={handleReset}
          />
        )}

        {/* Results grid */}
        {matches.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {matches.map((result, i) => (
              <div
                key={result.professor.id}
                style={{
                  opacity: 0,
                  animation: `heroFadeUp 0.45s cubic-bezier(0.16,1,0.3,1) ${Math.min(i, 12) * 50}ms forwards`,
                }}
              >
                <MatchCard
                  result={result}
                  rank={result.rank}
                  sessionId={session?.session_id}
                  interests={session?.interests}
                  onDraftEmail={setEmailProf}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-24">
            <p className="text-stone-500 text-sm">No matches found. Try broadening your interests.</p>
            <button
              onClick={handleReset}
              className="mt-4 px-6 py-2.5 bg-maroon-700 text-cream-100 rounded-xl
                         text-sm font-semibold hover:bg-maroon-600 transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {/* Footer nudge */}
        {matches.length > 0 && (
          <div className="mt-10 text-center border-t border-cream-300 pt-8">
            <p className="text-sm text-stone-500 mb-3">
              Want to browse all faculty without matching?
            </p>
            <Link
              to="/search"
              className="inline-flex items-center gap-1.5 text-sm text-maroon-700
                         font-semibold hover:text-maroon-600 transition-colors"
            >
              Go to Faculty Search →
            </Link>
          </div>
        )}
      </div>

      {/* Email modal */}
      {emailProf && (
        <EmailModal
          prof={emailProf}
          sessionId={session?.session_id}
          interests={session?.interests}
          onClose={() => setEmailProf(null)}
        />
      )}
    </div>
  )
}
