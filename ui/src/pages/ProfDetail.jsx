import { useState, useMemo, useEffect } from 'react'
import { useParams, Link, useNavigate, Navigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import { useSchool, useSchoolPath } from '../SchoolContext'
import { deptLabel } from '../utils/search'
import EmailModal from '../components/EmailModal'
import { BookmarkIcon, ExtIcon, DeptBadge, RankBadge, Avatar } from '../components/ProfBits'
import Seo from '../components/Seo'
import { buildProfMeta } from '../lib/seo'

/**
 * Publications live in their own file per professor, not in the list payload
 * that AppContext fetches — they were 1.5 MB of TAMU's 5.1 MB and only this
 * page renders them. Cached for the life of the page like the faculty payload,
 * so going back and forth between professors doesn't refetch.
 */
const pubsCache = new Map()

function loadPubs(id) {
  if (!pubsCache.has(id)) {
    pubsCache.set(id, fetch(`/pubs/${id}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(() => {
        pubsCache.delete(id)   // don't cache a failure
        return []              // the rest of the page is unaffected
      }))
  }
  return pubsCache.get(id)
}

/* ── Loading skeleton ─────────────────────────────────────── */
// Every professor page is a prerendered landing page from search, so the
// faculty file is usually still in flight on first paint. Rendering "Profile
// not found" until it arrived flashed a 404 at most visitors.
function DetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 animate-pulse" aria-busy="true"
         aria-label="Loading profile">
      <div className="h-4 w-16 bg-cream-200 rounded mb-7" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-cream-50 rounded-2xl border border-cream-300 p-8 flex gap-5">
            <div className="w-20 h-20 rounded-xl bg-cream-200" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="h-7 w-2/3 bg-cream-200 rounded" />
              <div className="h-4 w-1/2 bg-cream-200 rounded" />
            </div>
          </div>
          <div className="bg-cream-50 rounded-2xl border border-cream-300 p-8 space-y-3">
            <div className="h-3 w-full bg-cream-200 rounded" />
            <div className="h-3 w-11/12 bg-cream-200 rounded" />
            <div className="h-3 w-4/5 bg-cream-200 rounded" />
          </div>
        </div>
        <div className="h-40 bg-cream-200 rounded-2xl" />
      </div>
    </div>
  )
}

// The name to address them by. `name` is cleaned by merge.py (no "Dr.", no
// degrees), so the last token is the surname.
function surname(name) {
  const parts = (name || '').trim().split(/\s+/)
  return parts[parts.length - 1] || ''
}

/* ── Page ─────────────────────────────────────────────────── */
export default function ProfDetail() {
  const { id }                           = useParams()
  const { faculty, loading, toggleSave, isSaved } = useApp()
  const navigate                         = useNavigate()
  const school                           = useSchool()
  const tx                               = useSchoolPath()
  const sessionKey                       = `${school.code}_session`
  const [emailOpen, setEmailOpen]        = useState(false)

  const prof    = faculty.find(f => f.id === id)
  // An id that merge.py retired when it collapsed a duplicate still resolves:
  // links shared or indexed before the merge land on the surviving record.
  const aliasOf = prof ? null : faculty.find(f => (f.alias_ids || []).includes(id))
  const saved   = prof ? isSaved(prof.id, prof) : false

  // Faculty pages are the long-tail SEO surface ("<professor name> <school>
  // research"), so they get their own title/description and Person schema.
  // Memoized: <Seo> re-applies whenever this object identity changes.
  const seoMeta = useMemo(
    () => (prof ? buildProfMeta(prof, school, deptLabel(prof.department)) : null),
    [prof, school],
  )

  // Fetched, not read off `prof`: see loadPubs. `pub_count` is written by
  // merge.py, so a professor with no publications never issues the request.
  const [pubs, setPubs] = useState([])
  useEffect(() => {
    setPubs([])   // never show the previous professor's list while this one loads
    if (!prof?.pub_count) return
    let cancelled = false
    loadPubs(prof.id).then(p => { if (!cancelled) setPubs(Array.isArray(p) ? p : []) })
    return () => { cancelled = true }
  }, [prof?.id, prof?.pub_count])

  // Read session from localStorage (set by Discover flow)
  const session = (() => {
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null') } catch { return null }
  })()

  if (aliasOf) return <Navigate to={tx(`/prof/${aliasOf.id}`)} replace />
  if (!prof && loading) return <DetailSkeleton />

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
          to={tx('/search')}
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
      {seoMeta && <Seo meta={seoMeta} />}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Back */}
        <button
          // A visitor who landed here from a search engine has no in-app page
          // to go back to, and navigate(-1) took them off the site.
          onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate(tx('/search')))}
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <DeptBadge dept={prof.department} />
                  <RankBadge rank={prof.rank_type} />
                </div>
                <button
                  onClick={() => toggleSave(prof)}
                  aria-pressed={saved}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2
                              rounded-xl border text-sm font-medium transition-colors ${
                                saved
                                  ? 'bg-maroon-50 border-maroon-300 text-maroon-700 hover:bg-maroon-100'
                                  : 'border-cream-400 text-stone-500 hover:border-maroon-300 hover:text-maroon-700'
                              }`}
                >
                  <BookmarkIcon filled={saved} className="w-4 h-4" />
                  {saved ? 'Saved' : 'Save'}
                </button>
              </div>

              <div className="flex items-start gap-5">
                <Avatar prof={prof} className="w-20 h-20 rounded-xl" textClass="text-2xl" />
                <div className="min-w-0">
                  <h1 className="font-display font-bold text-stone-900 tracking-tight
                                 leading-tight mb-2 text-3xl sm:text-4xl">
                    {prof.name}
                  </h1>
                  {prof.credentials && (
                    <p className="text-xs text-stone-400 font-medium tracking-wide mb-1">
                      {prof.credentials}
                    </p>
                  )}
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
            {pubs.length > 0 && (
              <div className="bg-cream-50 rounded-2xl border border-cream-300 p-7 sm:p-8">
                <div className="text-[11px] font-semibold text-stone-400 uppercase
                                tracking-[0.14em] mb-5">
                  Top Publications
                </div>
                <div className="space-y-3">
                  {pubs.slice(0, 10).map((pub, i) => (
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

            {/* Research summary. The empty-state box only appears when there is
                genuinely nothing: it used to show beneath a full Research
                Overview whenever research_summary alone was blank. */}
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
            ) : !prof.ai_review && !(prof.scholar_interests || []).length && (
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
                {surname(prof.name)} tailored to your background and interests.
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
                  <Link to={tx('/discover')} className="underline underline-offset-2 hover:text-maroon-300">
                    Upload your resume
                  </Link>{' '}
                  for a personalized draft.
                </p>
              )}
            </div>

            {/* Save to My List CTA (saving adds it to the tracker) */}
            <button
              onClick={() => toggleSave(prof)}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5
                          rounded-2xl border text-sm font-semibold transition-colors
                          ${saved
                            ? 'bg-maroon-50 border-maroon-200 text-maroon-700 hover:bg-maroon-100'
                            : 'bg-white border-stone-200 text-stone-700 hover:border-maroon-300 hover:text-maroon-700 hover:bg-maroon-50'
                          }`}
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 opacity-70">
                <path d="M7.25 1.5a.75.75 0 0 1 1.5 0v5.25H14a.75.75 0 0 1 0 1.5H8.75v5.25a.75.75 0 0 1-1.5 0V8.25H2a.75.75 0 0 1 0-1.5h5.25V1.5Z" />
              </svg>
              {saved ? 'In My List ✓' : 'Save to My List'}
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
                    <ExtIcon className="w-3.5 h-3.5" />
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
                    <ExtIcon className="w-3.5 h-3.5" />
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
                    <ExtIcon className="w-3.5 h-3.5" />
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
                {/* merge.py removes shared office mailboxes (UT Dallas's
                    profile site put its research office on 603 records), so a
                    missing address is common and needs saying, not hiding. */}
                {!prof.email && (
                  <p className="text-xs text-stone-500 leading-relaxed px-1">
                    No direct email is published in our data.
                    {prof.profile_url ? ' Their faculty profile or lab site usually lists one.' : ''}
                  </p>
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
              to={tx('/search')}
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
