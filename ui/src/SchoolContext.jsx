import { createContext, useContext } from 'react'
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
 */
export function useSchoolPath() {
  const school = useSchool()
  return (path = '') => {
    const clean = String(path).replace(/^\/+/, '')
    return clean ? `/${school.code}/${clean}` : `/${school.code}`
  }
}
