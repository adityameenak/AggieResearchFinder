import { useState, useEffect } from 'react'
import { deptLabel, deptStyle } from '../utils/search'

/*
 * Small pieces every professor surface shares — search cards, match cards,
 * the detail page. Each of those used to keep its own copy of the bookmark
 * icon, the external-link icon and the department badge, at three different
 * badge sizes; one definition keeps them from drifting apart again.
 */

export function BookmarkIcon({ filled, className = 'w-[15px] h-[15px]' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}
         fill={filled ? 'currentColor' : 'none'}
         stroke={filled ? 'none' : 'currentColor'}
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
    </svg>
  )
}

export function ExtIcon({ className = 'w-2.5 h-2.5' }) {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"
         className={`${className} opacity-60 flex-shrink-0`}>
      <path d="M3.5 3a.5.5 0 0 0 0 1H7.29L2.15 9.15a.5.5 0 1 0 .7.7L8 4.71V8.5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5h-5Z" />
    </svg>
  )
}

export function DeptBadge({ dept }) {
  const s = deptStyle(dept)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]
                      font-semibold ring-1 ring-inset leading-none ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} aria-hidden="true" />
      {deptLabel(dept)}
    </span>
  )
}

/**
 * Appointment type from merge.py (quality.rank_type). Research faculty get no
 * badge — it's the default, and badging 4,000 cards "Research" is noise. The
 * others are shown because a student emailing an emeritus professor about a
 * lab position is the mistake this exists to prevent.
 */
const RANK_LABEL = {
  emeritus: { label: 'Emeritus', hint: 'Retired — usually not taking new students' },
  teaching: { label: 'Teaching / clinical', hint: 'Teaching or clinical appointment — may not run a research group' },
  adjunct:  { label: 'Adjunct', hint: 'Primary appointment is elsewhere' },
  visiting: { label: 'Visiting', hint: 'Temporary appointment' },
}

export function RankBadge({ rank }) {
  const cfg = RANK_LABEL[rank]
  if (!cfg) return null
  return (
    <span title={cfg.hint}
          className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold
                     leading-none ring-1 ring-inset bg-stone-100 text-stone-600 ring-stone-200">
      {cfg.label}
    </span>
  )
}

/**
 * Portrait with an initial as the fallback — for no photo, and for a photo URL
 * that 404s (university sites re-theme and move images long after a crawl).
 */
export function Avatar({ prof, className = 'w-11 h-11 rounded-full', textClass = 'text-sm' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [prof.photo_url])
  if (prof.photo_url && !failed) {
    return (
      <img src={prof.photo_url} alt="" loading="lazy" decoding="async"
           onError={() => setFailed(true)}
           className={`${className} object-cover flex-shrink-0 ring-1 ring-cream-300`} />
    )
  }
  return (
    <div aria-hidden="true"
         className={`${className} bg-cream-200 border border-cream-300 flex items-center
                     justify-center flex-shrink-0`}>
      <span className={`${textClass} font-semibold text-stone-400`}>{(prof.name || '?')[0]}</span>
    </div>
  )
}
