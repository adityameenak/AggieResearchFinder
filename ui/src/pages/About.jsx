import { Link } from 'react-router-dom'
import { useApp } from '../AppContext'
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

const DEPTS = [
  'Aerospace Engineering',
  'Biology',
  'Biomedical Engineering',
  'Chemical Engineering',
  'Chemistry',
  'Civil & Environmental Engineering',
  'Computer Science & Engineering',
  'Electrical & Computer Engineering',
  'Engineering Technology & Industrial Distribution',
  'Industrial & Systems Engineering',
  'Materials Science & Engineering',
  'Mathematics',
  'Mechanical Engineering',
  'Nuclear Engineering',
  'Ocean Engineering',
  'Oceanography',
  'Petroleum Engineering',
  'Physics & Astronomy',
  'Psychological & Brain Sciences',
  'Statistics',
]

export default function About() {
  const { faculty } = useApp()

  return (
    <div className="bg-cream-100">

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="relative bg-cream-50 border-b border-cream-300 overflow-hidden">
        <div className="absolute inset-0 dot-texture opacity-60 pointer-events-none" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <SectionEyebrow>About the project</SectionEyebrow>
          <h1
            className="font-display font-bold text-stone-900 text-4xl sm:text-5xl
                       tracking-tight leading-[1.12] mb-6"
            style={{ opacity: 0, animation: 'heroFadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.05s forwards' }}
          >
            Built for Curious{' '}
            <em className="not-italic text-maroon-700">Aggies</em>
          </h1>
          <p
            className="text-lg text-stone-600 leading-relaxed max-w-2xl"
            style={{ opacity: 0, animation: 'heroFadeUp 0.6s cubic-bezier(0.16,1,0.3,1) 0.25s forwards' }}
          >
            ResearchFinder started with a simple frustration: finding a research
            mentor at Texas A&amp;M should not require clicking through ten separate
            department websites. This tool fixes that.
          </p>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────── */}
      <section className="bg-maroon-700 py-10 border-b border-maroon-900/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-3 gap-6 sm:gap-12">
            {[
              { number: faculty.length || '553', label: 'Faculty indexed' },
              { number: '20',  label: 'STEM departments' },
              { number: '0',   label: 'Logins required' },
            ].map(({ number, label }) => (
              <div key={label} className="text-center">
                <div className="font-display font-bold text-4xl text-cream-100 mb-1">
                  {number}
                </div>
                <div className="text-sm text-maroon-300">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why it exists ─────────────────────────────────── */}
      <section className="py-20 bg-white border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">

            <Reveal from="left">
              <SectionEyebrow>The problem</SectionEyebrow>
              <h2 className="font-display font-bold text-stone-900 text-3xl
                              tracking-tight leading-tight mb-5">
                Research discovery is broken
              </h2>
              <div className="space-y-4 text-[15px] text-stone-600 leading-relaxed">
                <p>
                  Each TAMU STEM department maintains its own faculty directory
                  with its own format, its own URL structure, and its own level of
                  detail. Some have rich research summaries; others have barely a title.
                </p>
                <p>
                  Students looking for research opportunities — especially undergrads and
                  incoming graduate students — have no good starting point. The university
                  search tools are generic. Google is noisy.
                </p>
                <p>
                  ResearchFinder normalises{' '}
                  <span className="font-semibold text-stone-800">{faculty.length || 553}</span>
                  {' '}profiles into a single searchable index ranked by research-area relevance.
                </p>
              </div>
            </Reveal>

            <Reveal from="right" delay={150}>
              <SectionEyebrow>The approach</SectionEyebrow>
              <h2 className="font-display font-bold text-stone-900 text-3xl
                              tracking-tight leading-tight mb-5">
                Crawl once, search instantly
              </h2>
              <div className="space-y-4 text-[15px] text-stone-600 leading-relaxed">
                <p>
                  A Playwright-driven crawler visits every department directory, follows
                  each profile link, and extracts name, title, email, research interests,
                  and lab website — storing results in a flat JSON file.
                </p>
                <p>
                  The UI is entirely static. There is no backend, no database, no auth.
                  The dataset loads once; all filtering and ranking happens client-side
                  in milliseconds.
                </p>
                <p>
                  Re-running the crawler at the start of each semester keeps the index
                  current. The whole pipeline fits in a single Python file.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Departments ───────────────────────────────────── */}
      <section className="py-20 bg-cream-200 border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Coverage</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-3xl
                            tracking-tight mb-3">
              20 departments, one search
            </h2>
            <p className="text-[15px] text-stone-500 mb-10">
              Engineering, science, and applied STEM departments at TAMU — all indexed.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DEPTS.map((d, i) => (
              <Reveal key={d} delay={i * 50}>
                <div className="flex items-center gap-3 bg-cream-50 rounded-xl
                                border border-cream-300 px-4 py-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-maroon-700 flex-shrink-0" />
                  <span className="text-sm text-stone-700 font-medium">{d}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────── */}
      <section className="py-20 bg-white border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Under the hood</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-3xl
                            tracking-tight mb-12">
              How the pipeline works
            </h2>
          </Reveal>

          <div className="space-y-5">
            {[
              {
                n: '01',
                title: 'Seed URLs',
                body: 'Twenty department profile-index URLs are stored in seeds.txt. The crawler iterates each one, following pagination if present.',
              },
              {
                n: '02',
                title: 'Disk-cached fetching',
                body: 'Each fetched page is cached to .cache/ keyed by MD5 of the URL. Subsequent runs are nearly instant; only new pages hit the network.',
              },
              {
                n: '03',
                title: 'Profile extraction',
                body: 'BeautifulSoup parses each profile page. Research summaries are extracted via four CSS selector strategies with graceful fallbacks.',
              },
              {
                n: '04',
                title: 'Stable IDs',
                body: "Each professor's ID is the first 12 characters of MD5(profile_url). Saved-professor lists remain valid across crawler re-runs.",
              },
              {
                n: '05',
                title: 'Client-side ranking',
                body: 'The UI tokenises queries and scores each professor by term frequency across name, title, and research summary fields — no server needed.',
              },
            ].map(({ n, title, body }, i) => (
              <Reveal key={n} delay={i * 70}>
                <div className="flex gap-6 items-start bg-cream-50 rounded-2xl
                                border border-cream-300 p-6">
                  <span className="font-display font-bold text-5xl text-cream-300
                                   leading-none flex-shrink-0 select-none mt-0.5">
                    {n}
                  </span>
                  <div>
                    <h3 className="font-semibold text-stone-900 text-base mb-1.5">
                      {title}
                    </h3>
                    <p className="text-[14px] text-stone-600 leading-relaxed">{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech stack ────────────────────────────────────── */}
      <section className="py-20 bg-stone-950 border-b border-stone-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Tech stack</SectionEyebrow>
            <h2 className="font-display font-bold text-cream-100 text-3xl
                            tracking-tight mb-3">
              Simple tools, deliberately chosen
            </h2>
            <p className="text-stone-400 text-[15px] leading-relaxed mb-10 max-w-xl">
              No frameworks chosen for prestige — only for how well they fit a project
              that is mostly data and a search box.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                label: 'Crawler',
                pills: ['Python 3.11', 'Playwright', 'BeautifulSoup4', 'asyncio'],
                desc: 'Async browser automation handles JS-rendered pages. BeautifulSoup parses the HTML. The whole crawler is ~200 lines.',
              },
              {
                label: 'Frontend',
                pills: ['Vite 5', 'React 18', 'React Router v6', 'Tailwind CSS 3'],
                desc: 'Vite for near-instant HMR. React for state. Tailwind for the design system. No component library dependencies.',
              },
              {
                label: 'Typography',
                pills: ['Playfair Display', 'Inter', 'Google Fonts'],
                desc: 'Playfair Display for editorial headings — academic gravitas without looking dated. Inter for all UI copy.',
              },
              {
                label: 'Data',
                pills: ['faculty.json', 'localStorage', 'No backend'],
                desc: 'A single flat JSON file. Saved professors persist to localStorage. Zero network requests after the initial page load.',
              },
            ].map(({ label, pills, desc }, i) => (
              <Reveal key={label} delay={i * 80}>
                <div className="bg-stone-900 rounded-2xl border border-stone-800 p-6">
                  <div className="text-[11px] font-semibold text-stone-500 uppercase
                                  tracking-[0.14em] mb-3">
                    {label}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {pills.map(p => (
                      <span key={p}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-md
                                       text-[11px] font-medium bg-stone-800 text-stone-300
                                       border border-stone-700">
                        {p}
                      </span>
                    ))}
                  </div>
                  <p className="text-[13px] text-stone-400 leading-relaxed">{desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Limitations ───────────────────────────────────── */}
      <section className="py-20 bg-cream-50 border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Limitations</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-3xl
                            tracking-tight mb-10">
              What this tool is not
            </h2>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                title: 'Not real-time',
                body: 'The dataset reflects the last crawler run. New hires or changes may lag by a semester.',
              },
              {
                title: 'Not exhaustive',
                body: 'Twenty STEM departments are indexed. Business, architecture, law, and other colleges are currently out of scope.',
              },
              {
                title: 'Not affiliated',
                body: 'This is an independent student project and is not endorsed by or affiliated with Texas A&M University.',
              },
            ].map(({ title, body }, i) => (
              <Reveal key={title} delay={i * 80}>
                <div className="bg-cream-100 rounded-2xl border border-cream-300 p-6">
                  <div className="w-2 h-2 rounded-full bg-maroon-700 mb-4" />
                  <h3 className="font-semibold text-stone-900 text-sm mb-2">{title}</h3>
                  <p className="text-[13px] text-stone-500 leading-relaxed">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={300}>
            <p className="text-sm text-stone-500 mt-8 leading-relaxed">
              For authoritative faculty information, visit the official{' '}
              <a
                href="https://engineering.tamu.edu"
                target="_blank"
                rel="noopener noreferrer"
                className="text-maroon-700 hover:underline font-medium"
              >
                TAMU College of Engineering
              </a>{' '}
              website.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── About the Builders ────────────────────────────── */}
      <section className="py-24 bg-white border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">

          {/* Heading + intro */}
          <Reveal>
            <SectionEyebrow>The team</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-3xl
                            tracking-tight leading-tight mb-5">
              About the Builders
            </h2>
            <p className="text-[15px] text-stone-600 leading-relaxed max-w-2xl mb-14">
              Aggie Research Finder was built to make undergraduate research easier to discover
              and pursue. As students, we saw how difficult it could be to navigate faculty
              pages, understand what different labs actually work on, and confidently reach out
              to professors. We wanted to create a platform that connects students with research
              opportunities based on genuine interests and makes the first step into research
              far more approachable.
            </p>
          </Reveal>

          {/* Profile cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-14">
            <BuilderCard
              initials="AM"
              name="Aditya Meenakshisundaram"
              role="Chemical Engineering Student, Texas A&M University"
              bio="Aditya is a chemical engineering student focused on semiconductor materials, energy technologies, and applied research. He built Aggie Research Finder to help students discover meaningful research opportunities without the friction and uncertainty that often come with the traditional search process. His goal is to make research exploration clearer, faster, and more accessible for students across campus."
              linkedinUrl="https://www.linkedin.com/in/adityameenakshi/"
              from="left"
              delay={0}
            />
            <BuilderCard
              initials="AV"
              name="Arun Vaithianathan"
              role="Chemical Engineering Student, Texas A&M University"
              bio="Arun is a chemical engineering student with experience in materials research, control systems, and energy entrepreneurship. His work spans graphite synthesis for battery applications, control system design for autonomous systems, and technology commercialization through the TEX-E energy entrepreneurship program. Through Aggie Research Finder, he wanted to simplify how students discover research labs and connect their interests with real-world technical work."
              linkedinUrl="https://www.linkedin.com/in/akvaithi/"
              from="right"
              delay={100}
            />
          </div>

          {/* Closing mission paragraph */}
          <Reveal delay={200}>
            <div className="max-w-2xl mx-auto text-center">
              <span className="block w-8 h-px bg-cream-400 mx-auto mb-6" />
              <p className="text-[15px] text-stone-600 leading-relaxed">
                At its core, Aggie Research Finder is about lowering the barrier to entry.
                We built it to help students move from curiosity to action — and make it
                easier for more people to find research they are genuinely excited about.
              </p>
            </div>
          </Reveal>

        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────── */}
      <section className="bg-maroon-800 py-20">
        <Reveal>
          <div className="max-w-2xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="font-display font-bold text-cream-100 text-3xl
                            tracking-tight mb-4">
              Ready to find your research mentor?
            </h2>
            <p className="text-maroon-300 text-[15px] mb-8 leading-relaxed">
              Search {faculty.length || 553} TAMU Engineering faculty by research interest,
              department, or keyword — in seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/search"
                className="inline-flex items-center gap-2 px-8 py-3.5 bg-cream-100
                           hover:bg-white text-maroon-800 text-sm font-semibold
                           rounded-xl transition-colors shadow-lg shadow-maroon-950/30"
              >
                Search Faculty →
              </Link>
              <Link
                to="/"
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
