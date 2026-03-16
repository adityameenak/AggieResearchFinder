import { useState } from 'react'
import { fmtDate, relativeTime, statusConfig, STATUSES, daysUntilFollowUp } from '../../utils/trackerStorage'
import StatusBadge from './StatusBadge'
import FollowUpReminder from './FollowUpReminder'

const DEPT_LABELS = {
  aerospace: 'Aerospace', biomedical: 'Biomedical', chemical: 'Chemical',
  civil: 'Civil', cse: 'Computer Science', electrical: 'Electrical',
  etid: 'Eng. Technology', industrial: 'Industrial', materials: 'Materials',
  mechanical: 'Mechanical', multidisciplinary: 'Multidisciplinary', nuclear: 'Nuclear',
  ocean: 'Ocean', petroleum: 'Petroleum', biology: 'Biology',
  chemistry: 'Chemistry', mathematics: 'Mathematics', 'physics-astronomy': 'Physics & Astronomy',
  statistics: 'Statistics', 'atmos-science': 'Atmospheric Science',
  'geology-geophysics': 'Geology & Geophysics', oceanography: 'Oceanography',
  'psychological-brain-sciences': 'Psych & Brain Sciences',
}
function deptLabel(d) { return DEPT_LABELS[d] ?? (d ? d.charAt(0).toUpperCase() + d.slice(1) : '') }

export default function ApplicationCard({ app, onEdit, onDelete, onUpdate }) {
  const [statusOpen, setStatusOpen] = useState(false)
  const cfg = statusConfig(app.status)
  const followDays = daysUntilFollowUp(app.followUpDate)
  const isFollowUpUrgent = followDays !== null && followDays <= 3

  function handleStatusSelect(s) {
    onUpdate(app.id, { status: s })
    setStatusOpen(false)
  }

  return (
    <article
      className={`bg-white rounded-xl border border-stone-200 shadow-sm
                  shadow-stone-900/[0.04] hover:shadow-md hover:shadow-stone-900/[0.07]
                  hover:border-stone-300 transition-all duration-200
                  border-l-4 ${cfg.cardAccent}`}
    >
      <div className="p-4 sm:p-5">

        {/* ── Top row: name + status ───────────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-stone-900 text-[15px] leading-snug">
              {app.professorName || <span className="text-stone-400 italic">Unknown Professor</span>}
            </h3>
            {app.labName && (
              <p className="text-[12px] text-stone-500 mt-0.5">{app.labName}</p>
            )}
          </div>

          {/* Clickable status badge */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setStatusOpen(v => !v)}
              title="Change status"
              className="hover:opacity-75 transition-opacity"
            >
              <StatusBadge status={app.status} />
            </button>

            {statusOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl
                                border border-stone-200 shadow-xl shadow-stone-900/10
                                py-1 min-w-[160px] overflow-hidden">
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatusSelect(s)}
                      className={`w-full text-left px-3 py-2 text-[12px] font-medium
                                  hover:bg-stone-50 transition-colors flex items-center gap-2
                                  ${s === app.status ? 'text-maroon-700 bg-maroon-50/50' : 'text-stone-700'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusConfig(s).dot}`} />
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Meta: dept · research area · dates ───────────── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px] text-stone-400">
          {app.department && <span>{deptLabel(app.department)}</span>}
          {app.researchArea && <span className="truncate max-w-[200px]">{app.researchArea}</span>}
          {app.dateApplied && <span>Applied {fmtDate(app.dateApplied)}</span>}
          {app.followUpDate && !isFollowUpUrgent && <span>Follow-up {fmtDate(app.followUpDate)}</span>}
          {isFollowUpUrgent && <FollowUpReminder followUpDate={app.followUpDate} showDate />}
          <span className="ml-auto text-stone-300">{relativeTime(app.lastUpdated)}</span>
        </div>

        {/* ── Notes ────────────────────────────────────────── */}
        {app.notes && (
          <p className="text-[12px] text-stone-500 leading-relaxed bg-stone-50 rounded-lg
                        px-3 py-2.5 border border-stone-100 line-clamp-2 mb-3">
            {app.notes}
          </p>
        )}

        {/* ── Actions ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-2.5 border-t border-stone-100">
          <button
            onClick={() => onEdit(app)}
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                       rounded-lg border border-stone-200 text-stone-600
                       hover:border-stone-300 hover:bg-stone-50 transition-colors font-medium"
          >
            Edit
          </button>

          {app.sourceLink && (
            <a
              href={app.sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] px-3 py-1.5
                         rounded-lg border border-stone-200 text-stone-600
                         hover:border-stone-300 hover:bg-stone-50 transition-colors font-medium"
            >
              Profile
              <svg viewBox="0 0 10 10" fill="currentColor" className="w-2 h-2 opacity-50">
                <path d="M3 3a.5.5 0 0 0 0 1H6.29L1.15 9.15a.5.5 0 1 0 .7.7L7 4.71V8a.5.5 0 0 0 1 0V3.5A.5.5 0 0 0 7.5 3H3Z" />
              </svg>
            </a>
          )}

          <button
            onClick={() => {
              if (window.confirm(`Delete application for ${app.professorName}?`)) onDelete(app.id)
            }}
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                       rounded-lg border border-stone-200 text-red-400
                       hover:border-red-200 hover:bg-red-50 transition-colors font-medium ml-auto"
          >
            Delete
          </button>
        </div>

      </div>
    </article>
  )
}
