import { Link } from 'react-router-dom'
import { useSchool, useSchoolPath } from '../SchoolContext'
import Reveal from '../components/Reveal'

/* International-student guide: why research matters for funding/visa, how to
 * find a fundable lab, how to reach out. School-aware via useSchool(). Content
 * is general guidance, NOT legal/immigration advice (see disclaimer). */

function SectionEyebrow({ children }) {
  return (
    <div className="text-[11px] font-semibold text-maroon-700 uppercase
                    tracking-[0.18em] mb-3">
      {children}
    </div>
  )
}

const TERMS = [
  ['RA / GRA', 'Graduate Research Assistantship — a paid research position with a faculty PI that usually covers a stipend and tuition. The most common way funded grad students are supported.'],
  ['TA', 'Teaching Assistantship — paid teaching support, also typically with stipend + tuition. Often available in large STEM departments.'],
  ['CPT', 'Curricular Practical Training — work authorization for internships/research tied to your program, used during your studies.'],
  ['OPT', 'Optional Practical Training — up to 12 months of work authorization after graduation in your field.'],
  ['STEM OPT', 'A 24-month extension of OPT for graduates of eligible STEM degrees — 36 months total. This is the single biggest reason a STEM focus matters for international students.'],
]

export default function International() {
  const school = useSchool()
  const tx = useSchoolPath()

  return (
    <div className="bg-cream-50">
      {/* Hero */}
      <section className="bg-maroon-700 text-cream-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
          <Reveal>
            <div className="text-[11px] font-semibold text-maroon-200 uppercase
                            tracking-[0.18em] mb-4">
              For international students
            </div>
            <h1 className="font-display font-bold text-3xl sm:text-4xl leading-tight mb-5">
              Finding funded research at {school.shortName}
            </h1>
            <p className="text-maroon-100 text-[15px] leading-relaxed max-w-2xl">
              Research positions are how most international graduate students get
              funded — and a STEM research path unlocks the longest post-graduation
              work runway in the U.S. This is a practical guide to using
              {' '}{school.appName} to find a lab that can support you, and how to
              reach out.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Why research matters */}
      <section className="py-16 border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Why it matters</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-2xl tracking-tight mb-6">
              Research is the funding path
            </h2>
          </Reveal>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              ['Assistantships fund you', 'Faculty with active, funded labs hire Research Assistants — usually a stipend plus a tuition waiver. Finding the right PI is finding your funding.'],
              ['STEM OPT = 36 months', 'A STEM degree extends post-graduation work authorization to 36 months (12 OPT + 24 STEM OPT) — far more runway than non-STEM fields.'],
              ['Faculty open doors', 'A PI who knows your work can fund you, advise you, and connect you to industry and academic roles. The relationship starts with outreach.'],
            ].map(([h, b]) => (
              <Reveal key={h}>
                <div className="bg-white rounded-xl border border-cream-300 p-5 h-full">
                  <h3 className="font-semibold text-stone-900 text-[15px] mb-2">{h}</h3>
                  <p className="text-stone-600 text-sm leading-relaxed">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How to find a fundable lab */}
      <section className="py-16 border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Step 1</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-2xl tracking-tight mb-6">
              Find a lab that can support you
            </h2>
          </Reveal>
          <ol className="space-y-4 text-stone-700 text-[15px] leading-relaxed">
            <li><strong>1.</strong> <Link to={tx('/search')} className="text-maroon-700 font-semibold underline decoration-maroon-300 underline-offset-2">Search</Link> by your research interest, or use <Link to={tx('/match')} className="text-maroon-700 font-semibold underline decoration-maroon-300 underline-offset-2">Match</Link> to rank {school.shortName} faculty against your resume + interests.</li>
            <li><strong>2.</strong> Prioritize <strong>active labs</strong> — profiles with a lab website or Google Scholar are signals of an active, often-funded research group. Use the "Active labs" filter on Search.</li>
            <li><strong>3.</strong> Read each professor's research summary and AI overview to confirm genuine overlap with your interests — specificity is what gets replies.</li>
            <li><strong>4.</strong> Save promising PIs and track your outreach in the <Link to={tx('/tracker')} className="text-maroon-700 font-semibold underline decoration-maroon-300 underline-offset-2">Application Tracker</Link>.</li>
          </ol>
        </div>
      </section>

      {/* How to reach out */}
      <section className="py-16 border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Step 2</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-2xl tracking-tight mb-6">
              Reach out the right way
            </h2>
          </Reveal>
          <div className="space-y-3 text-stone-700 text-[15px] leading-relaxed">
            <p>Cold emails to PIs work when they're specific and short. {school.appName}'s email drafter generates a personalized first draft for any professor — open a profile and click <em>Draft outreach email</em>.</p>
            <ul className="list-disc pl-6 space-y-1.5 text-stone-600 text-sm">
              <li>Name one or two of their papers/projects and why they connect to your goals.</li>
              <li>State your status (e.g. prospective MS/PhD applicant, current student) and that you're seeking a funded research position.</li>
              <li>Attach a one-page CV; keep the email under ~150 words.</li>
              <li>It's normal to email many PIs — track replies and follow up after a week.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Terms */}
      <section className="py-16 border-b border-cream-300">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Reveal>
            <SectionEyebrow>Know the terms</SectionEyebrow>
            <h2 className="font-display font-bold text-stone-900 text-2xl tracking-tight mb-6">
              Funding & work-authorization basics
            </h2>
          </Reveal>
          <dl className="divide-y divide-cream-300 border-y border-cream-300">
            {TERMS.map(([t, d]) => (
              <div key={t} className="py-4 grid sm:grid-cols-[140px_1fr] gap-2 sm:gap-6">
                <dt className="font-semibold text-stone-900 text-sm">{t}</dt>
                <dd className="text-stone-600 text-sm leading-relaxed">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* CTA + disclaimer */}
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <Reveal>
            <h2 className="font-display font-bold text-stone-900 text-2xl tracking-tight mb-4">
              Start with one good match
            </h2>
            <Link
              to={tx('/search')}
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-maroon-700
                         text-cream-50 rounded-xl font-bold text-sm
                         hover:bg-maroon-800 transition-colors"
            >
              Search {school.shortName} STEM faculty
            </Link>
            <p className="mt-10 text-xs text-stone-400 max-w-2xl mx-auto leading-relaxed">
              This guide is general information, not legal or immigration advice.
              Visa rules change and individual situations vary — always confirm
              CPT/OPT/funding specifics with {school.name}'s international student
              services office and your department's graduate coordinator.
            </p>
          </Reveal>
        </div>
      </section>
    </div>
  )
}
