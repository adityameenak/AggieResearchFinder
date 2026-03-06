import { Link } from 'react-router-dom'
import { useApp } from '../AppContext'
import Reveal from '../components/Reveal'

/* ── Abstract compass / academic seal decoration ─────────── */
function CompassSVG() {
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const angle   = (i * 10 * Math.PI) / 180
    const isMajor = i % 9 === 0
    const r1      = isMajor ? 272 : 279
    const r2      = 288
    return {
      x1: 300 + r1 * Math.cos(angle),
      y1: 300 + r1 * Math.sin(angle),
      x2: 300 + r2 * Math.cos(angle),
      y2: 300 + r2 * Math.sin(angle),
      isMajor,
    }
  })

  return (
    <svg
      width="600"
      height="600"
      viewBox="0 0 600 600"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Concentric rings */}
      {[290, 225, 165, 105, 52, 22].map(r => (
        <circle
          key={r}
          cx="300"
          cy="300"
          r={r}
          stroke="#500000"
          strokeWidth={r === 290 ? 1 : 0.75}
        />
      ))}
      {/* Cardinal crosshairs */}
      <line x1="300" y1="8"   x2="300" y2="592" stroke="#500000" strokeWidth="0.6" />
      <line x1="8"   y1="300" x2="592" y2="300" stroke="#500000" strokeWidth="0.6" />
      {/* 45° diagonals */}
      <line x1="88"  y1="88"  x2="512" y2="512" stroke="#500000" strokeWidth="0.4" opacity="0.6" />
      <line x1="512" y1="88"  x2="88"  y2="512" stroke="#500000" strokeWidth="0.4" opacity="0.6" />
      {/* Tick marks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1} y1={t.y1}
          x2={t.x2} y2={t.y2}
          stroke="#500000"
          strokeWidth={t.isMajor ? 1.5 : 0.75}
        />
      ))}
    </svg>
  )
}

/* ── Feature cards data ───────────────────────────────────── */
const FEATURES = [
  {
    num: '01',
    title: 'Enter Your Interests',
    body: 'Type keywords — machine learning, battery materials, structural health, anything that captures your curiosity. The more specific, the better the match.',
  },
  {
    num: '02',
    title: 'Discover Matching Faculty',
    body: "Results are instantly ranked by relevance, with your search terms highlighted directly in each professor's research summary so you see exactly why they matched.",
  },
  {
    num: '03',
    title: 'Connect Directly',
    body: "Jump to a professor's faculty page, lab website, or email in one click — no more navigating separate department directories.",
  },
]

const WHO = [
  {
    label: 'For undergrads',
    text: 'Discover professors to reach out to for research assistant positions — before your peers find them first.',
  },
  {
    label: 'For grad students',
    text: 'Scope potential advisors across departments you might not have considered, and compare their research focus at a glance.',
  },
  {
    label: 'For everyone',
    text: "Understand the full landscape of engineering research happening on campus. It's more diverse than you'd expect.",
  },
]

/* ── Page ─────────────────────────────────────────────────── */
export default function Home() {
  const { faculty, departments, loading } = useApp()

  return (
    <div className="flex flex-col">

      {/* ══════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════ */}
      <section className="relative min-h-[91vh] flex items-center overflow-hidden bg-cream-100">
        {/* Dot grid texture */}
        <div className="absolute inset-0 dot-texture pointer-events-none" />

        {/* Compass decoration — right side */}
        <div
          className="absolute right-[-60px] sm:right-[20px] lg:right-[80px]
                     top-1/2 -translate-y-1/2 opacity-[0.055] pointer-events-none
                     select-none hidden sm:block"
        >
          <CompassSVG />
        </div>

        {/* Subtle vignette */}
        <div className="absolute inset-0 bg-gradient-to-r from-cream-100 via-cream-100/80
                        to-transparent pointer-events-none" />

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-24 w-full">
          <div className="max-w-[640px]">

            {/* Eyebrow */}
            <div className="hero-animate-1 flex items-center gap-2.5 mb-7">
              <span className="w-6 h-px bg-maroon-700" />
              <span className="text-xs font-semibold text-maroon-700 uppercase tracking-[0.18em]">
                Texas A&amp;M Engineering
              </span>
            </div>

            {/* Headline */}
            <h1 className="hero-animate-2 font-display font-bold text-stone-900
                           leading-[1.06] tracking-tight mb-6
                           text-[3.2rem] sm:text-[4.2rem] lg:text-[5rem]">
              Find where your<br />
              <em className="not-italic text-maroon-700">curiosity</em>{' '}
              belongs.
            </h1>

            {/* Subtitle */}
            <p className="hero-animate-3 text-[17px] text-stone-600 leading-relaxed
                          max-w-[500px] mb-10">
              {loading ? (
                'Loading faculty data…'
              ) : (
                <>
                  TAMUResearchFinder indexes{' '}
                  <span className="font-semibold text-stone-900">{faculty.length}</span>{' '}
                  faculty profiles across{' '}
                  <span className="font-semibold text-stone-900">{departments.length}</span>{' '}
                  engineering departments. Enter your interests and instantly
                  discover professors, labs, and research areas doing exactly
                  that work.
                </>
              )}
            </p>

            {/* CTAs */}
            <div className="hero-animate-4 flex flex-col sm:flex-row gap-3">
              <Link
                to="/search"
                className="inline-flex items-center justify-center gap-2.5 px-8 py-3.5
                           bg-maroon-700 text-cream-100 rounded-xl font-semibold text-sm
                           hover:bg-maroon-600 transition-all duration-200
                           shadow-lg shadow-maroon-950/25
                           hover:shadow-xl hover:shadow-maroon-950/30
                           hover:-translate-y-0.5 active:translate-y-0"
              >
                Start Searching
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center px-8 py-3.5
                           border border-stone-300 text-stone-700 rounded-xl
                           font-semibold text-sm hover:border-stone-400
                           hover:bg-cream-200 transition-all duration-200"
              >
                How it works
              </a>
            </div>
          </div>
        </div>

        {/* Bottom fade into next section */}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t
                        from-maroon-700 to-transparent pointer-events-none opacity-20" />
      </section>


      {/* ══════════════════════════════════════════════════════
          STATS
      ══════════════════════════════════════════════════════ */}
      <section className="relative bg-maroon-700 py-14 px-6 overflow-hidden">
        <div className="absolute inset-0 dot-texture-light pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <div className="grid grid-cols-3 gap-4 sm:gap-8 text-center">
            {[
              {
                val:   loading ? '—' : faculty.length,
                label: 'Faculty profiles indexed',
              },
              {
                val:   loading ? '—' : departments.length,
                label: 'Engineering departments',
              },
              { val: 'Free', label: 'No login required' },
            ].map(({ val, label }, i) => (
              <Reveal key={label} from="bottom" delay={i * 80}>
                <div
                  className="font-display font-bold text-cream-100 mb-1.5
                             text-4xl sm:text-5xl"
                >
                  {val}
                </div>
                <div className="text-xs sm:text-sm text-maroon-300 tracking-wide">
                  {label}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="bg-white py-20 px-6">
        <div className="max-w-5xl mx-auto">

          <Reveal from="bottom">
            <div className="text-center mb-14">
              <span className="text-xs font-semibold text-maroon-700 uppercase
                               tracking-[0.18em]">
                How it works
              </span>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-stone-900
                             mt-3 tracking-tight leading-tight">
                Three steps to your<br className="hidden sm:inline" />
                {' '}next research opportunity
              </h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map(({ num, title, body }, i) => (
              <Reveal key={num} from="bottom" delay={i * 100}>
                <div
                  className="group relative p-8 rounded-2xl bg-cream-100 border
                             border-cream-300 hover:border-maroon-300 hover:bg-cream-50
                             transition-all duration-300 hover:shadow-md
                             hover:shadow-maroon-900/[0.06]"
                >
                  <div
                    className="font-display font-bold text-[52px] leading-none
                               text-stone-200 mb-5 group-hover:text-maroon-200
                               transition-colors duration-300 select-none"
                  >
                    {num}
                  </div>
                  <h3 className="font-semibold text-stone-900 text-[15px] mb-2">
                    {title}
                  </h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal from="bottom" delay={300}>
            <div className="text-center mt-12">
              <Link
                to="/search"
                className="inline-flex items-center gap-2 px-7 py-3 bg-maroon-700
                           text-cream-100 rounded-xl font-semibold text-sm
                           hover:bg-maroon-600 transition-colors shadow-sm"
              >
                Try it now →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          WHY THIS EXISTS
      ══════════════════════════════════════════════════════ */}
      <section className="bg-cream-200 py-20 px-6">
        <div className="max-w-3xl mx-auto">

          <Reveal from="bottom">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-5 h-px bg-maroon-700" />
              <span className="text-xs font-semibold text-maroon-700 uppercase
                               tracking-[0.18em]">
                Why we built this
              </span>
            </div>
          </Reveal>

          <Reveal from="bottom" delay={80}>
            <blockquote
              className="font-display font-bold text-stone-900 leading-tight
                         tracking-tight mb-8 border-l-[3px] border-maroon-700 pl-6
                         text-[1.9rem] sm:text-[2.5rem]"
            >
              "Finding research opportunities at Texas A&amp;M shouldn't
              require a map."
            </blockquote>
          </Reveal>

          <Reveal from="bottom" delay={160}>
            <div className="pl-6 space-y-4 text-stone-600 text-[15px] leading-relaxed">
              <p>
                Texas A&amp;M's College of Engineering employs over 550 researchers
                across 10 departments — each with its own directory, formatting, and
                level of detail. Finding a faculty member whose work aligns with your
                specific interests means manually navigating dozens of pages with no
                way to search or compare across departments at once.
              </p>
              <p>
                For undergraduates looking for research positions, graduate students
                scoping advisors, or anyone trying to understand what's being studied
                at TAMU Engineering — the current discovery experience is fragmented
                and frustrating. TAMUResearchFinder fixes that.
              </p>
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          EDITORIAL — BUILT FOR CURIOUS AGGIES
      ══════════════════════════════════════════════════════ */}
      <section className="relative bg-stone-950 py-20 px-6 overflow-hidden">
        <div className="absolute inset-0 dot-texture-light pointer-events-none" />

        <div className="relative max-w-5xl mx-auto flex flex-col md:flex-row
                        items-start gap-14 md:gap-20">

          {/* Left */}
          <Reveal from="left" className="flex-1">
            <span className="text-xs font-semibold text-maroon-400 uppercase
                             tracking-[0.18em] mb-4 block">
              Built for curious Aggies
            </span>
            <h2
              className="font-display font-bold text-cream-100 leading-tight
                         tracking-tight mb-6 text-[1.9rem] sm:text-[2.5rem]"
            >
              Research discovery
              <br />should feel effortless.
            </h2>
            <p className="text-stone-400 text-[15px] leading-relaxed max-w-sm">
              Every great research career starts with a connection between
              a student's curiosity and a professor's expertise. We built
              TAMUResearchFinder to make that connection faster, more
              accessible, and genuinely serendipitous.
            </p>
          </Reveal>

          {/* Right — who it's for */}
          <Reveal from="right" delay={100} className="flex-1">
            <div className="space-y-7">
              {WHO.map(({ label, text }) => (
                <div key={label} className="flex gap-4">
                  <div className="w-[3px] flex-shrink-0 rounded-full bg-maroon-700 mt-1" />
                  <div>
                    <div className="text-sm font-semibold text-cream-300 mb-1">
                      {label}
                    </div>
                    <div className="text-sm text-stone-400 leading-relaxed">{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>


      {/* ══════════════════════════════════════════════════════
          CTA BANNER
      ══════════════════════════════════════════════════════ */}
      <section className="bg-maroon-800 py-16 px-6">
        <Reveal>
          <div className="max-w-2xl mx-auto text-center">
            <h2
              className="font-display font-bold text-cream-100 tracking-tight
                         leading-tight mb-4 text-[1.9rem] sm:text-[2.6rem]"
            >
              Ready to find your
              <br />research match?
            </h2>
            <p className="text-maroon-200 text-sm mb-8 max-w-md mx-auto leading-relaxed">
              Search {loading ? '553+' : faculty.length} faculty profiles across
              Texas A&amp;M Engineering. No account. No forms. Just results.
            </p>
            <Link
              to="/search"
              className="inline-flex items-center gap-2.5 px-9 py-4 bg-cream-100
                         text-maroon-800 rounded-xl font-bold text-sm
                         hover:bg-cream-50 transition-all duration-200
                         shadow-lg shadow-maroon-950/40
                         hover:-translate-y-0.5 active:translate-y-0"
            >
              Search Faculty
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </Reveal>
      </section>

    </div>
  )
}
