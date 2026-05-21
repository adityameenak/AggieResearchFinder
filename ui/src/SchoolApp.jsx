import { useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { SchoolProvider } from './SchoolContext'
import { AppProvider }    from './AppContext'
import { getSchool }      from './schools'
import NavBar     from './components/NavBar'
import Footer     from './components/Footer'
import Home       from './pages/Home'
import Results    from './pages/Results'
import ProfDetail from './pages/ProfDetail'
import Saved      from './pages/Saved'
import About      from './pages/About'
import Discover   from './pages/Discover'
import Match      from './pages/Match'
import Tracker    from './pages/TrackerPage'

export default function SchoolApp() {
  // Stamp the active school code onto <html> so the CSS variable overrides in
  // index.css (e.g. [data-school="rice"]) cascade through the whole document,
  // including portals like modals that render outside our wrapper.
  const { schoolCode } = useParams()
  useEffect(() => {
    const code = getSchool(schoolCode)?.code
    if (code) {
      document.documentElement.setAttribute('data-school', code)
    }
    return () => {
      // Clear on unmount so the Landing page reverts to defaults
      document.documentElement.removeAttribute('data-school')
    }
  }, [schoolCode])

  return (
    <SchoolProvider>
      <AppProvider>
        <div className="min-h-screen flex flex-col">
          <NavBar />
          <main className="flex-1">
            <Routes>
              <Route index           element={<Home />}       />
              <Route path="search"   element={<Results />}    />
              <Route path="results"  element={<Navigate to="../search" replace />} />
              <Route path="prof/:id" element={<ProfDetail />} />
              <Route path="saved"    element={<Saved />}      />
              <Route path="about"    element={<About />}      />
              <Route path="discover" element={<Discover />}   />
              <Route path="match"    element={<Match />}      />
              <Route path="tracker"  element={<Tracker />}    />
            </Routes>
          </main>
          <Footer />
        </div>
      </AppProvider>
    </SchoolProvider>
  )
}
