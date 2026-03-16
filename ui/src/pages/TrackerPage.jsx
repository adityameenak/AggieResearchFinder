import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getApplications, createApplication, updateApplication, deleteApplication,
  exportToCSV, seedDemoData, daysUntilFollowUp, fmtDate, STATUSES, STATUS_CONFIG,
} from '../utils/trackerStorage'
import ApplicationsSummaryCards from '../components/tracker/ApplicationsSummaryCards'
import ApplicationsToolbar      from '../components/tracker/ApplicationsToolbar'
import ApplicationCard          from '../components/tracker/ApplicationCard'
import ApplicationFormModal     from '../components/tracker/ApplicationFormModal'
import StatusBadge              from '../components/tracker/StatusBadge'
import FollowUpReminder         from '../components/tracker/FollowUpReminder'
import Reveal                   from '../components/Reveal'

/* ── Status donut mini-chart ─────────────────────────────────── */
function StatusDonut({ applications }) {
  if (!applications.length) return null

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = applications.filter(a => a.status === s).length
    return acc
  }, {})

  const active = STATUSES.filter(s => counts[s] > 0)
  if (!active.length) return null

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm shadow-stone-900/[0.03]">
      <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-[0.12em] mb-4">
        Status Breakdown
      </div>
      <div className="space-y-2">
        {active.map(s => {
          const pct = Math.round((counts[s] / applications.length) * 100)
          const cfg = STATUS_CONFIG[s]
          return (
            <div key={s}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-stone-600">{s}</span>
                <span className="text-[11px] text-stone-400">{counts[s]}</span>
              </div>
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${cfg.dot} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Upcoming follow-ups strip ───────────────────────────────── */
function UpcomingFollowUps({ applications, onEdit }) {
  const upcoming = applications
    .filter(a => {
      const d = daysUntilFollowUp(a.followUpDate)
      return d !== null && d <= 7
    })
    .sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate))

  if (!upcoming.length) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⏰</span>
        <span className="text-[12px] font-semibold text-amber-800">
          Upcoming Follow-Ups ({upcoming.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {upcoming.map(app => (
          <button
            key={app.id}
            onClick={() => onEdit(app)}
            className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border
                       border-amber-200 hover:border-amber-300 hover:shadow-sm
                       transition-all text-left"
          >
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-stone-800 truncate max-w-[160px]">
                {app.professorName}
              </div>
              <div className="mt-0.5">
                <FollowUpReminder followUpDate={app.followUpDate} showDate />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Empty state ─────────────────────────────────────────────── */
function EmptyState({ hasFilters, onAdd, onSeed }) {
  if (hasFilters) {
    return (
      <div className="py-20 text-center">
        <div className="w-14 h-14 rounded-full bg-stone-100 border border-stone-200
                        flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
               strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-stone-400">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <h3 className="font-semibold text-stone-700 text-base mb-1">No results</h3>
        <p className="text-sm text-stone-400">Try adjusting your search or filters.</p>
      </div>
    )
  }

  return (
    <div className="py-24 text-center max-w-sm mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-cream-100 border border-cream-300
                      flex items-center justify-center mx-auto mb-5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25"
             strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-stone-400">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2Z" />
        </svg>
      </div>
      <h3 className="font-display font-bold text-stone-900 text-xl mb-2">
        Nothing tracked yet
      </h3>
      <p className="text-[14px] text-stone-500 leading-relaxed mb-6">
        Start tracking the labs and professors you reach out to — keep every application organized in one place.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button
          onClick={onAdd}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5
                     bg-maroon-700 text-cream-100 text-sm font-semibold rounded-xl
                     hover:bg-maroon-600 transition-colors shadow-sm shadow-maroon-900/20"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          Track your first application
        </button>
        <button
          onClick={onSeed}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5
                     border border-stone-200 text-stone-600 text-sm font-medium
                     rounded-xl hover:bg-stone-50 hover:border-stone-300 transition-colors"
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
  const [editTarget,   setEditTarget]   = useState(null)   // app being edited
  const [prefill,      setPrefill]      = useState(null)   // from URL state
  const [query,        setQuery]        = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort,         setSort]         = useState('newest')

  // Auto-open form if navigated here with prefill data (from ProfCard / ProfDetail)
  useEffect(() => {
    if (location.state?.prefill) {
      setPrefill(location.state.prefill)
      setModalOpen(true)
      // Clear state so back-navigation doesn't re-open
      window.history.replaceState({}, '')
    }
  }, [location.state])

  function refresh() { setApplications(getApplications()) }

  function handleSave(fields) {
    if (editTarget) {
      updateApplication(editTarget.id, fields)
    } else {
      createApplication(fields)
    }
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

  function handleDelete(id) {
    deleteApplication(id)
    refresh()
  }

  function handleUpdate(id, updates) {
    updateApplication(id, updates)
    refresh()
  }

  function handleAdd() {
    setEditTarget(null)
    setPrefill(null)
    setModalOpen(true)
  }

  function handleCloseModal() {
    setModalOpen(false)
    setEditTarget(null)
    setPrefill(null)
  }

  function handleSeed() {
    seedDemoData()
    refresh()
  }

  /* ── Filtered + sorted list ─────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    let list = applications.filter(a => {
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

    // Pinned always first
    const pinned   = list.filter(a => a.pinned)
    const unpinned = list.filter(a => !a.pinned)

    const sortFn = {
      newest:  (a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated),
      oldest:  (a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated),
      name:    (a, b) => a.professorName.localeCompare(b.professorName),
      status:  (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
    }[sort] ?? (() => 0)

    return [...pinned.sort(sortFn), ...unpinned.sort(sortFn)]
  }, [applications, query, statusFilter, sort])

  const hasFilters = !!(query || statusFilter)

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {/* ── Page header ───────────────────────────────────── */}
        <Reveal>
          <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
            <div>
              <div className="text-[11px] font-semibold text-stone-400 uppercase
                              tracking-[0.14em] mb-1.5">
                Aggie Research Finder
              </div>
              <h1 className="font-display font-bold text-stone-900 text-3xl sm:text-4xl
                             tracking-tight leading-tight">
                My Applications
              </h1>
              <p className="text-[14px] text-stone-500 mt-2 leading-relaxed max-w-lg">
                Track every lab you reach out to — statuses, follow-ups, and notes in one place.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {applications.length > 0 && (
                <button
                  onClick={() => exportToCSV(applications)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium
                             border border-stone-200 text-stone-600 rounded-xl
                             hover:bg-stone-50 hover:border-stone-300 transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70">
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5Z" />
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3Z" />
                  </svg>
                  Export CSV
                </button>
              )}
              <button
                onClick={handleAdd}
                className="inline-flex items-center gap-2 px-4 py-2 bg-maroon-700
                           text-cream-100 text-sm font-semibold rounded-xl
                           hover:bg-maroon-600 transition-colors shadow-sm
                           shadow-maroon-900/20"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
                </svg>
                Track Application
              </button>
            </div>
          </div>
        </Reveal>

        {/* ── Summary cards ─────────────────────────────────── */}
        {applications.length > 0 && (
          <Reveal delay={60}>
            <div className="mb-7">
              <ApplicationsSummaryCards applications={applications} />
            </div>
          </Reveal>
        )}

        {/* ── Upcoming follow-ups ───────────────────────────── */}
        {applications.length > 0 && (
          <Reveal delay={100}>
            <div className="mb-6">
              <UpcomingFollowUps applications={applications} onEdit={handleEdit} />
            </div>
          </Reveal>
        )}

        {applications.length === 0 ? (
          <EmptyState
            hasFilters={false}
            onAdd={handleAdd}
            onSeed={handleSeed}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

            {/* ── Main list ─────────────────────────────────── */}
            <div className="lg:col-span-3 space-y-4">
              {/* Toolbar */}
              <Reveal delay={120}>
                <ApplicationsToolbar
                  query={query}          onQuery={setQuery}
                  statusFilter={statusFilter} onStatusFilter={setStatusFilter}
                  sort={sort}            onSort={setSort}
                  total={filtered.length}
                />
              </Reveal>

              {/* List */}
              {filtered.length === 0 ? (
                <EmptyState hasFilters={hasFilters} onAdd={handleAdd} />
              ) : (
                <div className="space-y-3">
                  {filtered.map((app, i) => (
                    <Reveal key={app.id} delay={Math.min(i * 30, 200)}>
                      <ApplicationCard
                        app={app}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onUpdate={handleUpdate}
                      />
                    </Reveal>
                  ))}
                </div>
              )}
            </div>

            {/* ── Sidebar ───────────────────────────────────── */}
            <div className="space-y-4">
              <Reveal delay={80}>
                <StatusDonut applications={applications} />
              </Reveal>

              {/* Quick tips */}
              <Reveal delay={140}>
                <div className="bg-white rounded-xl border border-stone-200 p-4
                                shadow-sm shadow-stone-900/[0.03]">
                  <div className="text-[11px] font-semibold text-stone-400 uppercase
                                  tracking-[0.12em] mb-3">
                    Tips
                  </div>
                  <ul className="space-y-2.5 text-[12px] text-stone-500 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-stone-300">→</span>
                      Click a status badge to change it inline.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-stone-300">→</span>
                      Set a follow-up date to get reminders here.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-stone-300">→</span>
                      Pin important applications to keep them at the top.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-stone-300">→</span>
                      Use "Track Application" on any professor card to prefill.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 text-stone-300">→</span>
                      Export to CSV to share with your advisor.
                    </li>
                  </ul>
                </div>
              </Reveal>

              {/* Status legend */}
              <Reveal delay={160}>
                <div className="bg-white rounded-xl border border-stone-200 p-4
                                shadow-sm shadow-stone-900/[0.03]">
                  <div className="text-[11px] font-semibold text-stone-400 uppercase
                                  tracking-[0.12em] mb-3">
                    Status Guide
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map(s => (
                      <StatusBadge key={s} status={s} size="xs" />
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>

          </div>
        )}
      </div>

      {/* ── Form modal ────────────────────────────────────────── */}
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
