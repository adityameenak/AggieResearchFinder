/**
 * Registry of supported universities. Adding a new school means adding an entry
 * here and ensuring crawler output is tagged with the matching `code`.
 *
 * `accent` is the school's static brand palette (used on the multi-school
 * picker where all schools render at once). App-wide theming is separate: the
 * per-school app uses `maroon-*` classes repainted by `[data-school="<code>"]`
 * CSS-variable overrides in index.css — add a block there for each school.
 */
export const SCHOOLS = {
  tamu: {
    code: 'tamu',
    name: 'Texas A&M University',
    shortName: 'TAMU',
    appName: 'Aggie Research Finder',
    brandPrefix: 'TAMU',
    brandSuffix: 'ResearchFinder',
    accent: 'maroon',
    // Tailwind class strings must be written in full so the JIT compiler
    // includes them — don't interpolate `bg-${accent}-700`.
    classes: {
      brandText:    'text-maroon-700',
      brandHover:   'group-hover:text-maroon-600',
      cardHover:    'hover:border-maroon-400',
      pillBg:       'bg-maroon-700',
      pillText:     'text-maroon-700',
    },
    officialUrl: 'https://engineering.tamu.edu',
    description: 'Discover STEM research labs across Texas A&M, powered by AI matching.',
    available: true,
  },
  rice: {
    code: 'rice',
    name: 'Rice University',
    shortName: 'Rice',
    appName: 'Owl Research Finder',
    brandPrefix: 'Owl',
    brandSuffix: 'ResearchFinder',
    accent: 'rice-blue',
    classes: {
      brandText:    'text-rice-blue-700',
      brandHover:   'group-hover:text-rice-blue-600',
      cardHover:    'hover:border-rice-blue-400',
      pillBg:       'bg-rice-blue-700',
      pillText:     'text-rice-blue-700',
    },
    officialUrl: 'https://www.rice.edu',
    description: 'Discover STEM research labs across Rice, powered by AI matching.',
    available: true,
  },
  ut: {
    code: 'ut',
    name: 'The University of Texas at Austin',
    shortName: 'UT Austin',
    appName: 'Longhorn Research Finder',
    brandPrefix: 'Longhorn',
    brandSuffix: 'ResearchFinder',
    accent: 'ut-orange',
    classes: {
      brandText:    'text-ut-orange-700',
      brandHover:   'group-hover:text-ut-orange-600',
      cardHover:    'hover:border-ut-orange-400',
      pillBg:       'bg-ut-orange-600',
      pillText:     'text-ut-orange-700',
    },
    officialUrl: 'https://www.utexas.edu',
    description: 'Discover STEM research labs across UT Austin, powered by AI matching.',
    // Live: all 13 STEM departments crawled (Cockrell engineering + CNS).
    available: true,
  },
}

export const SCHOOL_LIST = Object.values(SCHOOLS)

export function getSchool(code) {
  if (!code) return null
  return SCHOOLS[String(code).toLowerCase()] ?? null
}
