import { Link } from 'react-router-dom'
import { useSchool, useSchoolPath } from '../SchoolContext'
import Reveal from '../components/Reveal'

/* ── LinkedIn icon ────────────────────────────────────────── */
function LinkedInIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-4 h-4"
      aria-hidden="true"
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
}

/* ── Builder card ─────────────────────────────────────────── */
function BuilderCard({ initials, name, role, bio, linkedinUrl, delay = 0, from = 'left' }) {
  return (
    <Reveal from={from} delay={delay}>
      <div
        className="flex flex-col bg-cream-50 rounded-2xl border border-cream-300
                   p-7 transition-all duration-200 ease-out
                   hover:shadow-[0_8px_30px_rgb(0,0,0,0.07)] hover:-translate-y-0.5"
      >
        {/* Avatar */}
        <div
          className="w-14 h-14 rounded-full bg-maroon-700 flex items-center
                     justify-center mb-5 flex-shrink-0"
        >
          <span className="font-display font-bold text-xl text-cream-100 select-none">
            {initials}
          </span>
        </div>

        {/* Identity */}
        <div className="mb-4">
          <h3 className="font-display font-bold text-stone-900 text-[1.2rem]
                         leading-snug tracking-tight mb-1">
            {name}
          </h3>
          <p className="text-[11px] font-semibold text-maroon-700 uppercase
                        tracking-[0.12em]">
            {role}
          </p>
        </div>

        {/* Bio */}
        <p className="text-[14px] text-stone-600 leading-relaxed flex-1 mb-6">
          {bio}
        </p>

        {/* LinkedIn */}
        <a
          href={linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium
                     text-stone-400 hover:text-maroon-700 transition-colors duration-150
                     w-fit"
        >
          <LinkedInIcon />
          LinkedIn Profile
        </a>
      </div>
    </Reveal>
  )
}

/* ── Section eyebrow ──────────────────────────────────────── */
function SectionEyebrow({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span className="w-4 h-px bg-maroon-700" />
      <span className="text-xs font-semibold text-maroon-700 uppercase tracking-[0.16em]">
        {children}
      </span>
    </div>
  )
}

/* Shared, school-agnostic About page. The per-school Home pages cover the
 * problem / coverage / stats; this page is simply who built it and why. */
export default function About() {
  const school = useSchool()
  const tx     = useSchoolPath()

  return (
    <div className="bg-cream-100">

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative bg-cream-50 border-b border-cream-300 overflow-hidden">
        <div className="absolute inset-0 dot-texture opacity-60 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <SectionEyebrow>About</SectionEyebrow>
          <h1
            className="font-display font-bold text-stone-900 text-4xl sm:text-5xl
                       tracking-tight leading-[1.12] mb-6"
            style={{ opacity: 0, animation: 'heroFadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.05s forwards' }}
          >
            Two students making research{' '}
            <em className="not-italic text-maroon-700">findable</em>
          </h1>
          <p
            className="text-lg text-stone-600 leading-relaxed max-w-2xl"
            style={{ opacity: 0, animation: 'heroFadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.25s forwards' }}
          >
            The Texas STEM Research Finder grew out of a simple frustration: finding
            a research mentor shouldn't mean clicking through dozens of department
            pages. We built one place to search faculty across Texas universities by
            what they actually work on — and to make that first email easier to send.
          </p>
        </div>
      </section>

      {/* ── The builders ──────────────────────────────────── */}
      <section className="py-24 bg-white border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          <Reveal>
            <SectionEyebrow>The team</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-3xl
                            tracking-tight leading-tight mb-5">
              Meet the builders
            </h2>
            <p className="text-[15px] text-stone-600 leading-relaxed max-w-2xl mb-14">
              We're two engineering students who kept hitting the same wall trying to
              get into research — faculty pages scattered across departments, no easy
              way to tell what a lab actually works on, and a blank-page moment every
              time it came to reaching out. So we built the tool we wished we'd had,
              and have been expanding it across Texas universities since.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-14">
            <BuilderCard
              initials="AM"
              name="Aditya Meenakshisundaram"
              role="Chemical Engineering Student, Texas A&M University"
              bio="Aditya is a chemical engineering student focused on semiconductor materials, energy technologies, and applied research. He built the original Aggie Research Finder to help students discover meaningful research opportunities without the friction of the traditional search — work that has since grown into the multi-university Texas STEM Research Finder."
              linkedinUrl="https://www.linkedin.com/in/adityameenakshi/"
              from="left"
              delay={0}
            />
            <BuilderCard
              initials="AV"
              name="Arun Vaithianathan"
              role="Chemical Engineering Student, Texas A&M University"
              bio="Arun is a chemical engineering student with experience in materials research, control systems, and energy entrepreneurship — from graphite synthesis for batteries to control-system design and the TEX-E energy entrepreneurship program. He works on making research labs easier to discover and connect with across schools."
              linkedinUrl="https://www.linkedin.com/in/akvaithi/"
              from="right"
              delay={100}
            />
          </div>

          <Reveal delay={200}>
            <div className="max-w-2xl mx-auto text-center">
              <span className="block w-8 h-px bg-cream-400 mx-auto mb-6" />
              <p className="text-[15px] text-stone-600 leading-relaxed">
                At its core, this project is about lowering the barrier to entry —
                helping students and researchers at every level move from curiosity
                to a first conversation with a lab they're genuinely excited about.
              </p>
            </div>
          </Reveal>

        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="bg-maroon-800 py-16">
        <Reveal>
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="font-display font-bold text-cream-100 text-3xl
                            tracking-tight mb-4">
              Ready to find your research mentor?
            </h2>
            <p className="text-maroon-300 text-[15px] mb-8 leading-relaxed">
              Search {school.shortName} STEM faculty by research interest,
              department, or keyword — in seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to={tx('/search')}
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-cream-100
                           hover:bg-white text-maroon-800 text-sm font-semibold
                           rounded-xl transition-colors shadow-lg shadow-maroon-950/30"
              >
                Search Faculty →
              </Link>
              <Link
                to={tx('/')}
                className="inline-flex items-center gap-2 px-8 py-3.5
                           border border-maroon-600 text-maroon-200 text-sm font-semibold
                           rounded-xl hover:bg-maroon-700 transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

    </div>
  )
}
