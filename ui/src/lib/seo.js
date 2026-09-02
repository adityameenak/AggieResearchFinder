/**
 * Central SEO configuration.
 *
 * This module is imported by BOTH the React app (src/components/Seo.jsx, which
 * applies the tags at runtime for client-side navigation) and the build-time
 * prerenderer (scripts/prerender.js, which bakes the same tags into static HTML
 * so crawlers that don't execute JS still get real titles/descriptions).
 *
 * Because Node imports it directly, keep it dependency-free and use explicit
 * `.js` extensions on relative imports — plain Node ESM has no extension
 * resolution.
 */
import { SCHOOLS, SCHOOL_LIST } from '../schools.js'
import { formatStateSlug } from './states.js'

export const SITE_URL   = 'https://stemresearchfinder.tech'
export const SITE_NAME  = 'STEM Research Finder'
export const SITE_TAG   = 'Find research labs and faculty advisors at top universities'
export const OG_LOCALE  = 'en_US'
/** Browser chrome color for the platform (school pages override with their own). */
export const THEME_DEFAULT = '#4f46e5'

/** Total across every school — kept in sync by scripts/prerender.js (warns on drift). */
export const TOTAL_FACULTY = 5152

const n = (x) => x.toLocaleString('en-US')

/**
 * Per-school search-intent metadata.
 *
 * `brand` leads every title because it's the phrase people actually type
 * ("aggie research finder"). `aka` feeds schema.org alternateName so the same
 * page can rank for each nickname. `keywords` are secondary signals — they
 * carry little weight with Google directly, but Bing and site-search still read
 * them, and they document the intent each page targets.
 */
export const SCHOOL_SEO = {
  tamu: {
    theme: '#500000',
    brand: 'Aggie Research Finder',
    aka: ['Aggie Research Finder', 'TAMU Research Finder', 'Texas A&M Research Finder',
          'Aggie STEM Research Finder'],
    count: 2039,
    nick: 'Aggie',
    unit: 'Texas A&M',
    keywords: [
      'aggie research finder', 'tamu research', 'texas a&m research',
      'tamu undergraduate research', 'texas a&m faculty research', 'tamu professors',
      'aggie research', 'texas a&m research labs', 'research opportunities at texas a&m',
      'tamu faculty directory', 'texas a&m stem research', 'tamu research advisor',
    ],
  },
  rice: {
    theme: '#00205B',
    brand: 'Rice Research Finder',
    aka: ['Rice Research Finder', 'Owl Research Finder', 'Rice University Research Finder',
          'Owl STEM Research Finder'],
    count: 625,
    nick: 'Owl',
    unit: 'Rice',
    keywords: [
      'rice research finder', 'rice university research', 'rice undergraduate research',
      'rice university labs', 'rice professors', 'owl research',
      'research opportunities at rice', 'rice faculty directory',
      'rice university stem research', 'rice research advisor',
    ],
  },
  ut: {
    theme: '#BF5700',
    brand: 'UT Austin Research Finder',
    aka: ['UT Austin Research Finder', 'Longhorn Research Finder',
          'University of Texas Research Finder', 'Longhorn STEM Research Finder'],
    count: 939,
    nick: 'Longhorn',
    unit: 'UT Austin',
    keywords: [
      'ut austin research finder', 'ut austin research', 'longhorn research',
      'ut austin undergraduate research', 'ut austin professors', 'cockrell school research',
      'ut austin research labs', 'university of texas research opportunities',
      'utexas faculty research', 'ut austin stem research',
    ],
  },
  utd: {
    theme: '#154734',
    brand: 'UT Dallas Research Finder',
    aka: ['UT Dallas Research Finder', 'UTD Research Finder', 'Comet Research Finder',
          'Comet STEM Research Finder'],
    count: 607,
    nick: 'Comet',
    unit: 'UT Dallas',
    keywords: [
      'utd research finder', 'ut dallas research', 'utd undergraduate research',
      'comet research', 'utd professors', 'ut dallas research labs',
      'jonsson school research', 'ut dallas faculty directory',
      'utd stem research', 'ut dallas research opportunities',
    ],
  },
  mit: {
    theme: '#A31F34',
    brand: 'MIT Research Finder',
    aka: ['MIT Research Finder', 'MIT Lab Finder', 'MIT STEM Research Finder'],
    count: 795,
    nick: 'MIT',
    unit: 'MIT',
    keywords: [
      'mit research finder', 'mit research labs', 'mit urop', 'mit professors',
      'mit faculty research', 'undergraduate research at mit', 'mit lab directory',
      'mit research opportunities', 'mit stem research', 'mit research advisor',
    ],
  },
  harvard: {
    theme: '#A51C30',
    brand: 'Harvard Research Finder',
    aka: ['Harvard Research Finder', 'Harvard Lab Finder', 'Harvard STEM Research Finder'],
    count: 147,
    nick: 'Harvard',
    unit: 'Harvard',
    keywords: [
      'harvard research finder', 'harvard research labs', 'harvard seas research',
      'harvard professors', 'harvard faculty research', 'undergraduate research at harvard',
      'harvard lab directory', 'harvard research opportunities', 'harvard stem research',
      'harvard research advisor',
    ],
  },
}

