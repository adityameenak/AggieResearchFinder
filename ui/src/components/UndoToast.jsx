import { useEffect } from 'react'
import { useApp } from '../AppContext'

// How long the undo offer stays up. Long enough to notice a mis-click on a
// bookmark, short enough not to pile up while browsing.
const UNDO_MS = 8000

/**
 * "Removed from My List · Undo". Mounted once in SchoolApp; every removal
 * (bookmark buttons on cards, ProfDetail and Match, and the My List page) goes
 * through AppContext.removeWithUndo, so this one toast covers all of them.
 */
export default function UndoToast() {
  const { lastRemoved, undoRemove, dismissUndo } = useApp()

  useEffect(() => {
    if (!lastRemoved) return
    const t = setTimeout(dismissUndo, UNDO_MS)
    return () => clearTimeout(t)
  }, [lastRemoved, dismissUndo])

  if (!lastRemoved) return null
  const { app } = lastRemoved
  // A bare bookmark costs nothing to lose; progress is worth spelling out.
  const progressed = app.status && app.status !== 'Saved'

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
      style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="pointer-events-auto flex items-center gap-3 max-w-md w-full sm:w-auto
                      rounded-xl bg-stone-900 text-white shadow-lg px-4 py-3 text-sm">
        <span className="flex-1 min-w-0">
          Removed <span className="font-semibold">{app.professorName || 'professor'}</span>
          {progressed ? <> — status was <span className="font-semibold">{app.status}</span></> : ''}
        </span>
        <button
          type="button"
          onClick={undoRemove}
          className="font-semibold text-gold-light hover:underline focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-gold-light rounded px-1"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={dismissUndo}
          aria-label="Dismiss"
          className="text-stone-400 hover:text-white focus:outline-none
                     focus-visible:ring-2 focus-visible:ring-stone-400 rounded px-1"
        >
          ×
        </button>
      </div>
    </div>
  )
}
