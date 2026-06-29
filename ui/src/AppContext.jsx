import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useSchool } from './SchoolContext'
import { extractTopicsFromFaculty, loadSearchCounts, saveSearchCounts, mergeTopics } from './utils/topics'
import {
  getApplications, createApplication, updateApplication, deleteApplication,
} from './utils/trackerStorage'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const school    = useSchool()

  const [faculty, setFaculty]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  // The unified saved / tracking list. Saving a professor IS a tracker entry
  // (status "Saved") — the My List page lets you advance status (Interested,
  // Emailed, …). AppContext is the single source of truth so the bookmark
  // state, the nav badge, and the list page never desync.
  const [applications, setApplications] = useState(() => getApplications(school.code))
  useEffect(() => { setApplications(getApplications(school.code)) }, [school.code])
  function refreshApps() { setApplications(getApplications(school.code)) }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/faculty.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        const filtered = (Array.isArray(data) ? data : [])
          .filter(f => (f.university || 'tamu').toLowerCase() === school.code)
        setFaculty(filtered)
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [school.code])

  // Derived: unique sorted department slugs from loaded data
  const departments = [...new Set(
    faculty.map(f => f.department).filter(Boolean)
  )].sort()

  // Adaptive topic chips: data-derived defaults + search behavior boost
  const [searchCounts, setSearchCounts] = useState(() => loadSearchCounts(school.code))

  // Reload search counts when the school changes (keeps each school's chips isolated)
  useEffect(() => {
    setSearchCounts(loadSearchCounts(school.code))
  }, [school.code])

  const dataTopics = useMemo(
    () => (faculty.length > 0 ? extractTopicsFromFaculty(faculty) : []),
    [faculty],
  )

  const topicChips = useMemo(
    () => mergeTopics(dataTopics, searchCounts, 15),
    [dataTopics, searchCounts],
  )

  function recordSearch(query) {
    const q = (query || '').trim().toLowerCase()
    if (!q || q.length < 2) return
    setSearchCounts(prev => {
      const next = { ...prev, [q]: (prev[q] || 0) + 1 }
      saveSearchCounts(next, school.code)
      return next
    })
  }

  function isSaved(id) {
    return applications.some(a => a.profId === id)
  }

  // Toggle a professor in/out of the saved list. Accepts a prof object
  // (preferred — captures name/dept/links) or a bare id (back-compat).
  function toggleSave(prof) {
    const id = typeof prof === 'string' ? prof : prof?.id
    if (!id) return
    const existing = applications.find(a => a.profId === id)
    if (existing) {
      deleteApplication(existing.id, school.code)
    } else {
      const p = typeof prof === 'object' && prof ? prof : {}
      createApplication({
        profId:        id,
        professorName: p.name || '',
        department:    p.department || '',
        researchArea:  (p.scholar_interests || []).slice(0, 3).join(', '),
        sourceLink:    p.profile_url || '',
        emailUsed:     p.email || '',
        status:        'Saved',
      }, school.code)
    }
    refreshApps()
  }

  // CRUD used by the My List page (kept here so all mutations flow through one
  // place and the saved-state stays consistent everywhere).
  function addApp(fields)        { createApplication(fields, school.code); refreshApps() }
  function editApp(id, updates)  { updateApplication(id, updates, school.code); refreshApps() }
  function removeApp(id)         { deleteApplication(id, school.code); refreshApps() }

  const savedCount = applications.length

  return (
    <AppContext.Provider value={{
      faculty, departments, loading, error,
      applications, savedCount, isSaved, toggleSave,
      addApp, editApp, removeApp, refreshApps,
      topicChips, recordSearch,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
