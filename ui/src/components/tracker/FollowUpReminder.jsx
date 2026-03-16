import { daysUntilFollowUp, fmtDate } from '../../utils/trackerStorage'

export default function FollowUpReminder({ followUpDate, showDate = false }) {
  const days = daysUntilFollowUp(followUpDate)
  if (days === null || days > 7) return null

  const isOverdue  = days < 0
  const isToday    = days === 0
  const isTomorrow = days === 1

  let label
  if (isOverdue)       label = `Overdue by ${Math.abs(days)}d`
  else if (isToday)    label = 'Due today'
  else if (isTomorrow) label = 'Due tomorrow'
  else                 label = `Due in ${days}d`

  const color = isOverdue
    ? 'bg-red-50 text-red-700 ring-red-200'
    : isToday || isTomorrow
    ? 'bg-amber-50 text-amber-700 ring-amber-200'
    : 'bg-sky-50 text-sky-700 ring-sky-200'

  const icon = isOverdue ? '⚠' : '⏰'

  return (
    <span
      title={showDate ? `Follow-up: ${fmtDate(followUpDate)}` : undefined}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                  text-[10px] font-semibold ring-1 ring-inset leading-none ${color}`}
    >
      <span className="text-[9px]">{icon}</span>
      Follow-up · {label}
    </span>
  )
}