/** Sections under /:code — the "subsections" that each get their own metadata. */
export const SCHOOL_SECTIONS = {
  '': {
    title: (s, k) => `${k.brand} — ${s.shortName} STEM Labs & Professors`,
    desc: (s, k) =>
      `Search ${n(k.count)} ${k.unit} STEM professors and labs by research interest. ` +
      `Match your resume, save advisors, draft outreach emails — the free ${k.brand}.`,
  },
  search: {
    title: (s, k) => `Search ${s.shortName} Research Labs & Faculty`,
    desc: (s, k) =>
      `Browse and filter ${n(k.count)} ${s.shortName} faculty by department and research topic. ` +
      `Find the lab working on what you care about, with contacts and Scholar links.`,
  },
  match: {
    title: (s, k) => `Resume Match — ${s.shortName} Research Advisors`,
    desc: (s, k) =>
      `Upload your resume and get ranked ${s.shortName} research advisors matched to your interests, ` +
      `with an explanation of why each ${s.shortName} professor fits.`,
  },
  discover: {
    title: (s, k) => `Find Your ${s.shortName} Research Match`,
    desc: (s, k) =>
      `Tell us your interests and upload a resume — ${k.brand} ranks ${n(k.count)} ${s.shortName} ` +
      `professors by how well their research matches you.`,
  },
  tracker: {
    title: (s, k) => `My List — Track ${s.shortName} Research Outreach`,
    desc: (s, k) =>
      `Save ${s.shortName} professors and track every research application from first email to offer — ` +
      `interested, emailed, replied, interviewed, accepted.`,
  },
  about: {
    title: (s, k) => `About ${k.brand} — How It Works`,
    desc: (s, k) =>
      `How ${k.brand} works: ${n(k.count)} ${s.shortName} faculty profiles gathered from ` +
      `official department directories and Google Scholar, matched to your interests.`,
  },
  international: {
    title: (s, k) => `${s.shortName} Research for International Students`,
    desc: (s, k) =>
      `A guide for international students seeking research at ${s.shortName}: visa-aware ` +
      `advice, how to email professors, and ${n(k.count)} labs to search.`,
  },
}

export const SECTION_KEYS = Object.keys(SCHOOL_SECTIONS)

/* ── URL helpers ──────────────────────────────────────────── */

export function absUrl(path = '/') {
  const clean = String(path).replace(/\/+$/, '') || '/'
  return clean === '/' ? `${SITE_URL}/` : `${SITE_URL}${clean.startsWith('/') ? clean : `/${clean}`}`
}

export function ogImageFor(code) {
  return `${SITE_URL}/og/${code && SCHOOLS[code] ? code : 'default'}.png`
}

/** States that actually have at least one school registered. */
export function statesWithSchools() {
  return [...new Set(SCHOOL_LIST.map(s => s.state))].sort()
}

