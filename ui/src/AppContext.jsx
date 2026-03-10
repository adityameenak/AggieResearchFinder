import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { extractTopicsFromFaculty, loadSearchCounts, saveSearchCounts, mergeTopics } from './utils/topics'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [faculty, setFaculty]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  // Saved IDs persisted to localStorage
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tamu_saved_profs') || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    fetch('/faculty.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setFaculty(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  // Derived: unique sorted department slugs from loaded data
  const departments = [...new Set(
    faculty.map(f => f.department).filter(Boolean)
  )].sort()

  // Adaptive topic chips: data-derived defaults + search behavior boost
  const [searchCounts, setSearchCounts] = useState(() => loadSearchCounts())

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
      saveSearchCounts(next)
      return next
    })
  }

  function toggleSave(id) {
    setSaved(prev => {
      const next = prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
      localStorage.setItem('tamu_saved_profs', JSON.stringify(next))
      return next
    })
  }

  function isSaved(id) {
    return saved.includes(id)
  }

  function clearSaved() {
    setSaved([])
    localStorage.removeItem('tamu_saved_profs')
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
