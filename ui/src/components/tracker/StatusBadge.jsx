import { statusConfig } from '../../utils/trackerStorage'

export default function StatusBadge({ status, size = 'sm' }) {
  const cfg      = statusConfig(status)
  const textSize = size === 'xs' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-[11px]'
  const px       = size === 'xs' ? 'px-2 py-0.5' : size === 'md' ? 'px-3 py-1' : 'px-2.5 py-1'
  const dot      = size === 'xs' ? 'w-1.5 h-1.5' : 'w-1.5 h-1.5'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold
                  ring-1 ring-inset leading-none whitespace-nowrap
                  ${cfg.bg} ${cfg.text} ${cfg.ring} ${textSize} ${px}`}
    >
      <span className={`rounded-full flex-shrink-0 ${cfg.dot} ${dot}`} />
      {status}
    </span>
  )
}
