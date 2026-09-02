import { Link, useParams } from 'react-router-dom'
import { SCHOOL_LIST } from '../schools'
import { formatStateSlug } from '../lib/states'
import SchoolCard from '../components/SchoolCard'
import Seo from '../components/Seo'

export default function StatePage() {
  const { state }    = useParams()
  const stateName    = formatStateSlug(state)
  const schools      = SCHOOL_LIST.filter(s => s.state === state)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Seo />
      <div className="h-[3px] bg-gradient-to-r from-indigo-600 via-violet-500 to-purple-600" />

      <main className="flex-1 px-6 py-12">
        <div className="max-w-3xl mx-auto">

          {/* Back link */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-stone-500
                       hover:text-indigo-600 transition-colors mb-10 group"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd"
                d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd" />
            </svg>
            Back to map
          </Link>

          {/* Header */}
          <div className="mb-10">
            <div className="text-[11px] font-semibold text-indigo-600 uppercase
                            tracking-[0.2em] mb-4">
              Pick your university
            </div>
            <h1 className="font-display font-bold text-stone-900 text-4xl sm:text-5xl
                           leading-[1.06] tracking-tight mb-3">
              Schools in {stateName}
            </h1>
            <p className="text-stone-600 text-[15px] leading-relaxed">
              Choose a university to open its ResearchFinder.
            </p>
          </div>

          {/* Cards */}
          {schools.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {schools.map(school => (
                <SchoolCard key={school.code} school={school} />
              ))}
            </div>
          ) : (
            /* Empty state */
            <div className="text-center py-24">
              <div className="w-14 h-14 rounded-2xl bg-cream-100 border border-cream-300
                              flex items-center justify-center mx-auto mb-5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25"
                     strokeLinecap="round" strokeLinejoin="round"
                     className="w-7 h-7 text-stone-400">
                  <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
              </div>
              <h2 className="font-display font-bold text-stone-900 text-2xl mb-2">
                No schools on file yet
              </h2>
              <p className="text-stone-500 text-sm mb-1">
                No schools are currently on file for {stateName}.
              </p>
              <p className="text-stone-400 text-sm mb-8">
                More universities are being added soon.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-2 px-6 py-3
                           bg-gradient-to-r from-indigo-600 to-violet-600
                           text-white rounded-xl font-semibold text-sm
                           hover:from-indigo-500 hover:to-violet-500 transition-all"
              >
                Back to map
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
