import { createContext, useContext, useCallback } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { getSchool } from './schools'

const SchoolContext = createContext(null)

export function SchoolProvider({ children }) {
  const { schoolCode } = useParams()
  const school = getSchool(schoolCode)
  if (!school) return <Navigate to="/" replace />
  return <SchoolContext.Provider value={school}>{children}</SchoolContext.Provider>
}

export function useSchool() {
  const ctx = useContext(SchoolContext)
  if (!ctx) throw new Error('useSchool must be used inside SchoolProvider')
  return ctx
}

/**
 * Returns a function that prefixes a path with the current school's URL
 * segment. Pass either '/search' or 'search' — both yield '/<code>/search'.
 *
 * Memoized on the school code: pages list `tx` in effect dependencies, and a
 * fresh function per render re-fired those effects on every render — Match's
 * session effect set state each time, re-running matchFaculty over ~1,600
 * records in a loop.
 */
export function useSchoolPath() {
  const { code } = useSchool()
  return useCallback((path = '') => {
    const clean = String(path).replace(/^\/+/, '')
    return clean ? `/${code}/${clean}` : `/${code}`
  }, [code])
}
