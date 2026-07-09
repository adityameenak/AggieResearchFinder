import { SCHOOL_LIST } from '../schools'
import SchoolCard from '../components/SchoolCard'
import USMap from '../components/USMap'

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
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

          <p className="text-center text-xs text-stone-400 mt-12">
            Don't see your school? More universities are being added — open an issue on GitHub.
          </p>
        </div>
      </main>
    </div>
  )
}