export function schoolsInState(slug) {
  return SCHOOL_LIST.filter(s => s.state === slug)
}

/* ── JSON-LD builders ─────────────────────────────────────── */

function breadcrumb(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: absUrl(t.path),
    })),
  }
}

const ORGANIZATION = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icon-512.png`,
  description: `${SITE_TAG}. ${n(TOTAL_FACULTY)} STEM faculty profiles across ${SCHOOL_LIST.length} universities.`,
}

/* ── The one function that produces a page's metadata ─────── */

/**
 * @param {string} pathname  e.g. '/', '/schools/texas', '/tamu', '/tamu/search'
 * @returns {{title,description,canonical,keywords,image,robots,jsonLd,school,h1,intro,links}}
 */
export function buildMeta(pathname = '/') {
  const parts = String(pathname).split('?')[0].split('#')[0]
    .split('/').filter(Boolean)

  /* ── Root: the multi-school picker ─────────────────────── */
  if (parts.length === 0) {
    return {
      title: `${SITE_NAME} — Find Research Labs & Faculty Advisors`,
      description:
        `Search ${n(TOTAL_FACULTY)} STEM professors at Texas A&M, Rice, UT Austin, UT Dallas, ` +
        `MIT and Harvard. Match your resume to research labs and email advisors — free.`,
      canonical: absUrl('/'),
      keywords: [
        'stem research finder', 'research finder', 'find research labs',
        'undergraduate research', 'find a research advisor', 'university research directory',
        'faculty research search', 'research opportunities for students',
        ...SCHOOL_LIST.flatMap(s => SCHOOL_SEO[s.code]?.aka?.[0] ? [SCHOOL_SEO[s.code].aka[0].toLowerCase()] : []),
      ],
      image: ogImageFor(null),
      themeColor: THEME_DEFAULT,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1',
      school: null,
      h1: `${SITE_NAME}`,
      intro: `Find research labs and faculty advisors across ${SCHOOL_LIST.length} universities.`,
      links: SCHOOL_LIST.map(s => ({ href: `/${s.code}`, text: `${SCHOOL_SEO[s.code].brand} — ${s.name}` })),
      jsonLd: [
        ORGANIZATION,
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          name: SITE_NAME,
          alternateName: ['StemResearchFinder', 'Research Finder',
                          ...SCHOOL_LIST.map(s => SCHOOL_SEO[s.code].brand)],
          url: `${SITE_URL}/`,
          publisher: { '@id': `${SITE_URL}/#organization` },
          potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/tamu/search?q={search_term_string}` },
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Universities on STEM Research Finder',
          itemListElement: SCHOOL_LIST.map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: s.name,
            url: absUrl(`/${s.code}`),
          })),
        },
      ],
    }
  }

  /* ── /schools/:state ───────────────────────────────────── */
  if (parts[0] === 'schools' && parts[1]) {
    const slug  = parts[1]
    const state = formatStateSlug(slug)
    const list  = schoolsInState(slug)
    const names = list.map(s => s.shortName).join(', ')
    const total = list.reduce((a, s) => a + (SCHOOL_SEO[s.code]?.count ?? 0), 0)
    return {
      title: `Research Labs at ${state} Universities`,
      description: list.length
        ? `STEM research labs and faculty advisors at ${state} universities: ${names}. ` +
          `Search ${n(total)} professors by research interest and match your resume.`
        : `Universities in ${state} on ${SITE_NAME} — find STEM research labs and faculty advisors near you.`,
      canonical: absUrl(`/schools/${slug}`),
      keywords: [
        `${state.toLowerCase()} research universities`,
        `undergraduate research in ${state.toLowerCase()}`,
        `${state.toLowerCase()} stem research labs`,
        `research opportunities in ${state.toLowerCase()}`,
        ...list.flatMap(s => SCHOOL_SEO[s.code]?.keywords.slice(0, 3) ?? []),
      ],
      image: ogImageFor(list[0]?.code),
      themeColor: THEME_DEFAULT,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1',
      school: null,
      h1: `Schools in ${state}`,
      intro: `Choose a university to open its Research Finder.`,
      links: list.map(s => ({ href: `/${s.code}`, text: `${s.name} — ${SCHOOL_SEO[s.code].brand}` })),
      jsonLd: [
        breadcrumb([{ name: SITE_NAME, path: '/' }, { name: state, path: `/schools/${slug}` }]),
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Universities in ${state}`,
          itemListElement: list.map((s, i) => ({
            '@type': 'ListItem', position: i + 1, name: s.name, url: absUrl(`/${s.code}`),
          })),
        },
      ],
    }
  }

  /* ── /:code[/section] ──────────────────────────────────── */
  const school = SCHOOLS[String(parts[0]).toLowerCase()]
  if (school) {
    const k       = SCHOOL_SEO[school.code]
    const section = parts[1] ?? ''

    // Faculty profile pages get a generic shell here; ProfDetail overrides it
    // at runtime with the actual professor's name and research.
    if (section === 'prof') {
      return {
        title: `Faculty Profile — ${k.brand}`,
        description: `Research profile, lab website and contact details for a ${school.name} STEM faculty member.`,
        canonical: absUrl(pathname),
        keywords: k.keywords,
        image: ogImageFor(school.code),
        themeColor: k.theme,
        robots: 'index,follow,max-image-preview:large,max-snippet:-1',
        school,
        h1: `${school.name} faculty profile`,
        intro: `Research profile on ${k.brand}.`,
        links: [{ href: `/${school.code}/search`, text: `Search all ${school.shortName} faculty` }],
        jsonLd: [breadcrumb([
          { name: SITE_NAME, path: '/' },
          { name: school.shortName, path: `/${school.code}` },
          { name: 'Faculty', path: `/${school.code}/search` },
        ])],
      }
    }

    const spec = SCHOOL_SECTIONS[section] ?? SCHOOL_SECTIONS['']
    // Sub-pages carry the school's brand alias too, so "aggie research finder"
    // can match them — but only when it still fits inside the SERP title cut.
    const rawTitle = spec.title(school, k)
    const title = section && !rawTitle.includes(k.brand) &&
                  `${rawTitle} | ${k.brand}`.length <= 62
      ? `${rawTitle} | ${k.brand}`
      : rawTitle
    const path = section ? `/${school.code}/${section}` : `/${school.code}`
    const trail = [{ name: SITE_NAME, path: '/' }]
    trail.push({ name: formatStateSlug(school.state), path: `/schools/${school.state}` })
    trail.push({ name: k.brand, path: `/${school.code}` })
    if (section) trail.push({ name: rawTitle, path })

    const jsonLd = [breadcrumb(trail)]
    if (!section) {
      jsonLd.push({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: k.brand,
        alternateName: k.aka,
        url: absUrl(path),
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        description: spec.desc(school, k),
        publisher: { '@id': `${SITE_URL}/#organization` },
        about: {
          '@type': 'CollegeOrUniversity',
          name: school.name,
          alternateName: school.shortName,
          url: school.officialUrl,
          address: {
            '@type': 'PostalAddress',
            addressLocality: school.city,
            addressRegion: formatStateSlug(school.state),
            addressCountry: 'US',
          },
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absUrl(`/${school.code}/search`)}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      })
    }

    return {
      title,
      description: spec.desc(school, k),
      canonical: absUrl(path),
      keywords: k.keywords,
      image: ogImageFor(school.code),
      themeColor: k.theme,
      robots: 'index,follow,max-image-preview:large,max-snippet:-1',
      school,
      h1: rawTitle,
      intro: spec.desc(school, k),
      links: SECTION_KEYS
        .filter(sec => sec !== section)
        .map(sec => ({
          href: sec ? `/${school.code}/${sec}` : `/${school.code}`,
          text: SCHOOL_SECTIONS[sec].title(school, k),
        })),
      jsonLd,
    }
  }

  /* ── Unknown path ──────────────────────────────────────── */
  return {
    title: `${SITE_NAME} — Find Research Labs & Faculty Advisors`,
    description: SITE_TAG,
    canonical: absUrl('/'),
    keywords: ['stem research finder'],
    image: ogImageFor(null),
    themeColor: THEME_DEFAULT,
    robots: 'noindex,follow',
    school: null,
    h1: SITE_NAME,
    intro: SITE_TAG,
    links: SCHOOL_LIST.map(s => ({ href: `/${s.code}`, text: s.name })),
    jsonLd: [],
  }
}

