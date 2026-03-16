import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import { deptLabel } from '../utils/search'
import EmailModal from '../components/EmailModal'
import { getApplications } from '../utils/trackerStorage'

/* ── Dept badge ───────────────────────────────────────────── */
const DEPT_STYLES = {
  // Engineering
  aerospace:   'bg-indigo-50  text-indigo-800  ring-indigo-200',
  biomedical:  'bg-pink-50   text-pink-800   ring-pink-200',
  chemical:    'bg-amber-50  text-amber-800  ring-amber-200',
  civil:       'bg-emerald-50 text-emerald-800 ring-emerald-200',
  cse:         'bg-violet-50 text-violet-800  ring-violet-200',
  electrical:  'bg-blue-50   text-blue-800   ring-blue-200',
  etid:        'bg-lime-50   text-lime-800   ring-lime-200',
  industrial:  'bg-orange-50 text-orange-800 ring-orange-200',
  materials:   'bg-rose-50   text-rose-800   ring-rose-200',
  mechanical:  'bg-teal-50   text-teal-800   ring-teal-200',
  multidisciplinary: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200',
  nuclear:     'bg-red-50    text-red-800    ring-red-200',
  ocean:       'bg-sky-50    text-sky-800    ring-sky-200',
  petroleum:   'bg-yellow-50 text-yellow-800 ring-yellow-200',
  // Arts & Sciences
  biology:     'bg-green-50  text-green-800  ring-green-200',
  chemistry:   'bg-cyan-50   text-cyan-800   ring-cyan-200',
  mathematics: 'bg-purple-50 text-purple-800 ring-purple-200',
  'physics-astronomy':  'bg-slate-50  text-slate-800  ring-slate-200',
  statistics:  'bg-zinc-50   text-zinc-800   ring-zinc-200',
  'atmos-science':      'bg-sky-50    text-sky-800    ring-sky-200',
  'geology-geophysics': 'bg-stone-50  text-stone-800  ring-stone-200',
  oceanography:         'bg-blue-50   text-blue-800   ring-blue-200',
  'psychological-brain-sciences': 'bg-rose-50 text-rose-800 ring-rose-200',
}

