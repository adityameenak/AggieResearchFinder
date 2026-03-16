/* ── Applications Tracker — localStorage persistence layer ─────────
 *
 * All persistence lives here. To migrate to a real backend, replace
 * the body of each exported function with an API call and keep the
 * same signatures — no component changes required.
 *
 * localStorage key: 'tamu_applications'
 * ──────────────────────────────────────────────────────────────── */

export const STORAGE_KEY = 'tamu_applications'

/** All valid application statuses — edit here to add / rename */
export const STATUSES = [
  'Not Started',
  'Drafting Email',
  'Applied',
  'Follow Up Sent',
  'Interview Scheduled',
  'Accepted',
  'Rejected',
  'Closed',
]

/** Visual config for each status — used by StatusBadge + summary cards */
export const STATUS_CONFIG = {
  'Not Started':         { bg: 'bg-stone-100',   text: 'text-stone-600',   dot: 'bg-stone-400',   ring: 'ring-stone-200',   cardAccent: 'border-l-stone-300'   },
  'Drafting Email':      { bg: 'bg-blue-50',     text: 'text-blue-700',    dot: 'bg-blue-400',    ring: 'ring-blue-200',    cardAccent: 'border-l-blue-300'    },
  'Applied':             { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',   ring: 'ring-amber-200',   cardAccent: 'border-l-amber-400'   },
  'Follow Up Sent':      { bg: 'bg-orange-50',   text: 'text-orange-700',  dot: 'bg-orange-500',  ring: 'ring-orange-200',  cardAccent: 'border-l-orange-400'  },
  'Interview Scheduled': { bg: 'bg-violet-50',   text: 'text-violet-700',  dot: 'bg-violet-500',  ring: 'ring-violet-200',  cardAccent: 'border-l-violet-400'  },
  'Accepted':            { bg: 'bg-green-50',    text: 'text-green-800',   dot: 'bg-green-500',   ring: 'ring-green-200',   cardAccent: 'border-l-green-400'   },
  'Rejected':            { bg: 'bg-red-50',      text: 'text-red-700',     dot: 'bg-red-400',     ring: 'ring-red-200',     cardAccent: 'border-l-red-300'     },
  'Closed':              { bg: 'bg-stone-100',   text: 'text-stone-500',   dot: 'bg-stone-300',   ring: 'ring-stone-200',   cardAccent: 'border-l-stone-200'   },
}

const FALLBACK_CONFIG = { bg: 'bg-stone-100', text: 'text-stone-600', dot: 'bg-stone-400', ring: 'ring-stone-200', cardAccent: 'border-l-stone-300' }
export function statusConfig(status) {
  return STATUS_CONFIG[status] ?? FALLBACK_CONFIG
}

/* ── CRUD ─────────────────────────────────────────────────────── */

export function getApplications() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveApplications(apps) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps))
}

/** Create a new application. Returns the created record. */
export function createApplication(fields) {
  const apps = getApplications()
  const now  = new Date().toISOString()
  const app  = {
    professorName: '',
    labName:       '',
    department:    '',
    researchArea:  '',
    status:        'Not Started',
    dateApplied:   '',
    lastUpdated:   now,
    followUpDate:  '',
    emailUsed:     '',
    notes:         '',
    sourceLink:    '',
    pinned:        false,
    ...fields,
    id:          generateId(),
    lastUpdated: now,
  }
  apps.unshift(app)
  saveApplications(apps)
  return app
}

/** Update fields on an existing application. Returns the updated record or null. */
export function updateApplication(id, updates) {
  const apps = getApplications()
  const idx  = apps.findIndex(a => a.id === id)
  if (idx === -1) return null
  const updated  = { ...apps[idx], ...updates, lastUpdated: new Date().toISOString() }
  apps[idx]      = updated
  saveApplications(apps)
  return updated
}

/** Delete an application by id. */
export function deleteApplication(id) {
  saveApplications(getApplications().filter(a => a.id !== id))
}

/* ── Export ───────────────────────────────────────────────────── */

