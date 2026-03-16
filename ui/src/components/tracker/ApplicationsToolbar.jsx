import { STATUSES } from '../../utils/trackerStorage'

export const SORT_OPTIONS = [
  { value: 'newest',  label: 'Most recent' },
  { value: 'oldest',  label: 'Oldest first' },
  { value: 'name',    label: 'Professor A–Z' },
  { value: 'status',  label: 'By status' },
]

export default function ApplicationsToolbar({
  query, onQuery,
  statusFilter, onStatusFilter,
  sort, onSort,
  total,
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2.5">
      {/* Search */}
      <div className="relative flex-1">
        <svg
          viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none"
        >
          <circle cx="8.5" cy="8.5" r="5.75" />
          <path d="M14.75 14.75l3 3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => onQuery(e.target.value)}
          placeholder="Search professor, lab, department, research area…"
          className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-stone-200
                     rounded-xl text-stone-800 placeholder-stone-400 focus:outline-none
                     focus:ring-2 focus:ring-maroon-300 focus:border-transparent
                     transition-shadow"
        />
        {query && (
          <button
            onClick={() => onQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        )}
      </div>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={e => onStatusFilter(e.target.value)}
        className="px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl
                   text-stone-700 focus:outline-none focus:ring-2 focus:ring-maroon-300
                   focus:border-transparent transition-shadow cursor-pointer min-w-[140px]"
      >
        <option value="">All statuses</option>
        {STATUSES.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={sort}
        onChange={e => onSort(e.target.value)}
        className="px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl
                   text-stone-700 focus:outline-none focus:ring-2 focus:ring-maroon-300
                   focus:border-transparent transition-shadow cursor-pointer min-w-[130px]"
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Count chip */}
      {total > 0 && (
        <div className="flex items-center px-3 py-2 rounded-xl bg-stone-50 border
                        border-stone-200 text-[11px] font-semibold text-stone-500
                        whitespace-nowrap">
          {total} result{total !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
