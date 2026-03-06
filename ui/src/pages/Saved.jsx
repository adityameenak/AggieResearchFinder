import { Link } from 'react-router-dom'
import { useApp } from '../AppContext'
import ProfCard from '../components/ProfCard'

export default function Saved() {
  const { faculty, saved, clearSaved } = useApp()
  const savedProfs = faculty.filter(f => saved.includes(f.id))

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="w-4 h-px bg-maroon-700" />
            <span className="text-xs font-semibold text-maroon-700 uppercase
                             tracking-[0.16em]">
              Your collection
            </span>
          </div>
          <h1 className="font-display font-bold text-stone-900 text-3xl tracking-tight">
            Saved Professors
          </h1>
          <p className="text-sm text-stone-500 mt-1.5">
            {savedProfs.length === 0
              ? 'No saved professors yet.'
              : `${savedProfs.length} professor${savedProfs.length !== 1 ? 's' : ''} saved`}
          </p>
        </div>

        {savedProfs.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Clear all saved professors?')) clearSaved()
            }}
            className="text-sm text-stone-400 hover:text-red-600 transition-colors
                       border border-cream-300 hover:border-red-200 px-3 py-1.5
                       rounded-lg font-medium flex-shrink-0"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Grid */}
      {savedProfs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {savedProfs.map(prof => (
            <ProfCard key={prof.id} prof={prof} tokens={[]} />
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-cream-200 border border-cream-300
                          flex items-center justify-center mb-5">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-7 h-7 text-stone-400"
            >
              <path d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
            </svg>
          </div>

          <h2 className="font-display font-bold text-stone-800 text-xl mb-2">
            No saved professors
          </h2>
          <p className="text-sm text-stone-500 max-w-xs mb-8 leading-relaxed">
            Bookmark professors by clicking the{' '}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              className="inline w-3.5 h-3.5 align-middle"
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-4-7 4V4z" />
            </svg>{' '}
            icon on any card. They'll appear here for quick reference.
          </p>
          <Link
            to="/search"
            className="inline-flex items-center gap-2 px-7 py-3 bg-maroon-700
                       hover:bg-maroon-600 text-cream-100 text-sm font-semibold
                       rounded-xl transition-colors shadow-sm shadow-maroon-950/20"
          >
            Browse Faculty
          </Link>
        </div>
      )}
    </div>
  )
}
