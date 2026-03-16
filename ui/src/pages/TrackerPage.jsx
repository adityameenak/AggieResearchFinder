import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getApplications, createApplication, updateApplication, deleteApplication,
  exportToCSV, seedDemoData, STATUSES,
} from '../utils/trackerStorage'
import ApplicationsSummaryCards from '../components/tracker/ApplicationsSummaryCards'
import ApplicationsToolbar      from '../components/tracker/ApplicationsToolbar'
import ApplicationCard          from '../components/tracker/ApplicationCard'
import ApplicationFormModal     from '../components/tracker/ApplicationFormModal'
import Reveal                   from '../components/Reveal'

/* ── Empty state ─────────────────────────────────────────────── */
function EmptyState({ hasFilters, onAdd, onSeed }) {
  if (hasFilters) {
    return (
      <div className="py-16 text-center">
        <p className="text-stone-400 text-sm">No applications match your search.</p>
      </div>
    )
  }

  return (
    <div className="py-24 text-center max-w-sm mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-cream-100 border border-cream-300
                      flex items-center justify-center mx-auto mb-4">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25"
             strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-stone-400">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
        </svg>
      </div>
      <h3 className="font-display font-bold text-stone-900 text-xl mb-2">Nothing here yet</h3>
      <p className="text-sm text-stone-500 leading-relaxed mb-6">
        Start tracking the labs and professors you reach out to.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button
          onClick={onAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5
                     bg-maroon-700 text-cream-100 text-sm font-semibold rounded-xl
                     hover:bg-maroon-600 transition-colors shadow-sm shadow-maroon-900/20"
        >
          Add your first application
        </button>
        <button
          onClick={onSeed}
          className="inline-flex items-center justify-center px-5 py-2.5
                     border border-stone-200 text-stone-500 text-sm rounded-xl
                     hover:bg-stone-50 transition-colors"
        >
          Load sample data
        </button>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────── */
export default function TrackerPage() {
  const location = useLocation()

  const [applications, setApplications] = useState(() => getApplications())
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [prefill,      setPrefill]      = useState(null)
  const [query,        setQuery]        = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort,         setSort]         = useState('newest')

  useEffect(() => {
    if (location.state?.prefill) {
      setPrefill(location.state.prefill)
      setModalOpen(true)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  function refresh() { setApplications(getApplications()) }

  function handleSave(fields) {
    if (editTarget) updateApplication(editTarget.id, fields)
    else            createApplication(fields)
    refresh()
    setModalOpen(false)
    setEditTarget(null)
    setPrefill(null)
  }

  function handleEdit(app) {
    setEditTarget(app)
    setPrefill(null)
    setModalOpen(true)
  }

  function handleCloseModal() {
    setModalOpen(false)
    setEditTarget(null)
    setPrefill(null)
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    const list = applications.filter(a => {
      if (statusFilter && a.status !== statusFilter) return false
      if (!q) return true
      return (
        a.professorName.toLowerCase().includes(q) ||
        a.labName.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q) ||
        a.researchArea.toLowerCase().includes(q) ||
        a.notes.toLowerCase().includes(q)
      )
    })

    const sortFn = {
      newest: (a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated),
      oldest: (a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated),
      name:   (a, b) => a.professorName.localeCompare(b.professorName),
      status: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
    }[sort] ?? (() => 0)

    return list.sort(sortFn)
  }, [applications, query, statusFilter, sort])

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* ── Header ────────────────────────────────────────── */}
        <Reveal>
          <div className="flex items-start justify-between gap-4 mb-7 flex-wrap">
            <div>
              <h1 className="font-display font-bold text-stone-900 text-3xl tracking-tight">
                My Applications
              </h1>
              <p className="text-sm text-stone-500 mt-1">
                Track every lab and professor you reach out to.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {applications.length > 0 && (
                <button
                  onClick={() => exportToCSV(applications)}
                  className="px-3.5 py-2 text-sm border border-stone-200 text-stone-600
                             rounded-xl hover:bg-stone-50 transition-colors font-medium"
                >
                  Export CSV
                </button>
              )}
              <button
                onClick={() => { setEditTarget(null); setPrefill(null); setModalOpen(true) }}
                className="px-4 py-2 bg-maroon-700 text-cream-100 text-sm font-semibold
                           rounded-xl hover:bg-maroon-600 transition-colors shadow-sm
                           shadow-maroon-900/20"
              >
                + Add
              </button>
            </div>
          </div>
        </Reveal>

        {/* ── Summary cards ─────────────────────────────────── */}
        {applications.length > 0 && (
          <Reveal delay={50}>
            <div className="mb-6">
              <ApplicationsSummaryCards applications={applications} />
            </div>
          </Reveal>
        )}

        {/* ── Empty or list ─────────────────────────────────── */}
        {applications.length === 0 ? (
          <EmptyState
            hasFilters={false}
            onAdd={() => { setEditTarget(null); setPrefill(null); setModalOpen(true) }}
            onSeed={() => { seedDemoData(); refresh() }}
          />
        ) : (
          <div className="space-y-4">
            <Reveal delay={80}>
              <ApplicationsToolbar
                query={query}               onQuery={setQuery}
                statusFilter={statusFilter} onStatusFilter={setStatusFilter}
                sort={sort}                 onSort={setSort}
                total={filtered.length}
              />
            </Reveal>

            {filtered.length === 0 ? (
              <EmptyState hasFilters onAdd={() => { setEditTarget(null); setModalOpen(true) }} />
            ) : (
              <div className="space-y-3">
                {filtered.map((app, i) => (
                  <Reveal key={app.id} delay={Math.min(i * 25, 150)}>
                    <ApplicationCard
                      app={app}
                      onEdit={handleEdit}
                      onDelete={id => { deleteApplication(id); refresh() }}
                      onUpdate={(id, updates) => { updateApplication(id, updates); refresh() }}
                    />
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {modalOpen && (
        <ApplicationFormModal
          initial={editTarget}
          prefill={editTarget ? null : prefill}
          onSave={handleSave}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}
