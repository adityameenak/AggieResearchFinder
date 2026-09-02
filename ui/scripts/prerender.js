/**
 * Post-build SEO pass. Runs after `vite build` (see package.json).
 *
 * The app is a client-rendered SPA, so without this every URL would ship the
 * same generic <head> and an empty <body> — one title and one description for
 * ~4.8k pages. This walks the route table in src/lib/seo.js and writes a real
 * HTML file per route with its own title, description, canonical, Open Graph
 * tags and JSON-LD, plus a crawlable text fallback inside #root for bots that
 * don't execute JS (React discards it on hydration).
 *
 * Vercel checks the filesystem before applying the SPA rewrite in vercel.json,
 * so these files are served directly and the rewrite only catches what's left.
 *
 * Also emits robots.txt and a sitemap index.
 *
 * Env:
 *   PRERENDER_FACULTY=0   skip the ~4.8k faculty profile pages (faster deploys,
 *                         at the cost of their long-tail search visibility)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildMeta, buildProfMeta, prerenderRoutes, SITE_URL, SITE_NAME,
  OG_LOCALE, SCHOOL_SEO, TOTAL_FACULTY,
} from '../src/lib/seo.js'
import { SCHOOLS, SCHOOL_LIST } from '../src/schools.js'
import { deptLabel } from '../src/utils/search.js'

const ROOT    = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST    = join(ROOT, 'dist')
const FACULTY = join(ROOT, 'public', 'faculty.json')
const WITH_FACULTY = process.env.PRERENDER_FACULTY !== '0'
const NOW = new Date().toISOString().slice(0, 10)

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/* ── head rewriting ───────────────────────────────────────── */

// Everything the SEO layer owns is tagged data-seo in index.html; strip those
// and re-emit them per route, leaving Vite's asset tags untouched.
function stripManaged(html) {
  return html
    .replace(/<title\b[^>]*\bdata-seo\b[^>]*>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<script\b[^>]*\bdata-seo\b[^>]*>[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<(?:meta|link)\b[^>]*\bdata-seo\b[^>]*>\s*/gi, '')
}

function headBlock(m) {
  const kw = Array.isArray(m.keywords) ? m.keywords.join(', ') : (m.keywords || '')
  const tags = [
    `<title data-seo>${esc(m.title)}</title>`,
    `<meta data-seo name="description" content="${esc(m.description)}" />`,
    kw && `<meta data-seo name="keywords" content="${esc(kw)}" />`,
    `<meta data-seo name="robots" content="${esc(m.robots)}" />`,
    `<meta data-seo name="theme-color" content="${esc(m.themeColor)}" />`,
    `<link data-seo rel="canonical" href="${esc(m.canonical)}" />`,
    `<meta data-seo property="og:type" content="${esc(m.ogType || 'website')}" />`,
    `<meta data-seo property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta data-seo property="og:locale" content="${OG_LOCALE}" />`,
    `<meta data-seo property="og:url" content="${esc(m.canonical)}" />`,
    `<meta data-seo property="og:title" content="${esc(m.title)}" />`,
    `<meta data-seo property="og:description" content="${esc(m.description)}" />`,
    `<meta data-seo property="og:image" content="${esc(m.image)}" />`,
    `<meta data-seo property="og:image:alt" content="${esc(m.title)}" />`,
    `<meta data-seo name="twitter:card" content="summary_large_image" />`,
    `<meta data-seo name="twitter:title" content="${esc(m.title)}" />`,
    `<meta data-seo name="twitter:description" content="${esc(m.description)}" />`,
    `<meta data-seo name="twitter:image" content="${esc(m.image)}" />`,
    ...(m.jsonLd ?? []).map(b =>
      // `</script>` inside JSON would close the tag early.
      `<script data-seo type="application/ld+json">${
        JSON.stringify(b).replace(/</g, '\\u003c')}</script>`),
  ].filter(Boolean)
  return tags.map(t => `    ${t}`).join('\n')
}

/**
 * A plain-HTML summary of the page, placed inside #root. React replaces it the
 * moment it mounts, so users never see it — it exists for crawlers that don't
 * run JS, and it mirrors what the rendered page actually says.
 */
function bodyFallback(m) {
  const links = (m.links ?? [])
    .map(l => `<li><a href="${esc(l.href)}">${esc(l.text)}</a></li>`).join('')
  return [
    '<div id="seo-fallback">',
    `<h1>${esc(m.h1 ?? m.title)}</h1>`,
    `<p>${esc(m.intro ?? m.description)}</p>`,
    links ? `<nav><ul>${links}</ul></nav>` : '',
    '</div>',
  ].join('')
}

function renderPage(shell, m) {
  let html = stripManaged(shell)
  html = html.replace('</head>', `${headBlock(m)}\n  </head>`)
  html = html.replace('<div id="root"></div>', `<div id="root">${bodyFallback(m)}</div>`)
  return html
}

function writeRoute(shell, route, m) {
  const dir = join(DIST, route === '/' ? '' : route)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), renderPage(shell, m))
}

