import { useState } from 'react'
import { SCHOOL_LIST } from '../schools'
import SchoolCard from '../components/SchoolCard'
import USMap from '../components/USMap'
import Seo from '../components/Seo'
import FeedbackModal from '../components/FeedbackModal'

export default function Landing() {
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Seo />
      {/* Platform accent bar */}
      <div className="h-[3px] bg-gradient-to-r from-indigo-600 via-violet-500 to-purple-600" />

      <main className="flex-1 flex items-start justify-center px-6 py-20">
        <div className="w-full max-w-3xl">

          {/* ── Hero ──────────────────────────────────────────── */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2.5 mb-6">
              <span className="h-px w-5 bg-indigo-400/60" />
              <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-[0.2em]">
                For students &amp; researchers at every level
              </span>
              <span className="h-px w-5 bg-indigo-400/60" />
            </div>
            <h1 className="font-display font-bold text-stone-900 leading-[1.03]
                           text-5xl sm:text-6xl md:text-7xl mb-6">
              <span className="text-indigo-600">STEM</span>{' '}Research Finder
            </h1>
            <p className="text-stone-500 text-lg max-w-xl mx-auto leading-relaxed">
              Find research labs and faculty advisors across universities nationwide —
              search by interest, match your resume, and draft outreach in one click.
            </p>
          </div>

          {/* ── Map section — flush with page ─────────────────── */}
          <div className="mb-14">

            {/* Section header */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-4 h-px bg-stone-300" />
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-[0.22em]">
                  Browse by State
                </span>
              </div>
              <h2 className="font-display font-bold text-stone-900 text-xl sm:text-2xl
                             leading-tight tracking-tight mb-1.5">
                Explore universities across the United States
              </h2>
              <p className="text-sm text-stone-400 leading-relaxed">
                Hover over a state to see available universities, or click to browse by state.
              </p>
            </div>

            {/* Map — no card, sits directly on page background */}
            <USMap />

          </div>

          {/* ── University picker ────────────────────────────── */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-[0.18em]">
              Or pick directly
            </span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCHOOL_LIST.map((school) => (
              <SchoolCard key={school.code} school={school} />
            ))}
          </div>

          {/* Platform-level feedback entry point. Landing has no Footer, and
              this replaces a line that used to send people to GitHub to file
              an issue themselves — the form does that for them now. */}
          <div className="mt-14 rounded-2xl border border-stone-200 bg-white/70
                          px-6 py-7 text-center">
            <p className="font-display font-semibold text-stone-900 text-lg mb-1.5">
              Don't see your school?
            </p>
            <p className="text-sm text-stone-500 mb-5 max-w-md mx-auto leading-relaxed">
              We're adding universities and departments continuously. Tell us which
              one you need and it goes straight to our tracker.
            </p>
            <button
              onClick={() => setFeedbackOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl
                         bg-gradient-to-r from-indigo-600 to-violet-600 text-white
                         font-semibold text-sm shadow-sm
                         hover:from-indigo-500 hover:to-violet-500 transition-all"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.505 2.365A41.4 41.4 0 0 1 10 1.5c2.216 0 4.39.29 6.495.865A1.75 1.75 0 0 1 17.75 4.05v9.4a1.75 1.75 0 0 1-1.255 1.685A41.4 41.4 0 0 1 10 16a41.4 41.4 0 0 1-6.495-.865A1.75 1.75 0 0 1 2.25 13.45v-9.4c0-.795.534-1.49 1.255-1.685Z" />
              </svg>
              Request a school or department
            </button>
          </div>
        </div>
      </main>
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  )
}
