import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar     from './components/NavBar'
import Footer     from './components/Footer'
import Home       from './pages/Home'
import Search     from './pages/Results'   // file kept as Results.jsx
import ProfDetail from './pages/ProfDetail'
import Saved      from './pages/Saved'
import About      from './pages/About'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar />
      <main className="flex-1">
        <Routes>
          <Route path="/"         element={<Home />}       />
          <Route path="/search"   element={<Search />}     />
          <Route path="/results"  element={<Navigate to="/search" replace />} />
          <Route path="/prof/:id" element={<ProfDetail />} />
          <Route path="/saved"    element={<Saved />}      />
          <Route path="/about"    element={<About />}      />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
