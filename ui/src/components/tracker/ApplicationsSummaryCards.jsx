const IN_PROGRESS = ['Not Started', 'Drafting Email', 'Applied', 'Follow Up Sent']
const DONE        = ['Interview Scheduled', 'Accepted', 'Rejected', 'Closed']

export default function ApplicationsSummaryCards({ applications }) {
  const total      = applications.length
  const inProgress = applications.filter(a => IN_PROGRESS.includes(a.status)).length
  const done       = applications.filter(a => DONE.includes(a.status)).length

  const cards = [
    {
      label:  'Total',
      value:  total,
      sub:    'applications tracked',
      numCls: 'text-stone-900',
      border: 'border-stone-200',
    },
    {
      label:  'In Progress',
      value:  inProgress,
      sub:    'awaiting a response',
      numCls: 'text-amber-700',
      border: 'border-amber-200',
    },
    {
      label:  'Resolved',
      value:  done,
      sub:    'interview, accepted, or closed',
      numCls: 'text-green-700',
      border: 'border-green-200',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(c => (
        <div
          key={c.label}
          className={`bg-white rounded-xl border p-4 shadow-sm shadow-stone-900/[0.03] ${c.border}`}
        >
          <div className={`text-2xl font-bold leading-none mb-1 ${c.numCls}`}>{c.value}</div>
          <div className="text-[12px] font-semibold text-stone-700">{c.label}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
