import { createContext, useContext, useState, useEffect } from 'react'

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
