import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../AppContext'
import { getApplications } from '../utils/trackerStorage'
import { useMemo } from 'react'

export default function NavBar() {
  const { saved } = useApp()
  const { pathname } = useLocation()

  // Live count of tracked applications — reads localStorage directly so it stays in sync
  const trackerCount = useMemo(() => getApplications().length, [pathname])

  function linkCls(path, exact = false) {
    const active = exact
      ? pathname === path
      : pathname === path || pathname.startsWith(path + '/')
    return [
      'relative px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150',
      active
        ? 'text-maroon-700'
        : 'text-stone-500 hover:text-stone-900',
    ].join(' ')
  }

  const searchActive =
    pathname === '/search' || pathname.startsWith('/prof')
  const discoverActive =
    pathname === '/discover' || pathname === '/match'

  return (
    <nav className="relative bg-cream-50/95 backdrop-blur-sm border-b border-cream-300 sticky top-0 z-50">
      {/* Maroon top accent */}
      <div className="absolute inset-x-0 top-0 h-[2.5px] bg-maroon-700 pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[54px] flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-baseline gap-0.5 select-none group">
          <span className="font-display italic text-maroon-700 text-[20px] font-bold
                           leading-none group-hover:text-maroon-600 transition-colors">
            TAMU
          </span>
          <span className="font-sans font-semibold text-stone-800 text-[14px]
                           tracking-tight group-hover:text-stone-900 transition-colors">
            ResearchFinder
          </span>
        </Link>

        {/* Links */}
        <div className="flex items-center gap-0.5">
          <Link to="/" className={linkCls('/', true)}>Home</Link>
          <Link
            to="/search"
            className={[
              'relative px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150',
              searchActive ? 'text-maroon-700' : 'text-stone-500 hover:text-stone-900',
            ].join(' ')}
          >
            Search
          </Link>
          <Link
            to="/discover"
            className={[
              'relative px-3 py-1.5 text-sm font-medium rounded-lg transition-colors duration-150',
              discoverActive ? 'text-maroon-700' : 'text-stone-500 hover:text-stone-900',
            ].join(' ')}
          >
            Discover
          </Link>
          <Link to="/saved" className={linkCls('/saved')}>
            Saved
            {saved.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center
                               w-[18px] h-[18px] rounded-full bg-maroon-700
                               text-cream-50 text-[10px] font-bold leading-none">
                {saved.length > 9 ? '9+' : saved.length}
              </span>
            )}
          </Link>
          <Link to="/tracker" className={linkCls('/tracker')}>
            Tracker
            {trackerCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center
                               w-[18px] h-[18px] rounded-full bg-stone-600
                               text-white text-[10px] font-bold leading-none">
                {trackerCount > 9 ? '9+' : trackerCount}
              </span>
            )}
          </Link>
          <Link to="/about" className={linkCls('/about')}>About</Link>

          {/* CTA */}
          <Link
            to="/discover"
            className="ml-3 px-4 py-1.5 bg-maroon-700 text-cream-100 text-[13px]
                       font-semibold rounded-lg hover:bg-maroon-600 transition-colors
                       shadow-sm shadow-maroon-900/20"
          >
            Get Matched →
          </Link>
        </div>
      </div>
    </nav>
  )
}
