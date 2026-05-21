import { Routes, Route, Navigate } from 'react-router-dom'
import { SchoolProvider } from './SchoolContext'
import { AppProvider }    from './AppContext'
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