/* ── sitemaps ─────────────────────────────────────────────── */

const urlset = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entries.map(e =>
    `  <url>\n    <loc>${esc(e.loc)}</loc>\n    <lastmod>${NOW}</lastmod>\n` +
    `    <changefreq>${e.freq}</changefreq>\n    <priority>${e.pri}</priority>\n  </url>`
  ).join('\n') + `\n</urlset>\n`

/* ── main ─────────────────────────────────────────────────── */

function main() {
  const shellPath = join(DIST, 'index.html')
  if (!existsSync(shellPath)) {
    console.error('prerender: dist/index.html missing — run `vite build` first.')
    process.exit(1)
  }
  const shell = readFileSync(shellPath, 'utf8')

  // 1. Static routes
  const routes = prerenderRoutes()
  for (const r of routes) writeRoute(shell, r, buildMeta(r))
  // The SPA fallback itself keeps generic site metadata.
  writeFileSync(shellPath, renderPage(shell, buildMeta('/')))

  const pageUrls = routes.map(r => ({
    loc: r === '/' ? `${SITE_URL}/` : `${SITE_URL}${r}`,
    freq: r === '/' ? 'weekly' : 'weekly',
    pri: r === '/' ? '1.0' : (r.split('/').filter(Boolean).length === 1 ? '0.9' : '0.7'),
  }))
  writeFileSync(join(DIST, 'sitemap-pages.xml'), urlset(pageUrls))

  // 2. Faculty profile pages — the long-tail surface
  const sitemaps = ['sitemap-pages.xml']
  let profCount = 0
  if (existsSync(FACULTY)) {
    const faculty = JSON.parse(readFileSync(FACULTY, 'utf8'))

    // Counts in seo.js feed every description; catch drift after a re-crawl.
    const seen = {}
    for (const f of faculty) seen[f.university] = (seen[f.university] ?? 0) + 1
    for (const s of SCHOOL_LIST) {
      const actual = seen[s.code] ?? 0
      if (actual !== SCHOOL_SEO[s.code]?.count) {
        console.warn(`prerender: WARNING ${s.code} count is ${actual} but ` +
                     `SCHOOL_SEO says ${SCHOOL_SEO[s.code]?.count} — update src/lib/seo.js`)
      }
    }
    if (faculty.length !== TOTAL_FACULTY) {
      console.warn(`prerender: WARNING TOTAL_FACULTY is ${TOTAL_FACULTY} but ` +
                   `faculty.json has ${faculty.length} — update src/lib/seo.js`)
    }

    for (const s of SCHOOL_LIST) {
      const rows = faculty.filter(f => f.university === s.code)
      if (!rows.length) continue
      writeFileSync(join(DIST, `sitemap-faculty-${s.code}.xml`), urlset(rows.map(f => ({
        loc: `${SITE_URL}/${s.code}/prof/${f.id}`, freq: 'monthly', pri: '0.5',
      }))))
      sitemaps.push(`sitemap-faculty-${s.code}.xml`)

      if (WITH_FACULTY) {
        for (const f of rows) {
          writeRoute(shell, `/${s.code}/prof/${f.id}`,
                     profMeta(f, SCHOOLS[s.code]))
          profCount++
        }
      }
    }
  } else {
    console.warn('prerender: public/faculty.json not found — skipping faculty sitemaps')
  }

  // 3. Sitemap index + robots
  writeFileSync(join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemaps.map(s =>
      `  <sitemap>\n    <loc>${SITE_URL}/${s}</loc>\n    <lastmod>${NOW}</lastmod>\n  </sitemap>`
    ).join('\n') + `\n</sitemapindex>\n`)

  writeFileSync(join(DIST, 'robots.txt'), [
    '# https://stemresearchfinder.tech',
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n'))

  console.log(`prerender: ${routes.length} static routes` +
              (profCount ? ` + ${profCount} faculty pages` : ' (faculty pages skipped)') +
              `, ${sitemaps.length} sitemaps, robots.txt`)
}

function profMeta(f, school) {
  const m = buildProfMeta(f, school, deptLabel(f.department))
  return {
    ...m,
    ogType: 'profile',
    h1: f.name,
    intro: m.description,
    links: [
      { href: `/${school.code}/search`, text: `All ${school.shortName} faculty` },
      { href: `/${school.code}`, text: SCHOOL_SEO[school.code].brand },
    ],
  }
}

main()
