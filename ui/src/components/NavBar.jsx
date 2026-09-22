import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../AppContext'
import { useSchool, useSchoolPath } from '../SchoolContext'

export default function NavBar() {
  const { savedCount } = useApp()
  const school      = useSchool()
  const tx          = useSchoolPath()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the phone menu whenever a link takes you somewhere.
  useEffect(() => { setMenuOpen(false) }, [pathname])

  // One list for both layouts. `match` decides the active state against the
  // school-prefixed path; Search stays lit on a professor page, Match on the
  // results that follow the upload step.
  const links = [
    { to: '/',              label: 'Home',   match: p => p === tx('/') },
    { to: '/search',        label: 'Search', match: p => p === tx('/search') || p.startsWith(tx('/prof')) },
    { to: '/discover',      label: 'Match',  match: p => p === tx('/discover') || p === tx('/match') },
    // "My List" — the page's own name. The nav said "Saved", which is only the
    // first status an entry can have.
    { to: '/tracker',       label: 'My List', badge: true,
      match: p => p === tx('/tracker') || p.startsWith(tx('/tracker') + '/') },
    { to: '/international', label: "Int'l",  match: p => p === tx('/international') },
    { to: '/about',         label: 'About',  match: p => p === tx('/about') },
  ]

  const badge = savedCount > 0 && (
    <span className="ml-1.5 inline-flex items-center justify-center
                     w-[18px] h-[18px] rounded-full bg-maroon-700
                     text-cream-50 text-[10px] font-bold leading-none"
          aria-label={`${savedCount} saved`}>
      {savedCount > 9 ? '9+' : savedCount}
    </span>
  )

  function linkCls(active, mobile) {
    return [
      'relative font-medium rounded-lg transition-colors duration-150 flex items-center',
      mobile ? 'px-3 py-2.5 text-[15px]' : 'px-3 py-1.5 text-sm',
      active ? 'text-maroon-700' : 'text-stone-500 hover:text-stone-900',
      mobile && active ? 'bg-maroon-50' : '',
    ].join(' ')
  }

  function renderLinks(mobile) {
    return links.map(l => {
      const active = l.match(pathname)
      return (
        <Link key={l.to} to={tx(l.to)} className={linkCls(active, mobile)}
              aria-current={active ? 'page' : undefined}>
          {l.label}
          {l.badge && badge}
        </Link>
      )
    })
  }

  return (
    <nav className="relative bg-cream-50/95 backdrop-blur-sm border-b border-cream-300 sticky top-0 z-50"
         aria-label="Main">
      {/* Maroon top accent */}
      <div className="absolute inset-x-0 top-0 h-[2.5px] bg-maroon-700 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[54px] flex items-center justify-between gap-3">
        {/* Brand */}
        <Link to={tx('/')} className="flex items-baseline gap-0.5 select-none group min-w-0">
          <span className="font-display italic text-maroon-700 text-[20px] font-bold
                           leading-none group-hover:text-maroon-600 transition-colors">
            {school.brandPrefix}
          </span>
          <span className="font-sans font-semibold text-stone-800 text-[14px]
                           tracking-tight group-hover:text-stone-900 transition-colors truncate">
            {school.brandSuffix}
          </span>
        </Link>

        {/* Links — inline from md up. Six links plus the brand overflowed a
            375px phone, so below md they move into a menu. */}
        <div className="hidden md:flex items-center gap-0.5">
          {renderLinks(false)}
        </div>

        <div className="flex md:hidden items-center gap-1">
          {savedCount > 0 && !menuOpen && (
            <Link to={tx('/tracker')} className="p-2 rounded-lg text-stone-500 hover:text-maroon-700"
                  aria-label={`My List, ${savedCount} saved`}>
              {badge}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="p-2 -mr-2 rounded-lg text-stone-600 hover:text-stone-900 hover:bg-cream-200
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-700/40"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
              {menuOpen
                ? <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                : <path fillRule="evenodd" d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-nav" className="md:hidden border-t border-cream-300 bg-cream-50 px-4 py-2
                                        flex flex-col gap-0.5 shadow-sm">
          {renderLinks(true)}
        </div>
      )}
    </nav>
  )
}
