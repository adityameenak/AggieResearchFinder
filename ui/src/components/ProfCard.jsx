import { Link } from 'react-router-dom'
import { useApp } from '../AppContext'
import { useSchoolPath } from '../SchoolContext'
import { highlightSegments, deptLabel, isActiveLab, splitResearch, deptStyle } from '../utils/search'

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
function DeptBadge({ dept }) {
  const s = deptStyle(dept)
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
  const tx       = useSchoolPath()
  const saved    = isSaved(prof.id, prof)
  const { summary, keywords } = splitResearch(prof)

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
        <div className="flex flex-wrap items-center gap-1.5">
          <DeptBadge dept={prof.department} />
          {isActiveLab(prof) && (
            <span
              title="Has a lab website or Google Scholar profile — an active research group"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px]
                         font-semibold ring-1 ring-inset leading-none
                         bg-emerald-50 text-emerald-800 ring-emerald-200"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              Active lab
            </span>
          )}
        </div>
        <button
          onClick={() => toggleSave(prof)}
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
            to={tx(`/prof/${prof.id}`)}
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

      {/* ── Research preview + keyword tags ──────────────────── */}
      <div className="flex-1 px-5 py-4">
        {summary ? (
          <p className="text-[13px] text-stone-600 leading-[1.7] line-clamp-3">
            <Highlight text={summary} tokens={tokens} />
          </p>
        ) : keywords.length === 0 ? (
          <p className="text-xs text-stone-400 italic leading-relaxed">
            {isActiveLab(prof)
              ? 'No summary captured — see their lab site or Scholar profile below for research details.'
              : 'No research summary available.'}
          </p>
        ) : null}

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {keywords.map((k, i) => (
              <span
                key={i}
                className="inline-block px-2 py-0.5 rounded-md bg-cream-200
                           text-[10.5px] font-medium text-stone-600 leading-tight"
              >
                {k}
              </span>
            ))}
          </div>
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
        <Link
          to={tx(`/prof/${prof.id}`)}
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
