import { useState } from 'react'
import { fmtDate, relativeTime, statusConfig, STATUSES, daysUntilFollowUp } from '../../utils/trackerStorage'
import StatusBadge from './StatusBadge'
import FollowUpReminder from './FollowUpReminder'

/* ── Dept label helper (matches deptLabel from search.js) */
const DEPT_LABELS = {
  aerospace: 'Aerospace Eng.', biomedical: 'Biomedical Eng.', chemical: 'Chemical Eng.',
  civil: 'Civil Eng.', cse: 'Computer Science', electrical: 'Electrical Eng.',
  etid: 'Eng. Technology', industrial: 'Industrial Eng.', materials: 'Materials Sci.',
  mechanical: 'Mechanical Eng.', multidisciplinary: 'Multidisciplinary', nuclear: 'Nuclear Eng.',
  ocean: 'Ocean Eng.', petroleum: 'Petroleum Eng.', biology: 'Biology',
  chemistry: 'Chemistry', mathematics: 'Mathematics', 'physics-astronomy': 'Physics & Astronomy',
  statistics: 'Statistics', 'atmos-science': 'Atmospheric Science',
  'geology-geophysics': 'Geology & Geophysics', oceanography: 'Oceanography',
  'psychological-brain-sciences': 'Psychological & Brain Sciences',
}
function deptLabel(d) { return DEPT_LABELS[d] ?? (d ? d.charAt(0).toUpperCase() + d.slice(1) : '') }

/* ── Pin icon */
function PinIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M9.828 4.172a.75.75 0 0 1 1.06 0l5 5a.75.75 0 0 1-1.06 1.061L13.5 8.914V13l1.47 1.47a.75.75 0 0 1-1.06 1.06l-1-1a.75.75 0 0 1-.22-.53v-1h-5v1a.75.75 0 0 1-.22.53l-1 1a.75.75 0 0 1-1.06-1.06L6.5 13V8.914L5.172 10.233a.75.75 0 0 1-1.06-1.06l5-5a.75.75 0 0 1 .716-.19v-.81Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <path d="M9.828 4.172a.75.75 0 0 1 1.06 0l5 5a.75.75 0 0 1-1.06 1.061L13.5 8.914V13l1.47 1.47a.75.75 0 0 1-1.06 1.06l-1-1a.75.75 0 0 1-.22-.53v-1h-5v1a.75.75 0 0 1-.22.53l-1 1a.75.75 0 0 1-1.06-1.06L6.5 13V8.914L5.172 10.233a.75.75 0 0 1-1.06-1.06l5-5Z" />
    </svg>
  )
}

/* ── Status quick-advance */
const QUICK_ADVANCE = {
  'Not Started':   'Drafting Email',
  'Drafting Email': 'Applied',
  'Applied':        'Follow Up Sent',
  'Follow Up Sent': 'Interview Scheduled',
}

