/**
 * Registry of supported universities. Adding a new school means adding an entry
 * here and ensuring crawler output is tagged with the matching `code`.
 *
 * `accent` controls the brand-color token used by NavBar/Footer/CTAs. It must
 * resolve to existing Tailwind classes (currently only `maroon` is themed —
 * other schools will reuse a neutral palette until per-school themes land).
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
  utd: {
    code: 'utd',
    name: 'The University of Texas at Dallas',
    shortName: 'UT Dallas',
    appName: 'Comet Research Finder',
    brandPrefix: 'Comet',
    brandSuffix: 'ResearchFinder',
    accent: 'utd-green',
    classes: {
      brandText:    'text-utd-green-700',
      brandHover:   'group-hover:text-utd-green-600',
      cardHover:    'hover:border-utd-green-400',
      pillBg:       'bg-utd-green-700',
      pillText:     'text-utd-green-700',
    },
    officialUrl: 'https://www.utdallas.edu',
    description: 'Discover STEM research labs across UT Dallas, powered by AI matching.',
    // Held for review: STEM faculty crawled from profiles.utdallas.edu, not yet
    // merged into faculty.json. Flip to true once reviewed.
    available: false,
  },
}

export const SCHOOL_LIST = Object.values(SCHOOLS)

export function getSchool(code) {
  if (!code) return null
  return SCHOOLS[String(code).toLowerCase()] ?? null
}
