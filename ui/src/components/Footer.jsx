import { Link } from 'react-router-dom'

const NAV = [
  { to: '/',       label: 'Home' },
  { to: '/search', label: 'Search Faculty' },
  { to: '/saved',  label: 'Saved Professors' },
  { to: '/about',  label: 'About' },
]

export default function Footer() {
  return (
    <footer className="bg-stone-950 border-t border-stone-800">
      {/* Maroon accent line */}
      <div className="h-[2.5px] bg-maroon-700" />

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-12 mb-12">

          {/* Brand */}
          <div>
            <Link to="/" className="inline-flex items-baseline gap-0.5 mb-4 group select-none">
              <span className="font-display italic text-maroon-400 text-[20px] font-bold
                               leading-none group-hover:text-maroon-300 transition-colors">
                TAMU
              </span>
              <span className="font-sans font-semibold text-cream-300 text-[14px]
                               tracking-tight group-hover:text-cream-200 transition-colors">
                ResearchFinder
              </span>
            </Link>
            <p className="text-xs text-stone-500 leading-relaxed max-w-[220px]">
              Helping Texas A&amp;M students discover engineering research
              opportunities across all departments, in one place.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <div className="text-[11px] font-semibold text-stone-500 uppercase
                            tracking-[0.12em] mb-5">
              Navigate
            </div>
            <ul className="space-y-3">
              {NAV.map(({ to, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-sm text-stone-400 hover:text-cream-200
                               transition-colors duration-150"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Data */}
          <div>
            <div className="text-[11px] font-semibold text-stone-500 uppercase
                            tracking-[0.12em] mb-5">
              Data &amp; Attribution
            </div>
            <p className="text-xs text-stone-500 leading-relaxed">
              Faculty profiles sourced from the Texas A&amp;M College of
              Engineering public directory. This tool is not affiliated with
              or endorsed by Texas A&amp;M University. Data may be incomplete.
            </p>
          </div>
        </div>

        <div className="border-t border-stone-800 pt-7 flex flex-col sm:flex-row
                        items-start sm:items-center justify-between gap-3
                        text-xs text-stone-600">
          <span>&copy; {new Date().getFullYear()} TAMUResearchFinder</span>
          <span>Not affiliated with Texas A&amp;M University</span>
        </div>
      </div>
    </footer>
  )
}
