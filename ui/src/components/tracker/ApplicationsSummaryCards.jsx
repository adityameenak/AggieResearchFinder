import { computeSummary } from '../../utils/trackerStorage'

const CARDS = [
  {
    key:     'total',
    label:   'Total',
    sub:     'Applications tracked',
    bg:      'bg-white',
    border:  'border-stone-200',
    numCls:  'text-stone-900',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-stone-400">
        <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
        <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
      </svg>
    ),
    iconBg:  'bg-stone-50',
  },
  {
    key:     'awaiting',
    label:   'Awaiting',
    sub:     'No response yet',
    bg:      'bg-white',
    border:  'border-amber-200',
    numCls:  'text-amber-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-500">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z" clipRule="evenodd" />
      </svg>
    ),
    iconBg:  'bg-amber-50',
  },
  {
    key:     'interview',
    label:   'Interviews',
    sub:     'Scheduled meetings',
    bg:      'bg-white',
    border:  'border-violet-200',
    numCls:  'text-violet-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-violet-500">
        <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75Z" clipRule="evenodd" />
      </svg>
    ),
    iconBg:  'bg-violet-50',
  },
  {
    key:     'accepted',
    label:   'Accepted',
    sub:     'Offers received',
    bg:      'bg-white',
    border:  'border-green-200',
    numCls:  'text-green-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-green-500">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
      </svg>
    ),
    iconBg:  'bg-green-50',
  },
  {
    key:     'rejected',
    label:   'Closed',
    sub:     'Rejected / closed',
    bg:      'bg-white',
    border:  'border-red-200',
    numCls:  'text-red-700',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-red-400">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
      </svg>
    ),
    iconBg:  'bg-red-50',
  },
]

export default function ApplicationsSummaryCards({ applications }) {
  const s = computeSummary(applications)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {CARDS.map(card => (
        <div
          key={card.key}
          className={`rounded-xl border p-4 flex flex-col gap-3 ${card.bg} ${card.border}
                      shadow-sm shadow-stone-900/[0.03] hover:shadow-md
                      hover:shadow-stone-900/[0.07] transition-shadow duration-200`}
        >
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.iconBg}`}>
            {card.icon}
          </div>
          <div>
            <div className={`text-2xl font-bold leading-none mb-1 ${card.numCls}`}>
              {s[card.key]}
            </div>
            <div className="text-[11px] font-semibold text-stone-700 leading-none">
              {card.label}
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5 leading-snug">
              {card.sub}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
