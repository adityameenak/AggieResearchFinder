import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useSchool } from './SchoolContext'
import { extractTopicsFromFaculty, loadSearchCounts, saveSearchCounts, mergeTopics } from './utils/topics'
import {
  getApplications, createApplication, updateApplication, deleteApplication,
} from './utils/trackerStorage'

const AppContext = createContext(null)

/**
 * Per-school faculty payloads, cached for the life of the page.
 *
 * The dataset used to ship as one ~9.5 MB faculty.json that every visitor
 * downloaded in full, only for AppContext to throw away 63-97% of it. It's now
 * split per school by crawler/merge.py. This cache also stops React's
 * StrictMode double-mount, and school-switching, from re-fetching.
 */
const facultyCache = new Map()

function loadFaculty(code) {
  if (!facultyCache.has(code)) {
    facultyCache.set(code, fetch(`/faculty-${code}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        facultyCache.delete(code)   // don't cache a failure
        throw err
      }))
  }
  return facultyCache.get(code)
}

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
    loadFaculty(school.code)
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

  // Department-adaptive chips: when a department is selected, derive the chips
  // from just that department's faculty so the filters get more specific
  // (e.g. aerospace surfaces "propulsion", CS surfaces "machine learning").
  function topicChipsFor(dept) {
    if (!dept) return topicChips
    const subset = faculty.filter(f => f.department === dept)
    if (subset.length === 0) return topicChips
    return mergeTopics(extractTopicsFromFaculty(subset), searchCounts, 15)
  }

  function recordSearch(query) {
    const q = (query || '').trim().toLowerCase()
    if (!q || q.length < 2) return
    setSearchCounts(prev => {
      const next = { ...prev, [q]: (prev[q] || 0) + 1 }
      saveSearchCounts(next, school.code)
      return next
    })
  }

  // `prof` is optional: pass the record and a bookmark saved against an id that
  // merge.py retired (a joint appointment collapsed into one record) still
  // resolves, instead of silently showing as un-saved.
  function isSaved(id, prof) {
    return applications.some(a =>
      a.profId === id || (prof?.alias_ids || []).includes(a.profId))
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
      topicChips, topicChipsFor, recordSearch,
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
