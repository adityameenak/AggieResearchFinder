import { useApp } from '../AppContext'

/**
 * Shown when the school's faculty file fails to load. Without it a network
 * failure looked exactly like an empty result — Results said "No results",
 * Match said "0 matches", Home said 0 faculty — so the user blamed their query.
 */
export default function LoadError() {
  const { error, loading, retry } = useApp()
  if (!error || loading) return null
  return (
    <div role="alert" className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200
                      bg-red-50 text-red-900 px-4 py-3 text-sm">
        <span className="flex-1 min-w-[12rem]">
          We couldn’t load the faculty list ({error}). Check your connection and try again.
        </span>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-red-900 text-white font-semibold px-3 py-1.5
                     hover:bg-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          Retry
        </button>
      </div>
    </div>
  )
}