function DeptBadge({ dept }) {
  const s = DEPT_STYLES[dept] ?? 'bg-stone-100 text-stone-600 ring-stone-200'
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs
                      font-semibold ring-1 ring-inset ${s}`}>
      {deptLabel(dept)}
    </span>
  )
}

function ExtIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-50 flex-shrink-0">
      <path d="M6.22 8.72a.75.75 0 0 0 1.06 1.06l5.22-5.22v1.69a.75.75 0 0 0 1.5 0v-3.5a.75.75 0 0 0-.75-.75h-3.5a.75.75 0 0 0 0 1.5h1.69L6.22 8.72Z" />
      <path d="M3.5 6.75c0-.69.56-1.25 1.25-1.25H7A.75.75 0 0 0 7 4H4.75A2.75 2.75 0 0 0 2 6.75v4.5A2.75 2.75 0 0 0 4.75 14h4.5A2.75 2.75 0 0 0 12 11.25V9a.75.75 0 0 0-1.5 0v2.25c0 .69-.56 1.25-1.25 1.25h-4.5c-.69 0-1.25-.56-1.25-1.25v-4.5Z" />
    </svg>
  )
}

function BookmarkIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         className="w-4 h-4">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
    </svg>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function ProfDetail() {
  const { id }                           = useParams()
  const { faculty, toggleSave, isSaved } = useApp()
  const navigate                         = useNavigate()
  const [emailOpen, setEmailOpen]        = useState(false)

  const prof    = faculty.find(f => f.id === id)
  const saved   = prof ? isSaved(prof.id) : false
  const tracked = prof ? getApplications().some(a => a.sourceLink === prof.profile_url && a.professorName === prof.name) : false

  // Read session from localStorage (set by Discover flow)
  const session = (() => {
    try { return JSON.parse(localStorage.getItem('tamu_session') || 'null') } catch { return null }
  })()

  function handleTrack() {
    navigate('/tracker', {
      state: {
        prefill: {
          professorName: prof.name || '',
          labName:       '',
          department:    prof.department || '',
          researchArea:  (prof.scholar_interests ?? []).slice(0, 3).join(', '),
          sourceLink:    prof.profile_url || '',
          emailUsed:     prof.email || '',
          status:        'Not Started',
        },
      },
    })
  }

  if (!prof) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-cream-200 border border-cream-300
                        flex items-center justify-center mx-auto mb-5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-stone-400">
            <path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="font-display font-bold text-stone-900 text-2xl mb-3">
          Profile not found
        </h2>
        <p className="text-sm text-stone-500 mb-6 max-w-xs mx-auto leading-relaxed">
          The faculty record for ID{' '}
          <code className="bg-cream-200 px-1.5 py-0.5 rounded text-xs font-mono">
            {id}
          </code>{' '}
          could not be found.
        </p>
        <Link
          to="/search"
          className="inline-flex items-center gap-1.5 text-sm px-6 py-2.5
                     bg-maroon-700 text-cream-100 rounded-xl hover:bg-maroon-600
                     transition-colors font-medium"
        >
          ← Back to Search
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-stone-500
                     hover:text-stone-800 transition-colors mb-7"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
          Back
        </button>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Main column ─────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Profile header */}
            <div className="bg-cream-50 rounded-2xl border border-cream-300 p-7 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-5">
                <DeptBadge dept={prof.department} />
                <button
                  onClick={() => toggleSave(prof.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2
                              rounded-xl border text-sm font-medium transition-colors ${
                                saved
                                  ? 'bg-maroon-50 border-maroon-300 text-maroon-700 hover:bg-maroon-100'
                                  : 'border-cream-400 text-stone-500 hover:border-maroon-300 hover:text-maroon-700'
                              }`}
                >
                  <BookmarkIcon filled={saved} />
                  {saved ? 'Saved' : 'Save'}
                </button>
              </div>

              <div className="flex items-start gap-5">
                {prof.photo_url ? (
                  <img
                    src={prof.photo_url}
                    alt=""
                    className="w-20 h-20 rounded-xl object-cover flex-shrink-0 ring-1 ring-cream-300"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-cream-200 border border-cream-300
                                  flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl font-bold text-stone-400">
                      {(prof.name || '?')[0]}
                    </span>
                  </div>
                )}
                <div>
                  <h1 className="font-display font-bold text-stone-900 tracking-tight
                                 leading-tight mb-2 text-3xl sm:text-4xl">
                    {prof.name}
                  </h1>
                  {prof.title && (
                    <p className="text-[15px] text-stone-500 leading-snug">{prof.title}</p>
                  )}
                </div>
              </div>
            </div>

            {/* AI Research Review */}
            {prof.ai_review && (
              <div className="bg-cream-50 rounded-2xl border border-cream-300 p-7 sm:p-8">
                <div className="text-[11px] font-semibold text-stone-400 uppercase
                                tracking-[0.14em] mb-5">
                  Research Overview
                </div>
                <p className="text-[15px] text-stone-700 leading-[1.75]">
                  {prof.ai_review}
                </p>
              </div>
            )}

            {/* Scholar Research Interests */}
            {prof.scholar_interests && prof.scholar_interests.length > 0 && (
              <div className="bg-cream-50 rounded-2xl border border-cream-300 p-7 sm:p-8">
                <div className="text-[11px] font-semibold text-stone-400 uppercase
                                tracking-[0.14em] mb-4">
                  Research Interests
                </div>
                <div className="flex flex-wrap gap-2">
                  {prof.scholar_interests.map((interest, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs
                                 font-medium bg-maroon-50 text-maroon-700 ring-1 ring-inset
                                 ring-maroon-200"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Top Publications */}
            {prof.publications && prof.publications.length > 0 && (
              <div className="bg-cream-50 rounded-2xl border border-cream-300 p-7 sm:p-8">
                <div className="text-[11px] font-semibold text-stone-400 uppercase
                                tracking-[0.14em] mb-5">
                  Top Publications
                </div>
                <div className="space-y-3">
                  {prof.publications.slice(0, 10).map((pub, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-[11px] text-stone-400 font-mono mt-0.5 flex-shrink-0 w-5 text-right">
                        {i + 1}.
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] text-stone-700 font-medium leading-snug">
                          {pub.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {pub.year && (
                            <span className="text-[11px] text-stone-400">{pub.year}</span>
                          )}
                          {pub.cited_by != null && (
                            <span className="text-[11px] text-stone-400">
                              {pub.cited_by} citations
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Research summary */}
            {prof.research_summary ? (
              <div className="bg-cream-50 rounded-2xl border border-cream-300 p-7 sm:p-8">
                <div className="text-[11px] font-semibold text-stone-400 uppercase
                                tracking-[0.14em] mb-5">
                  Research Keywords
                </div>
                <p className="text-[15px] text-stone-700 leading-[1.75] whitespace-pre-line">
                  {prof.research_summary}
                </p>
              </div>
            ) : (
              <div className="bg-cream-100 rounded-2xl border border-cream-300 p-8 text-center">
                <p className="text-sm text-stone-400 italic">
                  No research summary available for this professor.
                </p>
              </div>
            )}
          </div>

          {/* ── Sidebar ─────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Draft email CTA */}
            <div className="bg-maroon-700 rounded-2xl p-5">
              <div className="text-[11px] font-semibold text-maroon-300 uppercase
                              tracking-[0.14em] mb-2">
                Outreach
              </div>
              <p className="text-xs text-maroon-200 leading-relaxed mb-4">
                Generate a personalized email draft to Prof.{' '}
                {prof.name.split(' ').pop()} tailored to your background and interests.
              </p>
              <button
                onClick={() => setEmailOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                           bg-cream-100 text-maroon-800 text-sm font-semibold
                           rounded-xl hover:bg-cream-50 transition-colors"
              >
                Draft Outreach Email
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 5.193v7.057c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.193l-5.412 3.608a1.5 1.5 0 0 1-1.676 0L1.5 5.193Zm13-1.676-6.263 4.175a.25.25 0 0 1-.274 0L1.5 3.517v-.267a.25.25 0 0 1 .25-.25h12.5a.25.25 0 0 1 .25.25v.267Z" />
                </svg>
              </button>
              {!session && (
                <p className="text-[10px] text-maroon-400 mt-2 text-center leading-relaxed">
                  <Link to="/discover" className="underline underline-offset-2 hover:text-maroon-300">
                    Upload your resume
                  </Link>{' '}
                  for a personalized draft.
                </p>
              )}
            </div>

            {/* Track Application CTA */}
            <button
              onClick={handleTrack}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5
                          rounded-2xl border text-sm font-semibold transition-colors
                          ${tracked
                            ? 'bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100'
                            : 'bg-white border-stone-200 text-stone-700 hover:border-maroon-300 hover:text-maroon-700 hover:bg-maroon-50'
                          }`}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 opacity-70">
                <path d="M7.25 1.5a.75.75 0 0 1 1.5 0v5.25H14a.75.75 0 0 1 0 1.5H8.75v5.25a.75.75 0 0 1-1.5 0V8.25H2a.75.75 0 0 1 0-1.5h5.25V1.5Z" />
              </svg>
              {tracked ? 'Already Tracked' : 'Track Application'}
            </button>

            {/* Links */}
            <div className="bg-cream-50 rounded-2xl border border-cream-300 p-5">
              <div className="text-[11px] font-semibold text-stone-400 uppercase
                              tracking-[0.14em] mb-4">
                Links
              </div>
              <div className="space-y-2.5">
                {prof.profile_url && (
                  <a
                    href={prof.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between w-full px-4 py-2.5
                               rounded-xl bg-maroon-700 text-cream-100 text-sm
                               font-medium hover:bg-maroon-600 transition-colors"
                  >
                    Faculty Profile
                    <ExtIcon />
                  </a>
                )}
                {prof.lab_website && (
                  <a
                    href={prof.lab_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between w-full px-4 py-2.5
                               rounded-xl border border-cream-400 text-stone-700 text-sm
                               font-medium hover:border-maroon-400 hover:text-maroon-700
                               hover:bg-maroon-50 transition-colors"
                  >
                    Lab Website
                    <ExtIcon />
                  </a>
                )}
                {prof.google_scholar && (
                  <a
                    href={prof.google_scholar}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between w-full px-4 py-2.5
                               rounded-xl border border-cream-400 text-stone-700 text-sm
                               font-medium hover:border-maroon-400 hover:text-maroon-700
                               hover:bg-maroon-50 transition-colors"
                  >
                    Google Scholar
                    <ExtIcon />
                  </a>
                )}
                {prof.email && (
                  <a
                    href={`mailto:${prof.email}`}
                    className="flex items-center justify-between w-full px-4 py-2.5
                               rounded-xl border border-cream-400 text-stone-700 text-sm
                               font-medium hover:border-stone-300 hover:bg-cream-200
                               transition-colors"
                  >
                    Send Email
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-50">
                      <path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 5.193v7.057c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.193l-5.412 3.608a1.5 1.5 0 0 1-1.676 0L1.5 5.193Zm13-1.676-6.263 4.175a.25.25 0 0 1-.274 0L1.5 3.517v-.267a.25.25 0 0 1 .25-.25h12.5a.25.25 0 0 1 .25.25v.267Z" />
                    </svg>
                  </a>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="bg-cream-50 rounded-2xl border border-cream-300 p-5">
              <div className="text-[11px] font-semibold text-stone-400 uppercase
                              tracking-[0.14em] mb-4">
                Details
              </div>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-stone-400 mb-0.5">Department</dt>
                  <dd className="text-sm text-stone-800 font-medium">
                    {deptLabel(prof.department)}
                  </dd>
                </div>
                {prof.email && (
                  <div>
                    <dt className="text-xs text-stone-400 mb-0.5">Email</dt>
                    <dd className="text-sm text-stone-800 font-mono break-all">
                      {prof.email}
                    </dd>
                  </div>
                )}
                {prof.phone && (
                  <div>
                    <dt className="text-xs text-stone-400 mb-0.5">Phone</dt>
                    <dd className="text-sm text-stone-800">
                      <a href={`tel:${prof.phone}`} className="hover:text-maroon-700 transition-colors">
                        {prof.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {prof.office && (
                  <div>
                    <dt className="text-xs text-stone-400 mb-0.5">Office</dt>
                    <dd className="text-sm text-stone-800">{prof.office}</dd>
                  </div>
                )}
              </dl>
            </div>

            <Link
              to="/search"
              className="flex items-center justify-center gap-1.5 w-full py-2.5
                         rounded-xl border border-cream-300 text-sm text-stone-500
                         hover:bg-cream-200 hover:text-stone-700 transition-colors
                         font-medium"
            >
              ← Back to search
            </Link>
          </div>
        </div>
      </div>

      {/* Email modal */}
      {emailOpen && (
        <EmailModal
          prof={prof}
          session={session}
          onClose={() => setEmailOpen(false)}
        />
      )}
    </>
  )
}