export default function ApplicationCard({ app, onEdit, onDelete, onUpdate }) {
  const [expanded, setExpanded]   = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const cfg     = statusConfig(app.status)
  const nextStatus = QUICK_ADVANCE[app.status]
  const followDays = daysUntilFollowUp(app.followUpDate)
  const isFollowUpUrgent = followDays !== null && followDays <= 3

  function handleQuickStatus() {
    if (nextStatus) onUpdate(app.id, { status: nextStatus })
  }

  function handleStatusSelect(s) {
    onUpdate(app.id, { status: s })
    setStatusOpen(false)
  }

  return (
    <article
      className={`relative bg-white rounded-xl border border-stone-200 shadow-sm
                  shadow-stone-900/[0.04] hover:shadow-lg hover:shadow-stone-900/[0.08]
                  hover:border-stone-300 transition-all duration-200 overflow-hidden
                  border-l-4 ${cfg.cardAccent}`}
    >
      {/* Pinned indicator */}
      {app.pinned && (
        <div className="absolute top-3 right-3 text-maroon-600 opacity-50">
          <PinIcon filled />
        </div>
      )}

      <div className="p-4 sm:p-5">
        {/* ── Row 1: name + status ─────────────────────────── */}
        <div className="flex items-start gap-3 mb-3">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-stone-100 border border-stone-200
                          flex items-center justify-center flex-shrink-0 text-sm
                          font-bold text-stone-500">
            {(app.professorName || '?')[0]}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-semibold text-stone-900 text-[15px] leading-snug truncate">
                  {app.professorName || <span className="text-stone-400 italic">Unknown Professor</span>}
                </h3>
                {app.labName && (
                  <p className="text-[12px] text-stone-500 truncate mt-0.5">{app.labName}</p>
                )}
              </div>

              {/* Status — click to change */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setStatusOpen(v => !v)}
                  title="Change status"
                  className="hover:opacity-80 transition-opacity"
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
                          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig(s).dot}`} />
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
              {app.department && (
                <span className="text-[11px] text-stone-400 font-medium">
                  {deptLabel(app.department)}
                </span>
              )}
              {app.researchArea && (
                <span className="text-[11px] text-stone-400 truncate max-w-[200px]">
                  {app.researchArea}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: dates + reminders ─────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {app.dateApplied && (
            <span className="text-[11px] text-stone-400 flex items-center gap-1">
              <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3 opacity-60">
                <path fillRule="evenodd" d="M4 1.5a.5.5 0 0 1 1 0V2h4V1.5a.5.5 0 0 1 1 0V2h.5A1.5 1.5 0 0 1 12 3.5v7A1.5 1.5 0 0 1 10.5 12h-7A1.5 1.5 0 0 1 2 10.5v-7A1.5 1.5 0 0 1 3.5 2H4V1.5ZM3.5 3a.5.5 0 0 0-.5.5V5h8V3.5a.5.5 0 0 0-.5-.5h-7Z" clipRule="evenodd" />
              </svg>
              Applied {fmtDate(app.dateApplied)}
            </span>
          )}
          {app.followUpDate && !isFollowUpUrgent && (
            <span className="text-[11px] text-stone-400 flex items-center gap-1">
              <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3 opacity-60">
                <path fillRule="evenodd" d="M7 13A6 6 0 1 0 7 1a6 6 0 0 0 0 12Zm.5-8.5a.5.5 0 0 0-1 0v3.25c0 .276.224.5.5.5h2.5a.5.5 0 0 0 0-1H7.5V4.5Z" clipRule="evenodd" />
              </svg>
              Follow-up {fmtDate(app.followUpDate)}
            </span>
          )}
          {isFollowUpUrgent && (
            <FollowUpReminder followUpDate={app.followUpDate} showDate />
          )}
          <span className="text-[11px] text-stone-300 flex items-center gap-1 ml-auto">
            Updated {relativeTime(app.lastUpdated)}
          </span>
        </div>

        {/* ── Notes preview ────────────────────────────────── */}
        {app.notes && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full text-left mb-3"
          >
            <p className={`text-[12px] text-stone-500 leading-relaxed bg-stone-50
                           rounded-lg px-3 py-2.5 border border-stone-100
                           hover:border-stone-200 transition-colors
                           ${expanded ? '' : 'line-clamp-2'}`}>
              {app.notes}
            </p>
            {app.notes.length > 120 && (
              <span className="text-[11px] text-stone-400 hover:text-stone-600 transition-colors mt-1 block">
                {expanded ? 'Show less' : 'Show more'}
              </span>
            )}
          </button>
        )}

        {/* ── Quick actions ─────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap pt-2.5 border-t border-stone-100">
          {/* Advance status */}
          {nextStatus && (
            <button
              onClick={handleQuickStatus}
              className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                         rounded-lg bg-maroon-700 text-cream-100 hover:bg-maroon-600
                         transition-colors font-semibold"
            >
              Mark: {nextStatus}
            </button>
          )}

          {/* Edit */}
          <button
            onClick={() => onEdit(app)}
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                       rounded-lg border border-stone-200 text-stone-600
                       hover:border-stone-300 hover:bg-stone-50 transition-colors font-medium"
          >
            <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3 opacity-70">
              <path d="M9.116 1.116a2.25 2.25 0 1 1 3.182 3.182L4.5 12.096l-3.75.75.75-3.75 7.616-7.98Z" />
            </svg>
            Edit
          </button>

          {/* Pin */}
          <button
            onClick={() => onUpdate(app.id, { pinned: !app.pinned })}
            title={app.pinned ? 'Unpin' : 'Pin to top'}
            className={`inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                        rounded-lg border transition-colors font-medium
                        ${app.pinned
                          ? 'border-maroon-200 bg-maroon-50 text-maroon-700 hover:bg-maroon-100'
                          : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:bg-stone-50'
                        }`}
          >
            <PinIcon filled={app.pinned} />
            {app.pinned ? 'Pinned' : 'Pin'}
          </button>

          {/* Source link */}
          {app.sourceLink && (
            <a
              href={app.sourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                         rounded-lg border border-stone-200 text-stone-600
                         hover:border-stone-300 hover:bg-stone-50 transition-colors font-medium"
            >
              <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-60">
                <path d="M3.5 3a.5.5 0 0 0 0 1H7.29L2.15 9.15a.5.5 0 1 0 .7.7L8 4.71V8.5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5h-5Z" />
              </svg>
              View Source
            </a>
          )}

          {/* Delete */}
          <button
            onClick={() => {
              if (window.confirm(`Delete application for ${app.professorName}?`)) {
                onDelete(app.id)
              }
            }}
            className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5
                       rounded-lg border border-stone-200 text-red-500
                       hover:border-red-200 hover:bg-red-50 transition-colors
                       font-medium ml-auto"
          >
            <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3 opacity-80">
              <path fillRule="evenodd" d="M6 1.5h2a.5.5 0 0 1 .5.5H12a.5.5 0 0 1 0 1h-.5v8A1.5 1.5 0 0 1 10 12.5H4A1.5 1.5 0 0 1 2.5 11V3H2a.5.5 0 0 1 0-1h3.5a.5.5 0 0 1 .5-.5Zm-.5 3a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0V4.5Zm3 0a.5.5 0 0 0-1 0v5a.5.5 0 0 0 1 0V4.5Z" clipRule="evenodd" />
            </svg>
            Delete
          </button>
        </div>
      </div>
    </article>
  )
}