export function exportToCSV(apps) {
  const headers = [
    'Professor Name', 'Lab Name', 'Department', 'Research Area',
    'Status', 'Date Applied', 'Follow-Up Date', 'Email Used',
    'Notes', 'Source Link', 'Last Updated',
  ]
  const esc = v => `"${String(v ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`
  const rows = apps.map(a => [
    a.professorName, a.labName, a.department, a.researchArea,
    a.status, a.dateApplied, a.followUpDate, a.emailUsed,
    a.notes, a.sourceLink, a.lastUpdated,
  ].map(esc).join(','))
  const csv  = [headers.join(','), ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href     = url
  link.download = `research-applications-${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/* ── Demo seed data ───────────────────────────────────────────── */

export function seedDemoData() {
  const offset = days => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }
  const ts = daysAgo => new Date(Date.now() - daysAgo * 86400000).toISOString()

  const demos = [
    {
      id: 'demo_1',
      professorName: 'Dr. Sarah Chen',
      labName:       'Autonomous Robotics & Intelligence Lab',
      department:    'cse',
      researchArea:  'Autonomous Systems, Machine Learning, Robot Perception',
      status:        'Applied',
      dateApplied:   offset(-12),
      followUpDate:  offset(2),
      emailUsed:     'student@tamu.edu',
      notes:         'Sent initial email. Professor mentioned she has openings for motivated undergrads this fall. Mentioned her recent ICRA paper in my email.',
      sourceLink:    '',
      pinned:        true,
      lastUpdated:   ts(2),
    },
    {
      id: 'demo_2',
      professorName: 'Dr. James Patel',
      labName:       'Combustion & Energy Systems Lab',
      department:    'aerospace',
      researchArea:  'High-speed combustion, Propulsion, Laser diagnostics',
      status:        'Interview Scheduled',
      dateApplied:   offset(-20),
      followUpDate:  offset(5),
      emailUsed:     'student@tamu.edu',
      notes:         'Interview scheduled for next Thursday via Zoom at 2pm. Prepare questions about the lab funding and project scope.',
      sourceLink:    '',
      pinned:        false,
      lastUpdated:   ts(1),
    },
    {
      id: 'demo_3',
      professorName: 'Dr. Maria Rodriguez',
      labName:       'Neural Interfaces & Biomedical Devices Lab',
      department:    'biomedical',
      researchArea:  'Neural interfaces, Brain-machine interfaces, Medical devices',
      status:        'Follow Up Sent',
      dateApplied:   offset(-30),
      followUpDate:  offset(-2),
      emailUsed:     'student@tamu.edu',
      notes:         'No response after 2 weeks. Sent a polite follow-up email on 3/5.',
      sourceLink:    '',
      pinned:        false,
      lastUpdated:   ts(3),
    },
    {
      id: 'demo_4',
      professorName: 'Dr. Kevin Wu',
      labName:       'Advanced Materials Design Group',
      department:    'materials',
      researchArea:  'Nanomaterials, 2D materials, Thin-film synthesis',
      status:        'Drafting Email',
      dateApplied:   '',
      followUpDate:  '',
      emailUsed:     '',
      notes:         'Working on a tailored cold email. Found through the ResearchFinder match feature.',
      sourceLink:    '',
      pinned:        false,
      lastUpdated:   ts(5),
    },
    {
      id: 'demo_5',
      professorName: 'Dr. Lisa Thompson',
      labName:       'Computational Fluid Dynamics Lab',
      department:    'mechanical',
      researchArea:  'Turbulence modeling, CFD, Heat transfer',
      status:        'Rejected',
      dateApplied:   offset(-45),
      followUpDate:  '',
      emailUsed:     'student@tamu.edu',
      notes:         'Received a kind rejection. Lab is full for this semester. She suggested applying again in spring.',
      sourceLink:    '',
      pinned:        false,
      lastUpdated:   ts(10),
    },
  ]
  saveApplications(demos)
  return demos
}

/* ── Helpers ──────────────────────────────────────────────────── */

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** Returns days until followUpDate. Negative = overdue. null if no date. */
export function daysUntilFollowUp(followUpDate) {
  if (!followUpDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(followUpDate + 'T00:00:00')
  return Math.round((due - today) / 86400000)
}

/** Compute summary counts for the dashboard cards */
export function computeSummary(apps) {
  return {
    total:     apps.length,
    awaiting:  apps.filter(a => ['Applied', 'Follow Up Sent', 'Drafting Email', 'Not Started'].includes(a.status)).length,
    interview: apps.filter(a => a.status === 'Interview Scheduled').length,
    accepted:  apps.filter(a => a.status === 'Accepted').length,
    rejected:  apps.filter(a => a.status === 'Rejected').length,
  }
}

/** Format ISO date string to readable form */
export function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Relative time: "2 days ago", "just now", etc. */
export function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hrs   = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hrs   < 24) return `${hrs}h ago`
  if (days  <  7) return `${days}d ago`
  if (days  < 30) return `${Math.floor(days / 7)}w ago`
  return fmtDate(iso)
}
