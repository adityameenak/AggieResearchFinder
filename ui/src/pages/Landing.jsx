import { Link } from 'react-router-dom'
import { SCHOOL_LIST } from '../schools'

export default function Landing() {
  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <div className="h-[2.5px] bg-maroon-700" />

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl">
          <div className="text-center mb-12">
            <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-[0.18em] mb-4">
              Texas University Research Finder
            </div>
            <h1 className="font-display text-4xl sm:text-5xl text-stone-900 leading-tight mb-4">
              Pick your university
            </h1>
            <p className="text-stone-600 text-base max-w-xl mx-auto leading-relaxed">
              Each school has its own faculty directory, branding, and matching dashboard.
              Choose where you go to see research labs near you.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCHOOL_LIST.map((school) => (
              <SchoolCard key={school.code} school={school} />
            ))}
          </div>

          <p className="text-center text-xs text-stone-500 mt-12">
            Don't see your school? More universities are being added — open an issue on GitHub.
          </p>
        </div>
      </main>
    </div>
  )
}

function SchoolCard({ school }) {
  const c = school.classes
  const inner = (
    <div className={[
      'group relative rounded-xl border bg-white p-6 transition-all duration-200',
      school.available
        ? `border-stone-200 ${c.cardHover} hover:shadow-md cursor-pointer`
        : 'border-stone-200 opacity-60 cursor-not-allowed',
    ].join(' ')}>
      <div className="flex items-baseline gap-1 mb-3">
        <span className={`font-display italic ${c.brandText} text-[22px] font-bold leading-none`}>
          {school.brandPrefix}
        </span>
        <span className="font-sans font-semibold text-stone-800 text-[14px] tracking-tight">
          {school.brandSuffix}
        </span>
      </div>
      <div className="text-sm font-medium text-stone-900 mb-1">{school.name}</div>
      <p className="text-xs text-stone-500 leading-relaxed mb-4">{school.description}</p>

      <div className="flex items-center justify-between">
        {school.available ? (
          <span className={`text-xs font-semibold ${c.pillText} group-hover:underline`}>
            Enter →
          </span>
        ) : (
          <span className="text-xs font-semibold text-stone-400">
            Coming soon
          </span>
        )}
        <span className="text-[10px] uppercase tracking-wider text-stone-400">
          /{school.code}
        </span>
      </div>
    </div>
  )

  if (!school.available) return inner
  return <Link to={`/${school.code}`} className="block">{inner}</Link>
}
