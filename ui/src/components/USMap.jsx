import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { SCHOOL_LIST } from '../schools'
import { stateNameToSlug } from '../lib/states'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

// Campus coordinates [longitude, latitude]
const SCHOOL_COORDS = {
  tamu:    [-96.3344, 30.6280],
  rice:    [-95.3698, 29.7604],
  ut:      [-97.7431, 30.2672],
  utd:     [-96.7481, 32.9483],
  mit:     [-71.0921, 42.3601],
  harvard: [-71.1167, 42.3770],
}

// Group available schools by state slug
const schoolsByState = {}
SCHOOL_LIST.filter(s => s.available).forEach(s => {
  if (!s.state) return
  if (!schoolsByState[s.state]) schoolsByState[s.state] = []
  schoolsByState[s.state].push(s)
})

const schoolStates = new Set(Object.keys(schoolsByState))

export default function USMap() {
  const navigate = useNavigate()
  const [hover, setHover] = useState({
    visible:    false,
    name:       '',
    slug:       '',
    hasSchools: false,
    x:          0,
    y:          0,
  })

  const hoveredSchools = hover.slug ? (schoolsByState[hover.slug] ?? []) : []

  return (
    <div className="relative w-full select-none">

      {/* ── Hover panel — states WITH schools ─────────────── */}
      {hover.visible && hover.hasSchools && (
        <div
          className="fixed z-50 pointer-events-none hidden sm:block"
          style={{
            top:       hover.y - 16,
            left:      hover.x + 20,
          }}
        >
          <div className="bg-white/95 backdrop-blur-sm border border-stone-200/70
                          rounded-xl shadow-lg shadow-stone-300/30
                          px-4 py-3 min-w-[200px]">
            <div className="text-[12px] font-bold text-stone-900 mb-0.5 leading-tight">
              {hover.name}
            </div>
            <div className="text-[10px] text-stone-400 mb-3 font-medium">
              {hoveredSchools.length} {hoveredSchools.length === 1 ? 'university' : 'universities'} available
            </div>
            <div className="space-y-1.5">
              {hoveredSchools.map(s => (
                <div key={s.code} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-stone-400 flex-shrink-0" />
                  <span className="text-[11px] text-stone-600 leading-snug">{s.name}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2.5 border-t border-stone-100">
              <span className="text-[9px] font-semibold text-stone-300 uppercase tracking-wider">
                Click to explore →
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── State name only — states WITHOUT schools ───────── */}
      {hover.visible && !hover.hasSchools && (
        <div
          className="fixed z-40 pointer-events-none hidden sm:block"
          style={{
            top:       hover.y - 38,
            left:      hover.x,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-stone-800/85 backdrop-blur-sm text-white text-[11px]
                          font-medium px-2.5 py-1 rounded-lg shadow-md whitespace-nowrap">
            {hover.name}
          </div>
        </div>
      )}

      {/* ── Map ─────────────────────────────────────────────── */}
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: '100%', height: 'auto' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name      = geo.properties.name
              const slug      = stateNameToSlug(name)
              const hasSchools = schoolStates.has(slug)

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onClick={() => navigate(`/schools/${slug}`)}
                  onMouseEnter={(e) =>
                    setHover({ visible: true, name, slug, hasSchools, x: e.clientX, y: e.clientY })
                  }
                  onMouseMove={(e) =>
                    setHover(prev => ({ ...prev, x: e.clientX, y: e.clientY }))
                  }
                  onMouseLeave={() =>
                    setHover(prev => ({ ...prev, visible: false }))
                  }
                  style={{
                    default: {
                      fill:        hasSchools ? '#CDD0D9' : '#E4E5E8',
                      stroke:      '#FFFFFF',
                      strokeWidth: 0.8,
                      outline:     'none',
                      cursor:      'pointer',
                      transition:  'fill 160ms ease',
                    },
                    hover: {
                      fill:        '#4A5568',
                      stroke:      '#FFFFFF',
                      strokeWidth: 0.8,
                      outline:     'none',
                      cursor:      'pointer',
                    },
                    pressed: {
                      fill:        '#2D3748',
                      stroke:      '#FFFFFF',
                      strokeWidth: 0.8,
                      outline:     'none',
                    },
                  }}
                />
              )
            })
          }
        </Geographies>

        {/* ── School pins — only visible while hovering their state ── */}
        {hover.visible && hover.hasSchools && hoveredSchools.map(school => {
          const coords = SCHOOL_COORDS[school.code]
          if (!coords) return null
          return (
            <Marker key={school.code} coordinates={coords}>
              <circle
                r={3.5}
                fill="#FFFFFF"
                stroke="#6B7280"
                strokeWidth={1.5}
                style={{ pointerEvents: 'none' }}
              />
            </Marker>
          )
        })}
      </ComposableMap>

      {/* ── Subtle inline key ────────────────────────────────── */}
      <div className="flex items-center gap-4 mt-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#CDD0D9' }} />
          <span className="text-[10px] text-stone-400">Universities available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded-sm" style={{ backgroundColor: '#E4E5E8' }} />
          <span className="text-[10px] text-stone-400">Coming soon</span>
        </div>
      </div>

    </div>
  )
}
