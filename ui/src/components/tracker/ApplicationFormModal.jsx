import { useState, useEffect, useRef } from 'react'
import { STATUSES } from '../../utils/trackerStorage'

const EMPTY = {
  professorName: '',
  labName:       '',
  department:    '',
  researchArea:  '',
  status:        'Not Started',
  dateApplied:   '',
  followUpDate:  '',
  emailUsed:     '',
  notes:         '',
  sourceLink:    '',
}

const DEPT_OPTIONS = [
  { value: '',                           label: 'Select department…'         },
  { value: 'aerospace',                  label: 'Aerospace Engineering'       },
  { value: 'biomedical',                 label: 'Biomedical Engineering'      },
  { value: 'chemical',                   label: 'Chemical Engineering'        },
  { value: 'civil',                      label: 'Civil Engineering'           },
  { value: 'cse',                        label: 'Computer Science'            },
  { value: 'electrical',                 label: 'Electrical Engineering'      },
  { value: 'etid',                       label: 'Engineering Technology'      },
  { value: 'industrial',                 label: 'Industrial Engineering'      },
  { value: 'materials',                  label: 'Materials Science'           },
  { value: 'mechanical',                 label: 'Mechanical Engineering'      },
  { value: 'multidisciplinary',          label: 'Multidisciplinary'           },
  { value: 'nuclear',                    label: 'Nuclear Engineering'         },
  { value: 'ocean',                      label: 'Ocean Engineering'           },
  { value: 'petroleum',                  label: 'Petroleum Engineering'       },
  { value: 'biology',                    label: 'Biology'                     },
  { value: 'chemistry',                  label: 'Chemistry'                   },
  { value: 'mathematics',               label: 'Mathematics'                 },
  { value: 'physics-astronomy',          label: 'Physics & Astronomy'         },
  { value: 'statistics',                 label: 'Statistics'                  },
  { value: 'atmos-science',              label: 'Atmospheric Science'         },
  { value: 'geology-geophysics',         label: 'Geology & Geophysics'        },
  { value: 'oceanography',               label: 'Oceanography'                },
  { value: 'psychological-brain-sciences', label: 'Psychological & Brain Sciences' },
]

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-[0.09em] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = `w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl
  text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2
  focus:ring-maroon-300 focus:border-transparent transition-shadow`

export default function ApplicationFormModal({ initial = null, prefill = null, onSave, onClose }) {
  const isEdit  = !!initial
  const firstFieldRef = useRef(null)

  const [form, setForm] = useState(() => {
    if (initial)  return { ...EMPTY, ...initial }
    if (prefill)  return { ...EMPTY, ...prefill }
    return { ...EMPTY }
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Focus first field on open
  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  function validate() {
    const e = {}
    if (!form.professorName.trim()) e.professorName = 'Professor name is required'
    return e
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    // Trim all string fields
    const cleaned = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    )
    onSave(cleaned)
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-stone-950/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Panel */}
      <div
        className="w-full sm:max-w-2xl max-h-[95dvh] bg-white rounded-t-2xl sm:rounded-2xl
                   shadow-2xl shadow-stone-900/25 flex flex-col overflow-hidden
                   animate-[modalSlideUp_0.22s_cubic-bezier(0.16,1,0.3,1)_forwards]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <h2 className="font-display font-bold text-stone-900 text-lg leading-none">
              {isEdit ? 'Edit Application' : 'Track New Application'}
            </h2>
            <p className="text-[12px] text-stone-400 mt-1">
              {isEdit ? 'Update details for this application.' : 'Save a lab or professor you\'re reaching out to.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400
                       hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
              <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">

            {/* Row: Professor + Lab */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Professor Name" required>
                <input
                  ref={firstFieldRef}
                  type="text"
                  value={form.professorName}
                  onChange={e => set('professorName', e.target.value)}
                  placeholder="Dr. Jane Smith"
                  className={`${inputCls} ${errors.professorName ? 'border-red-300 ring-red-200' : ''}`}
                />
                {errors.professorName && (
                  <p className="text-[11px] text-red-600 mt-1">{errors.professorName}</p>
                )}
              </Field>
              <Field label="Lab / Group Name">
                <input
                  type="text"
                  value={form.labName}
                  onChange={e => set('labName', e.target.value)}
                  placeholder="Combustion & Energy Lab"
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Row: Department + Research Area */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Department">
                <select
                  value={form.department}
                  onChange={e => set('department', e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  {DEPT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Research Area">
                <input
                  type="text"
                  value={form.researchArea}
                  onChange={e => set('researchArea', e.target.value)}
                  placeholder="Autonomous systems, ML"
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Row: Status + Date Applied */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                  className={`${inputCls} cursor-pointer`}
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date Applied">
                <input
                  type="date"
                  value={form.dateApplied}
                  onChange={e => set('dateApplied', e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Row: Follow-up Date + Email Used */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Follow-Up Date">
                <input
                  type="date"
                  value={form.followUpDate}
                  onChange={e => set('followUpDate', e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Email Used">
                <input
                  type="email"
                  value={form.emailUsed}
                  onChange={e => set('emailUsed', e.target.value)}
                  placeholder="you@tamu.edu"
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Source Link */}
            <Field label="Source Link">
              <input
                type="url"
                value={form.sourceLink}
                onChange={e => set('sourceLink', e.target.value)}
                placeholder="https://engineering.tamu.edu/…"
                className={inputCls}
              />
            </Field>

            {/* Notes */}
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Anything useful — key topics to mention, what you learned from their paper, their response, next steps…"
                rows={4}
                className={`${inputCls} resize-none`}
              />
            </Field>

          </div>

          {/* Footer actions */}
          <div className="sticky bottom-0 bg-white border-t border-stone-100 px-5 py-4
                          flex items-center gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-600 rounded-xl border border-stone-200
                         hover:bg-stone-50 hover:border-stone-300 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-maroon-700 text-cream-100 text-sm font-semibold
                         rounded-xl hover:bg-maroon-600 transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed shadow-sm
                         shadow-maroon-900/20"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Track Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
