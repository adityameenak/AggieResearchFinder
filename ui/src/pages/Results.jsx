import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useApp } from '../AppContext'
import ProfCard from '../components/ProfCard'
import { searchAndRank, tokenize, deptLabel } from '../utils/search'

const CHIPS = [
  { label: 'Machine learning',    q: 'machine learning' },
  { label: 'Renewable energy',    q: 'renewable energy' },
  { label: 'Robotics',            q: 'robotics' },
  { label: 'Carbon capture',      q: 'carbon capture' },
  { label: 'Battery materials',   q: 'battery materials' },
  { label: 'Fluid dynamics',      q: 'fluid dynamics' },
  { label: 'Nanotechnology',      q: 'nanotechnology' },
  { label: 'Bioinformatics',      q: 'bioinformatics' },
  { label: 'Drug delivery',       q: 'drug delivery' },
  { label: 'Quantum computing',   q: 'quantum computing' },
  { label: 'Semiconductors',      q: 'semiconductors' },
  { label: 'Structural health',   q: 'structural health monitoring' },
]

/* ── Search icon ──────────────────────────────────────────── */
function SearchIcon({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
        clipRule="evenodd" />
    </svg>
  )
}

/* ── Filter panel (shared across sidebar + mobile) ────────── */
function FilterPanel({ dept, setDept, hasResearchOnly, setHasResearchOnly,
                       hasActive, clearAll, departments, query, onDeptChange,
                       onResearchChange }) {
  return (
    <div className="space-y-5">

      {/* Department */}
      <div>
        <label className="block text-[11px] font-semibold text-stone-400
                           uppercase tracking-[0.12em] mb-2">
          Department
        </label>
        <div className="relative">
          <select
            value={dept}
            onChange={e => onDeptChange(e.target.value)}
            className="w-full text-sm border border-cream-400 rounded-xl px-3.5 py-2.5
                       bg-cream-50 text-stone-700 appearance-none cursor-pointer
                       focus:outline-none focus:ring-2 focus:ring-maroon-700/30
                       focus:border-maroon-700 transition-colors pr-8"
          >
            <option value="">All departments</option>
            {departments.map(d => (
              <option key={d} value={d}>{deptLabel(d)}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2
                           text-stone-400">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </span>
        </div>
      </div>

      {/* Research toggle */}
      <div>
        <label className="block text-[11px] font-semibold text-stone-400
                           uppercase tracking-[0.12em] mb-2">
          Content
        </label>
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative mt-0.5 flex-shrink-0">
            <input
              type="checkbox"
              checked={hasResearchOnly}
              onChange={e => onResearchChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-cream-300 rounded-full peer-checked:bg-maroon-700
                            transition-colors duration-200 border border-cream-400
                            peer-checked:border-maroon-700" />
            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full
                            shadow-sm transition-transform duration-200
                            peer-checked:translate-x-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-stone-700 leading-tight
                            group-hover:text-stone-900 transition-colors">
              Has research summary
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5 leading-relaxed">
              Only show faculty with published research info
            </div>
          </div>
        </label>
      </div>

      {/* Active indicator + clear */}
      {hasActive && (
        <div className="pt-1 border-t border-cream-300">
          <button
            onClick={clearAll}
            className="text-xs text-stone-400 hover:text-red-600 transition-colors
                       flex items-center gap-1.5 group"
          >
            <svg viewBox="0 0 16 16" fill="currentColor"
                 className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
            Clear all filters
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Pagination ──────────────────────────────────────────── */
function Pagination({ currentPage, totalPages, goToPage }) {
  /* Build visible page numbers: always show first, last, current, and neighbors */
  const pages = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-8 mb-4" aria-label="Pagination">
      {/* Previous */}
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="px-3 py-2 text-sm rounded-lg border border-cream-400 text-stone-600
                   hover:border-maroon-400 hover:text-maroon-700 hover:bg-maroon-50
                   transition-colors disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Previous page"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 0 1 0 1.06L7.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L5.47 8.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Page numbers */}
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-sm text-stone-400">...</span>
        ) : (
          <button
            key={p}
            onClick={() => goToPage(p)}
            className={`min-w-[36px] px-3 py-2 text-sm rounded-lg border transition-colors font-medium
                        ${p === currentPage
                          ? 'border-maroon-700 bg-maroon-700 text-cream-100'
                          : 'border-cream-400 text-stone-600 hover:border-maroon-400 hover:text-maroon-700 hover:bg-maroon-50'
                        }`}
            aria-current={p === currentPage ? 'page' : undefined}
          >
            {p}
          </button>
        )
      )}

      {/* Next */}
      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="px-3 py-2 text-sm rounded-lg border border-cream-400 text-stone-600
                   hover:border-maroon-400 hover:text-maroon-700 hover:bg-maroon-50
                   transition-colors disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Next page"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
    </nav>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
const PAGE_SIZE = 24

export default function Search() {
  const { faculty, departments, loading } = useApp()
  const [searchParams, setSearchParams] = useSearchParams()
  const inputRef = useRef(null)
  const topRef = useRef(null)

  const qParam    = searchParams.get('q')           ?? ''
  const deptParam = searchParams.get('dept')         ?? ''
  const hasRes    = searchParams.get('hasResearch') === '1'
  const chipsParam = searchParams.get('chips')       ?? ''
  const pageParam = parseInt(searchParams.get('page') ?? '1', 10)

  const [query,           setQuery]           = useState(qParam)
  const [dept,            setDept]            = useState(deptParam)
  const [hasResearchOnly, setHasResearchOnly] = useState(hasRes)
  const [selectedChips,   setSelectedChips]   = useState(() => new Set(chipsParam ? chipsParam.split(',') : []))
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => {
    setQuery(qParam)
    setDept(deptParam)
    setHasResearchOnly(hasRes)
    setSelectedChips(new Set(chipsParam ? chipsParam.split(',') : []))
  }, [qParam, deptParam, hasRes, chipsParam, pageParam])

  /* Combine free-text query with selected chip terms */
  const combinedQuery = useMemo(() => {
    const parts = []
    if (qParam.trim()) parts.push(qParam.trim())
    const chipValues = chipsParam ? chipsParam.split(',') : []
    for (const c of chipValues) {
      if (!qParam.toLowerCase().includes(c.toLowerCase())) parts.push(c)
    }
    return parts.join(' ')
  }, [qParam, chipsParam])

  const tokens  = useMemo(() => tokenize(combinedQuery), [combinedQuery])
  const results = useMemo(
    () => searchAndRank(faculty, combinedQuery, { department: deptParam, hasResearchOnly: hasRes }),
    [faculty, combinedQuery, deptParam, hasRes],
  )

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE))
  const currentPage = Math.min(Math.max(1, pageParam), totalPages)
  const pagedResults = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function push(nextQ, nextDept, nextHasRes, nextChips = selectedChips, nextPage = 1) {
    const p = new URLSearchParams()
    if (nextQ.trim())      p.set('q',          nextQ.trim())
    if (nextDept)          p.set('dept',        nextDept)
    if (nextHasRes)        p.set('hasResearch', '1')
    if (nextChips.size > 0) p.set('chips',      [...nextChips].join(','))
    if (nextPage > 1)      p.set('page',        String(nextPage))
    setSearchParams(p, { replace: true })
  }

  function goToPage(page) {
    push(query, dept, hasResearchOnly, selectedChips, page)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function onSubmit(e) {
    e?.preventDefault()
    push(query, dept, hasResearchOnly)
  }

  function toggleChip(q) {
    const next = new Set(selectedChips)
    if (next.has(q)) next.delete(q)
    else next.add(q)
    setSelectedChips(next)
    push(query, dept, hasResearchOnly, next)
    inputRef.current?.focus()
  }

  function clearAll() {
    setQuery('')
    setDept('')
    setHasResearchOnly(false)
    setSelectedChips(new Set())
    setSearchParams({}, { replace: true })
    inputRef.current?.focus()
  }

  const hasActive = qParam || deptParam || hasRes || chipsParam || pageParam > 1
  const activeFilterCount = [deptParam, hasRes, chipsParam].filter(Boolean).length

  return (
    <div className="flex flex-col min-h-[calc(100vh-54px)] bg-cream-100">

      {/* ── Search header ────────────────────────────────────── */}
      <div className="relative bg-cream-50 border-b border-cream-300 overflow-hidden">
        {/* Subtle texture */}
        <div className="absolute inset-0 dot-texture opacity-50 pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8">

          {/* Eyebrow */}
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-4 h-px bg-maroon-700" />
            <span className="text-xs font-semibold text-maroon-700 uppercase tracking-[0.16em]">
              Faculty Search
            </span>
          </div>

          <h1 className="font-display font-bold text-stone-900 text-3xl sm:text-4xl
                         tracking-tight mb-1.5">
            Find Your Research Mentor
          </h1>
          <p className="text-[15px] text-stone-500 mb-7">
            Explore{' '}
            <span className="font-semibold text-stone-700">{faculty.length || 553}</span>
            {' '}researchers across 10 engineering departments at Texas A&amp;M.
          </p>

          {/* Search bar */}
          <form onSubmit={onSubmit} className="mb-5">
            <div
              className="flex items-center rounded-2xl border-2 border-cream-400 bg-white
                         shadow-md overflow-hidden
                         focus-within:border-maroon-700 focus-within:shadow-lg
                         focus-within:shadow-maroon-900/[0.08] transition-all duration-200"
            >
              <span className="pl-5 flex items-center text-maroon-700 pointer-events-none
                               flex-shrink-0">
                <SearchIcon className="w-5 h-5" />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder='e.g. "battery materials" or "machine learning robotics"'
                className="flex-1 px-4 py-4 text-[15px] text-stone-900 bg-transparent
                           outline-none placeholder-stone-400 min-w-0"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="px-3 text-stone-300 hover:text-stone-500 transition-colors
                             flex-shrink-0"
                  aria-label="Clear query"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                  </svg>
                </button>
              )}
              <button
                type="submit"
                className="px-7 py-4 bg-maroon-700 hover:bg-maroon-600 text-cream-100
                           text-sm font-semibold transition-colors duration-150
                           flex-shrink-0 flex items-center gap-2"
              >
                Search
              </button>
            </div>
          </form>

          {/* Chips */}
          <div>
            <p className="text-[11px] text-stone-400 font-semibold uppercase
                          tracking-[0.12em] mb-2.5">
              Filter by topic:
            </p>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map(({ label, q }) => {
                const active = selectedChips.has(q)
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => toggleChip(q)}
                    className={`text-xs px-3.5 py-1.5 rounded-full border
                               transition-all duration-150 shadow-sm
                               hover:scale-[1.03] active:scale-[0.98]
                               ${active
                                 ? 'border-maroon-700 bg-maroon-700 text-cream-100'
                                 : 'border-cream-400 text-stone-600 bg-white hover:border-maroon-400 hover:text-maroon-700 hover:bg-maroon-50'
                               }`}
                  >
                    {active && <span className="mr-1">&#10003;</span>}
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: sidebar + results ───────────────────────────── */}
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-7">
        <div className="flex gap-7 items-start">

          {/* ── Sticky sidebar (desktop) ───────────────────────── */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-5 space-y-3">
              <div className="bg-cream-50 rounded-2xl border border-cream-300 p-5">
                <div className="text-[11px] font-semibold text-stone-400 uppercase
                                tracking-[0.14em] mb-5">
                  Filters
                </div>
                <FilterPanel
                  dept={dept} setDept={setDept}
                  hasResearchOnly={hasResearchOnly}
                  setHasResearchOnly={setHasResearchOnly}
                  hasActive={hasActive} clearAll={clearAll}
                  departments={departments} query={query}
                  onDeptChange={v => { setDept(v); push(query, v, hasResearchOnly) }}
                  onResearchChange={v => { setHasResearchOnly(v); push(query, dept, v) }}
                />
              </div>

              {/* Active filter pill */}
              {hasActive && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                                bg-maroon-50 border border-maroon-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-maroon-700 flex-shrink-0" />
                  <span className="text-xs text-maroon-700 font-medium">
                    {activeFilterCount > 0
                      ? `${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} active`
                      : 'Filters active'}
                  </span>
                </div>
              )}
            </div>
          </aside>

          {/* ── Results area ──────────────────────────────────── */}
          <div className="flex-1 min-w-0" ref={topRef}>

            {/* Mobile filter bar */}
            <div className="lg:hidden mb-5">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setMobileFiltersOpen(o => !o)}
                  className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl border
                              transition-colors font-medium ${
                    hasActive
                      ? 'bg-maroon-50 border-maroon-300 text-maroon-700'
                      : 'border-cream-400 text-stone-600 bg-cream-50 hover:border-stone-300'
                  }`}
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75ZM4 8.75A.75.75 0 0 1 4.75 8h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8.75ZM6.75 12a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z" />
                  </svg>
                  Filters
                  {hasActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-maroon-700" />
                  )}
                </button>
                {hasActive && (
                  <button
                    onClick={clearAll}
                    className="text-xs text-stone-400 hover:text-red-600 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Mobile filter panel */}
              {mobileFiltersOpen && (
                <div className="mt-3 bg-cream-50 rounded-2xl border border-cream-300 p-5">
                  <FilterPanel
                    dept={dept} setDept={setDept}
                    hasResearchOnly={hasResearchOnly}
                    setHasResearchOnly={setHasResearchOnly}
                    hasActive={hasActive} clearAll={clearAll}
                    departments={departments} query={query}
                    onDeptChange={v => { setDept(v); push(query, v, hasResearchOnly) }}
                    onResearchChange={v => { setHasResearchOnly(v); push(query, dept, v) }}
                  />
                </div>
              )}
            </div>

            {/* Results toolbar */}
            {!loading && (
              <div className="flex items-center justify-between mb-6 pb-4
                              border-b border-cream-300">
                <div className="text-sm text-stone-500">
                  {results.length === 0 ? (
                    <span className="text-stone-400">No results</span>
                  ) : (
                    <>
                      <span className="font-semibold text-stone-800">{results.length}</span>
                      {' '}result{results.length !== 1 ? 's' : ''}
                      {combinedQuery && (
                        <>
                          {' '}for{' '}
                          <span className="font-semibold text-maroon-700">
                            &ldquo;{combinedQuery}&rdquo;
                          </span>
                        </>
                      )}
                      {results.length > PAGE_SIZE && (
                        <span className="text-stone-400">
                          {' '}&middot; page {currentPage} of {totalPages}
                        </span>
                      )}
                    </>
                  )}
                </div>
                {combinedQuery && results.length > 0 && (
                  <span className="text-[11px] text-stone-400 font-medium
                                   uppercase tracking-[0.1em]">
                    Ranked by relevance
                  </span>
                )}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div
                  className="w-8 h-8 border-2 border-maroon-700 border-t-transparent
                             rounded-full animate-spin mb-5"
                />
                <p className="text-sm text-stone-400 font-medium">
                  Loading faculty data&hellip;
                </p>
              </div>
            )}

            {/* Results grid */}
            {!loading && pagedResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {pagedResults.map((prof, i) => (
                  <div
                    key={prof.id}
                    style={{
                      opacity: 0,
                      animation: `heroFadeUp 0.45s cubic-bezier(0.16,1,0.3,1) ${Math.min(i, 12) * 40}ms forwards`,
                    }}
                  >
                    <ProfCard prof={prof} tokens={tokens} />
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {!loading && results.length > PAGE_SIZE && (
              <Pagination currentPage={currentPage} totalPages={totalPages} goToPage={goToPage} />
            )}

            {/* Empty state */}
            {!loading && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-28 text-center">
                <div
                  className="w-16 h-16 rounded-full bg-cream-200 border border-cream-300
                             flex items-center justify-center mb-5"
                >
                  <SearchIcon className="w-7 h-7 text-stone-400" />
                </div>
                <h3 className="font-display font-bold text-stone-800 text-xl mb-2">
                  {combinedQuery ? 'No matches found' : 'Start your search'}
                </h3>
                <p className="text-sm text-stone-500 max-w-xs leading-relaxed mb-7">
                  {combinedQuery
                    ? `No professors matched "${combinedQuery}". Try fewer keywords or adjust your filters.`
                    : 'Enter a keyword above or select a topic to search faculty by research interest.'}
                </p>
                {hasActive && (
                  <button
                    onClick={clearAll}
                    className="text-sm px-6 py-2.5 bg-maroon-700 text-cream-100
                               rounded-xl hover:bg-maroon-600 transition-colors font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {/* Browse-all footer nudge */}
            {!loading && !qParam && !deptParam && !hasRes && !chipsParam && results.length > 0 && results.length <= PAGE_SIZE && (
              <p className="text-center text-xs text-stone-400 mt-10 pb-2">
                Showing all{' '}
                <span className="font-semibold">{results.length}</span>{' '}
                faculty &middot; Enter a keyword above to rank by relevance
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
