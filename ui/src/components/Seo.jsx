import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { buildMeta, SITE_NAME, OG_LOCALE, THEME_DEFAULT } from '../lib/seo'

/**
 * Applies a page's SEO tags to <head>.
 *
 * The same metadata is baked into static HTML at build time by
 * scripts/prerender.js — this component keeps it correct across client-side
 * navigation (and for any route that isn't prerendered, like /:code/prof/:id).
 *
 * Every tag it writes is marked `data-seo` so the next route can clear the
 * previous one instead of accumulating duplicates.
 */

const MANAGED = '[data-seo]'

function upsert(selector, create, attrs) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    el.setAttribute('data-seo', '')
    document.head.appendChild(el)
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === '') el.removeAttribute(k)
    else el.setAttribute(k, v)
  }
  return el
}

function meta(name, content, prop = false) {
  const key = prop ? 'property' : 'name'
  upsert(`meta[${key}="${name}"]`, () => document.createElement('meta'), { [key]: name, content })
}

export function applySeo(m) {
  document.title = m.title

  meta('description', m.description)
  meta('keywords', Array.isArray(m.keywords) ? m.keywords.join(', ') : m.keywords)
  meta('robots', m.robots || 'index,follow')
  meta('theme-color', m.themeColor || THEME_DEFAULT)

  upsert('link[rel="canonical"]', () => {
    const l = document.createElement('link'); l.rel = 'canonical'; return l
  }, { href: m.canonical })

  meta('og:type', m.ogType || 'website', true)
  meta('og:site_name', SITE_NAME, true)
  meta('og:locale', OG_LOCALE, true)
  meta('og:url', m.canonical, true)
  meta('og:title', m.title, true)
  meta('og:description', m.description, true)
  meta('og:image', m.image, true)
  meta('og:image:alt', m.title, true)

  meta('twitter:card', 'summary_large_image')
  meta('twitter:title', m.title)
  meta('twitter:description', m.description)
  meta('twitter:image', m.image)

  // Structured data: replace wholesale so stale entities never linger.
  document.head.querySelectorAll(`script[type="application/ld+json"]${MANAGED}`)
    .forEach(el => el.remove())
  for (const block of m.jsonLd ?? []) {
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute('data-seo', '')
    el.textContent = JSON.stringify(block)
    document.head.appendChild(el)
  }
}

/**
 * `<Seo />` derives metadata from the current path; pass `meta` to override
 * (ProfDetail does this once the professor record has loaded).
 */
export default function Seo({ meta: override }) {
  const { pathname } = useLocation()

  useLayoutEffect(() => {
    applySeo(override ?? buildMeta(pathname))
  }, [pathname, override])

  return null
}
