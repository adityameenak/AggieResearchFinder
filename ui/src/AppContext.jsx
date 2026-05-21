import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useSchool } from './SchoolContext'
import { extractTopicsFromFaculty, loadSearchCounts, saveSearchCounts, mergeTopics } from './utils/topics'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const school    = useSchool()
  const savedKey  = `${school.code}_saved_profs`

  const [faculty, setFaculty]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  // Saved IDs persisted to localStorage, per-school namespaced
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(savedKey) || '[]')
    } catch {
      return []
    }
  })

  // When school changes, reload the saved set from the new namespace
  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(savedKey) || '[]'))
    } catch {
      setSaved([])
    }
  }, [savedKey])

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

  function toggleSave(id) {
    setSaved(prev => {
      const next = prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
      localStorage.setItem(savedKey, JSON.stringify(next))
      return next
    })
  }

  function isSaved(id) {
    return saved.includes(id)
  }

  function clearSaved() {
    setSaved([])
    localStorage.removeItem(savedKey)
  }

  return (
    <AppContext.Provider value={{
      faculty, departments, loading, error,
      saved, toggleSave, isSaved, clearSaved,
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
