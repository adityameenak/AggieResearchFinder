import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import { highlightSegments, deptLabel } from '../utils/search'

/* ── Highlight renderer ───────────────────────────────────── */
function Highlight({ text, tokens }) {
  const segs = highlightSegments(text, tokens)
  return (
    <span>
      {segs.map((s, i) =>
        s.highlight ? (
          <mark
            key={i}
            className="bg-gold-light text-stone-900 rounded-sm px-[2px] not-italic"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </span>
  )
}

/* ── Department badge ─────────────────────────────────────── */
const DEPT_STYLES = {
  // Engineering
  aerospace:   { dot: 'bg-indigo-500',  pill: 'bg-indigo-50  text-indigo-800  ring-indigo-200'  },
  biomedical:  { dot: 'bg-pink-500',    pill: 'bg-pink-50   text-pink-800   ring-pink-200'    },
  chemical:    { dot: 'bg-amber-500',   pill: 'bg-amber-50  text-amber-800  ring-amber-200'   },
  civil:       { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  cse:         { dot: 'bg-violet-500',  pill: 'bg-violet-50 text-violet-800  ring-violet-200'  },
  electrical:  { dot: 'bg-blue-500',    pill: 'bg-blue-50   text-blue-800   ring-blue-200'    },
  etid:        { dot: 'bg-lime-500',    pill: 'bg-lime-50   text-lime-800   ring-lime-200'    },
  industrial:  { dot: 'bg-orange-500',  pill: 'bg-orange-50 text-orange-800 ring-orange-200'  },
  materials:   { dot: 'bg-rose-500',    pill: 'bg-rose-50   text-rose-800   ring-rose-200'    },
  mechanical:  { dot: 'bg-teal-500',    pill: 'bg-teal-50   text-teal-800   ring-teal-200'    },
  multidisciplinary: { dot: 'bg-fuchsia-500', pill: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200' },
  nuclear:     { dot: 'bg-red-500',     pill: 'bg-red-50    text-red-800    ring-red-200'     },
  ocean:       { dot: 'bg-sky-500',     pill: 'bg-sky-50    text-sky-800    ring-sky-200'     },
  petroleum:   { dot: 'bg-yellow-500',  pill: 'bg-yellow-50 text-yellow-800 ring-yellow-200'  },
  // Arts & Sciences
  biology:     { dot: 'bg-green-500',   pill: 'bg-green-50  text-green-800  ring-green-200'   },
  chemistry:   { dot: 'bg-cyan-500',    pill: 'bg-cyan-50   text-cyan-800   ring-cyan-200'    },
  mathematics: { dot: 'bg-purple-500',  pill: 'bg-purple-50 text-purple-800 ring-purple-200'  },
  'physics-astronomy':  { dot: 'bg-slate-500', pill: 'bg-slate-50  text-slate-800  ring-slate-200'  },
  statistics:  { dot: 'bg-zinc-500',    pill: 'bg-zinc-50   text-zinc-800   ring-zinc-200'    },
  'atmos-science':      { dot: 'bg-sky-500',   pill: 'bg-sky-50    text-sky-800    ring-sky-200'    },
  'geology-geophysics': { dot: 'bg-stone-500', pill: 'bg-stone-50  text-stone-800  ring-stone-200'  },
  oceanography:         { dot: 'bg-blue-500',  pill: 'bg-blue-50   text-blue-800   ring-blue-200'   },
  'psychological-brain-sciences': { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-800 ring-rose-200' },
}

function DeptBadge({ dept }) {
  const s = DEPT_STYLES[dept] ?? { dot: 'bg-stone-400', pill: 'bg-stone-100 text-stone-600 ring-stone-200' }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px]
                  font-semibold ring-1 ring-inset leading-none ${s.pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {deptLabel(dept)}
    </span>
  )
}

/* ── Bookmark icon ────────────────────────────────────────── */
function BookmarkIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[15px] h-[15px]">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
         className="w-[15px] h-[15px]">
      <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
    </svg>
  )
}

/* ── External link icon ───────────────────────────────────── */
function ExtIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-60 flex-shrink-0">
      <path d="M3.5 3a.5.5 0 0 0 0 1H7.29L2.15 9.15a.5.5 0 1 0 .7.7L8 4.71V8.5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5h-5Z" />
    </svg>
  )
}

/* ── Card ─────────────────────────────────────────────────── */
export default function ProfCard({ prof, tokens = [] }) {
  const { toggleSave, isSaved } = useApp()
  const navigate = useNavigate()
  const saved    = isSaved(prof.id)
  const snippet  = (prof.research_summary ?? '').slice(0, 300)

  function handleTrack(e) {
    e.preventDefault()
    navigate('/tracker', {
      state: {
        prefill: {
          professorName: prof.name || '',
          labName:       '',
          department:    prof.department || '',
          researchArea:  (prof.scholar_interests ?? []).slice(0, 3).join(', '),
          sourceLink:    prof.profile_url || '',
          status:        'Not Started',
        },
      },
    })
  }

  return (
    <article
      className="group bg-cream-50 rounded-2xl border border-cream-300
                 shadow-sm shadow-stone-900/[0.04]
                 hover:shadow-xl hover:shadow-stone-900/[0.09]
                 hover:border-stone-300 hover:-translate-y-1
                 transition-all duration-200 flex flex-col overflow-hidden"
    >

      {/* ── Card header ──────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-2 px-5 pt-5 pb-4">
        <DeptBadge dept={prof.department} />
        <button
          onClick={() => toggleSave(prof.id)}
          title={saved ? 'Remove from saved' : 'Save professor'}
          className={`flex-shrink-0 p-1.5 rounded-lg transition-all duration-150
                      active:scale-90 ${
            saved
              ? 'text-maroon-700 bg-maroon-100 hover:bg-maroon-200'
              : 'text-stone-300 hover:text-maroon-700 hover:bg-maroon-50'
          }`}
        >
          <BookmarkIcon filled={saved} />
        </button>
      </div>

      {/* ── Name + title ─────────────────────────────────────── */}
      <div className="px-5 pb-4 flex items-start gap-3">
        {prof.photo_url ? (
          <img
            src={prof.photo_url}
            alt=""
            className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-1 ring-cream-300"
          />
        ) : (
          <div className="w-11 h-11 rounded-full bg-cream-200 border border-cream-300
                          flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-semibold text-stone-400">
              {(prof.name || '?')[0]}
            </span>
          </div>
        )}
        <div className="min-w-0">
          <Link
            to={`/prof/${prof.id}`}
            className="font-display font-bold text-stone-900 text-[17px] leading-snug
                       hover:text-maroon-700 transition-colors duration-150 block mb-1.5"
          >
            <Highlight text={prof.name} tokens={tokens} />
          </Link>
          {prof.title && (
            <p className="text-[12px] text-stone-400 leading-snug line-clamp-2 italic">
              {prof.title}
            </p>
          )}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────────── */}
      <div className="h-px bg-cream-300 mx-5" />

      {/* ── Research snippet ─────────────────────────────────── */}
      <div className="flex-1 px-5 py-4">
        {snippet ? (
          <p className="text-[13px] text-stone-600 leading-[1.75] line-clamp-4">
            <Highlight text={snippet} tokens={tokens} />
            {(prof.research_summary ?? '').length > 300 && (
              <span className="text-stone-400"> &hellip;</span>
            )}
          </p>
        ) : (
          <p className="text-xs text-stone-400 italic leading-relaxed">
            No research summary available.
          </p>
        )}
      </div>

      {/* ── Footer actions ───────────────────────────────────── */}
      <div className="px-5 py-3.5 bg-cream-100/80 border-t border-cream-300
                      flex items-center gap-2 flex-wrap">
        {prof.profile_url && (
          <a
            href={prof.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                       rounded-lg bg-maroon-700 text-cream-100 hover:bg-maroon-600
                       transition-colors font-semibold"
          >
            Profile
            <ExtIcon />
          </a>
        )}
        {prof.lab_website && (
          <a
            href={prof.lab_website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                       rounded-lg border border-cream-400 text-stone-600
                       hover:border-maroon-300 hover:text-maroon-700
                       hover:bg-maroon-50 transition-colors font-medium"
          >
            Lab
            <ExtIcon />
          </a>
        )}
        {prof.google_scholar && (
          <a
            href={prof.google_scholar}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                       rounded-lg border border-cream-400 text-stone-600
                       hover:border-maroon-300 hover:text-maroon-700
                       hover:bg-maroon-50 transition-colors font-medium"
          >
            Scholar
            <ExtIcon />
          </a>
        )}
        <button
          onClick={handleTrack}
          title="Track this application"
          className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                     rounded-lg border border-cream-400 text-stone-600
                     hover:border-maroon-300 hover:text-maroon-700
                     hover:bg-maroon-50 transition-colors font-medium"
        >
          <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-70">
            <path d="M6.5 1.5a.5.5 0 0 0-1 0v4h-4a.5.5 0 0 0 0 1h4v4a.5.5 0 0 0 1 0v-4h4a.5.5 0 0 0 0-1h-4v-4Z" />
          </svg>
          Track
        </button>
        <Link
          to={`/prof/${prof.id}`}
          className="text-[11px] px-3 py-1.5 rounded-lg text-stone-400
                     hover:text-maroon-700 hover:bg-cream-200
                     transition-colors font-medium ml-auto"
        >
          Details →
        </Link>
      </div>
    </article>
  )
}