/**
 * Metadata for a single faculty profile page — used by ProfDetail at runtime.
 * Titles lead with the professor's name because that's the search query.
 */
export function buildProfMeta(prof, school, deptName) {
  const k    = SCHOOL_SEO[school.code]
  const path = `/${school.code}/prof/${prof.id}`
  const area = (prof.scholar_interests?.length ? prof.scholar_interests.slice(0, 4).join(', ') : '') ||
               (prof.research_summary || '').replace(/\s+/g, ' ').trim().slice(0, 110)

  // Built to a ~160-char budget, research first — that's the part a searcher
  // is scanning for, and anything past the cut is invisible in results.
  const head = `${prof.name} — ${deptName || 'STEM'} faculty at ${k.unit}.`
  const tail = ` Contact, lab site and Scholar links on ${k.brand}.`
  let desc = head
  if (area) {
    const room = 160 - head.length - ' Research: .'.length
    const trimmed = area.length > room
      ? area.slice(0, Math.max(0, room)).replace(/[\s,;·|-]+\S*$/, '')
      : area
    if (trimmed) desc += ` Research: ${trimmed}.`
  }
  if (desc.length + tail.length <= 165) desc += tail
  desc = desc.replace(/\s+/g, ' ').trim()

  return {
    title: `${prof.name} — ${school.shortName} ${deptName || 'Research'} Faculty`,
    description: desc,
    ogType: 'profile',
    canonical: absUrl(path),
    keywords: [
      prof.name.toLowerCase(),
      `${prof.name.toLowerCase()} ${school.shortName.toLowerCase()}`,
      `${prof.name.toLowerCase()} research`,
      `${school.shortName.toLowerCase()} ${(deptName || '').toLowerCase()} faculty`.trim(),
      ...k.keywords.slice(0, 4),
    ],
    image: prof.photo_url || ogImageFor(school.code),
    themeColor: k.theme,
    robots: 'index,follow,max-image-preview:large,max-snippet:-1',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        url: absUrl(path),
        mainEntity: {
          '@type': 'Person',
          name: prof.name,
          jobTitle: prof.title || 'Faculty',
          url: absUrl(path),
          sameAs: [prof.profile_url, prof.lab_website, prof.google_scholar].filter(Boolean),
          image: prof.photo_url || undefined,
          email: prof.email || undefined,
          telephone: prof.phone || undefined,
          knowsAbout: prof.scholar_interests?.length ? prof.scholar_interests.slice(0, 10) : undefined,
          worksFor: {
            '@type': 'CollegeOrUniversity',
            name: school.name,
            alternateName: school.shortName,
            url: school.officialUrl,
          },
          affiliation: deptName
            ? { '@type': 'EducationalOrganization', name: `${deptName}, ${school.name}` }
            : undefined,
        },
      },
      breadcrumb([
        { name: SITE_NAME, path: '/' },
        { name: k.brand, path: `/${school.code}` },
        { name: 'Faculty', path: `/${school.code}/search` },
        { name: prof.name, path },
      ]),
    ],
  }
}

/** Every route the build should prerender as a real HTML file. */
export function prerenderRoutes() {
  const routes = ['/']
  for (const state of statesWithSchools()) routes.push(`/schools/${state}`)
  for (const s of SCHOOL_LIST) {
    for (const sec of SECTION_KEYS) routes.push(sec ? `/${s.code}/${sec}` : `/${s.code}`)
  }
  return routes
}
