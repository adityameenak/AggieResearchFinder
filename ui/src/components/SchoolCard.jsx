import { Link } from 'react-router-dom'

export default function SchoolCard({ school }) {
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
