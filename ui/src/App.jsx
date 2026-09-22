import { Routes, Route, Navigate } from 'react-router-dom'
import Landing   from './pages/Landing'
import SchoolApp from './SchoolApp'
import StatePage from './pages/StatePage'
import McpPage   from './pages/McpPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/schools/:state" element={<StatePage />} />
      {/* Before /:schoolCode/* so "mcp" is not read as a school code. */}
      <Route path="/mcp" element={<McpPage />} />
      <Route path="/:schoolCode/*" element={<SchoolApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
