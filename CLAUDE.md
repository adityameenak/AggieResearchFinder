# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Four independent components, each with its own dependencies and lifecycle:

- `crawler/` — Python scrapers that produce `faculty[-<code>].json` / `.csv`. Mixed stack: Playwright (TAMU/UT HTML), plain `requests` (Rice JSON:API, UTD), and pydoll (Scholar enrichment, py3.12 `venv312`).
- `backend/` — FastAPI + SQLAlchemy API (resume parsing, matching, email drafting)
- `ui/` — Vite + React 18 + Tailwind frontend, served as a multi-school SPA
- `tools/` — internal, file-based HTML utilities (lab-review, scholar-links) for data triage; **not** deployed.

There is no top-level package manager. Treat each directory as its own project.

**Live now: 6 schools, 4,838 faculty** — TAMU 1,772 · Rice 607 · UT Austin 913 · UT Dallas 542 · MIT 857 · Harvard 147, all `available: true`. The remaining TX R1s have no clean source (see the roadmap memory): UH is fragmented per-dept; UT Arlington Mentis + Texas Tech experts are closed SPAs.

The site is live at **stemresearchfinder.tech** (domain registered elsewhere, DNS pointed at Vercel). Push to `main` → Vercel builds `ui/` and deploys.

## Common commands

### Backend (`cd backend`)
```bash
source venv/bin/activate
uvicorn main:app --reload         # dev server on :8000, docs at /docs
```
Faculty are auto-imported on startup from `../ui/public/faculty.json` if the DB is empty. The startup migration also adds a `university` column to old DBs and backfills missing values as `tamu`. Manual reimport: `POST /api/faculty/import`. To force a re-import, delete `backend/tamurf.db`.

### UI (`cd ui`)
```bash
npm run dev                       # Vite on :5173, proxies /api → :8000
npm run build                     # production build to ui/dist
npm run preview                   # preview built bundle
```

### Crawler (`cd crawler`)
```bash
source venv/bin/activate

# TAMU — HTML scraping via crawl.py (uses seeds.txt, writes faculty.json)
python crawl.py

# Rice — JSON:API via crawl_rice.py (separate entry point, NOT crawl.py).
# Pulls the Drupal endpoint, filters to STEM research faculty, ~607 records,
# runs in ~2 min (plain requests, no Playwright/Chromium).
python crawl_rice.py --output faculty-rice
python crawl_rice.py --limit 40 --output /tmp/smoke   # quick validation
python crawl_rice.py --all                            # disable STEM/Faculty filter
python crawl_rice.py --keep-emeritus                  # keep emeriti (dropped by default)

# UT Dallas — central HTML directory via crawl_utd.py (separate entry, requests)
python crawl_utd.py --output faculty-utd

# AI research reviews (ai_review) — runs against any faculty file, in place.
# Needs a local Ollama server (`ollama serve`) + the model pulled.
python enrich_ollama.py --file faculty-rice.json --model gemma3:4b

# Google Scholar enrichment for blank profiles (pydoll = real Chrome via CDP,
# beats Scholar's CAPTCHA on profile URLs). Needs the py3.12 venv:
#   python3.12 -m venv venv312 && venv312/bin/pip install pydoll-python beautifulsoup4
python find_lab_scholar.py                                  # harvest scholar links from lab sites → /tmp/lab_scholar_map.json
./venv312/bin/python enrich_scholar_pydoll.py --file faculty-ut.json --map /tmp/lab_scholar_map.json
```
Output stems are configurable via `--output`. After running per-school crawls, merge their JSON arrays into `ui/public/faculty.json` (see README).

**Two crawler entry points, by design.** TAMU uses `crawl.py` (per-profile HTML scraping driven by `seeds.txt`). Rice uses `crawl_rice.py` because Rice exposes a single paginated Drupal **JSON:API** (`profiles.rice.edu/jsonapi/node/profile`) — structured records, no per-page HTML. Keep them separate; don't fold Rice into `crawl.py`. The `crawl.py --seeds seeds-rice.txt` path and `_extract_rice_profile` are legacy HTML fallbacks and are not how `faculty-rice.json` is produced.

No test suite is configured in any of the three components.

## Architecture notes

**Multi-university is the load-bearing concept.** The whole stack is per-school:
- Every faculty record carries a `university` field (`tamu`, `rice`, …).
- The UI is a multi-tenant SPA rooted at `/`: `/` shows a school picker (Landing), `/:schoolCode/*` mounts the per-school app shell.
- All per-user localStorage (saved profs, in-progress session, application tracker, search counts) is namespaced by school code so a Rice user's data never leaks into the TAMU view (and vice versa).
- Adding a school = entry in `ui/src/schools.js` + a crawler (extend `crawl.py` for HTML directories, or a `crawl_<school>.py` for a structured API like Rice's) + STEM dept slugs registered in `ui/src/utils/search.js` `DEPT_DISPLAY` + crawl run + optional `ai_review` enrichment + merge into `ui/public/faculty.json`.
- **Texas-university playbook (the goal is to keep onboarding more):** (1) find the directory/API; if it's a Drupal/JSON:API like Rice, clone `crawl_rice.py` and remap `field_*` names. (2) Census raw departments + a category/role field first, then build a STEM whitelist + role filter so you ship curated research faculty, not the whole HR directory. (3) Confirm `photo_url`/`email`/`research_summary` completeness lands near TAMU's (~100/99/100%) before merging — that bar is what "refined" means here. (4) Run `enrich_ollama.py --file faculty-<code>.json` for reviews. (5) Add dept labels + (optionally) a brand accent palette.

**Per-school UI rendering.** `App.jsx` mounts `<SchoolApp>` for any `/:schoolCode/*` route. `SchoolApp` wraps the existing pages in `SchoolProvider` + `AppProvider` so every page can call `useSchool()` for branding and `useSchoolPath()` for school-prefixed Link/navigate targets. Invalid school codes redirect to `/` via SchoolProvider's guard. **Don't write absolute Links inside per-school pages** — use `useSchoolPath()` (`to={tx('/search')}`) or it'll break Rice's namespace.

**Per-school theming is CSS-variable driven.** The whole app uses `maroon-*` Tailwind classes whose values come from CSS variables; `SchoolApp` stamps `data-school="<code>"` on `<html>`, and `index.css` has a `[data-school="<code>"]` block per school that overrides `--maroon-*` to that school's palette (tamu=maroon default, rice=blue, ut=orange, utd=green). **Adding a school's theme = add a `[data-school="<code>"]` block in `index.css`** (RGB triples). `schools.js` `accent` + `classes` are the *static* palette used only on the multi-school picker (where all schools render at once).

**Saved + Tracker are one feature ("My List").** Saving a professor IS a tracker entry — `toggleSave(prof)` in `AppContext` creates/deletes an application (status `"Saved"`); `isSaved(id)` checks by `profId`. **AppContext is the single source of truth** for the list (`applications`, `addApp/editApp/removeApp`, `savedCount`); `TrackerPage` ("My List") and the bookmark buttons all go through it so they never desync. Status pipeline: Saved → Interested → Drafting Email → Emailed → Replied → Applied → Interview → Accepted/Rejected/Closed (`trackerStorage.STATUSES`). There is no standalone Saved page (`/saved` redirects to `/tracker`). Match + Discover are a single "Match" nav entry (Discover = upload step → Match = ranked results).

**Search & match rendering.** `splitResearch(prof)` (in `utils/search.js`) is what cards show: it uses **`ai_review` as the preview** (clean prose) and relegates research-area phrases + `scholar_interests` to keyword pills — because `research_summary` is often a run-on of areas, not prose. Junk/heading terms are filtered by `isUsefulTopic` (shared with the topic chips). Topic filter chips are **department-adaptive**: `AppContext.topicChipsFor(dept)` derives them from the selected department's faculty (aero→propulsion, CS→ML). Search scores `scholar_interests` too. **Matching excludes blank profiles** — `matcher.isMatchable(prof)` requires research content (summary or scholar interests); no research → never a match (and the explanation degrades gracefully).

**One canonical department vocabulary.** Each crawler was written against one university's own naming, so the same discipline had different slugs per school — Rice/UT said `biosciences` where A&M/UTD/MIT said `biology`, MIT said `brain-cognitive-sciences` for psychology, and four schools each had their own earth-science slug. Filtering "Bioengineering" at A&M returned nothing because A&M emits `biomedical`. **`crawler/taxonomy.py` is now the authority**: `CANONICAL` is the slug→label list, `ALIASES` maps each crawler's naming onto it, and `merge.py` applies it to every record. `ui/src/utils/search.js` `DEPT_DISPLAY` is generated from `CANONICAL` — keep the two in step, and note a slug with no label renders raw *into indexed page titles*. `DEPT_STYLES`/`deptStyle()` in the same file is now the single badge-colour source; ProfCard, ProfDetail and Match each used to keep a private copy, which is why MIT/Rice/Harvard departments rendered grey.

**`crawler/merge.py` is the only supported way to build the app's data.** The README used to carry a copy-paste snippet with a hard-coded source map that had drifted — it silently dropped `faculty-mit*.json` and `faculty-harvard.json` (1,004 records). `merge.py` globs `faculty*.json` instead, canonicalizes slugs, dedupes, and writes **both** `ui/public/faculty.json` (combined; the backend importer and `find_lab_scholar.py` still read it) **and `ui/public/faculty-<code>.json` per school, which is what the UI fetches.**

**Joint appointments are merged, not duplicated.** ~120 people held two department listings, each with its own profile URL and id, so they appeared twice in search and generated competing near-duplicate indexed pages. `merge.py` merges on `(university, normalized name)` — **never on email**, because generic department addresses would collapse ~750 unrelated people (539 UTD records share `oris@utdallas.edu`). It **unions** fields rather than picking a winner, since the duplicates are asymmetric (one side often has the long `ai_review`, the other the Scholar link), keeps `department` scalar so the UI's filter/badge/chip code is untouched, and records `also_departments`, `also_profile_urls` and **`alias_ids`**. `AppContext.isSaved(id, prof)` checks `alias_ids` so a bookmark saved against a retired id still resolves instead of silently un-saving.

**`crawler/census.py` is the parity scoreboard.** `--audit` prints the coverage matrix (canonical department × school) and the card-quality table (photo/email/research/`ai_review`/interests/lab/Scholar, plus % blank). Run it before and after any crawl — the goal is that no school is an outlier in either table. `--probe` reaches candidate sources for missing departments and reports whether each is reachable, server-rendered or browser-only, and roughly how many people it lists; its `CANDIDATES` table records verified results so nobody re-probes a dead end.

**Most university directories are client-rendered now, and several are bot-protected.** Probed 2026-09-02: TAMU public-health and dentistry publish a full JSON roster at `/_json-data/json-profile-data.json` (with a `group` field separating Faculty from Staff) — that's what `crawl_tamu_health.py` uses. TAMU medicine's endpoint holds only placeholder data; nursing/pharmacy don't expose one; **vetmed 403s even with browser-like headers**. UT's `neuroscience`/`integrativebio` directories need JS but their profiles land on `bio.cns.utexas.edu/directory/<slug>`, which `_extract_ut_cns_profile` already handles. **Harvard FAS and HMS are Cloudflare-protected and blocked even under headless pydoll — only a non-headless pydoll window got through.** Harvard is simultaneously the biggest coverage gap and the hardest source.

**SEO is prerendered, not client-side.** The app is a client-rendered SPA, so every URL would otherwise ship one generic `<head>` and an empty `<body>` across ~4.9k pages. Three pieces fix that, and **all copy lives in `ui/src/lib/seo.js` — edit that, never the markup**:

- `src/lib/seo.js` — the single source of truth. `buildMeta(pathname)` returns title/description/canonical/keywords/OG/theme-color/JSON-LD for any route; `buildProfMeta(prof, school, dept)` does the same for a faculty page. `SCHOOL_SEO` holds each school's search-intent identity: `brand` (the phrase people actually type — "Aggie Research Finder"), `aka` (fed to schema.org `alternateName`), `keywords`, and `count`. `SCHOOL_SECTIONS` templates every `/:code/<section>` page. Titles are budgeted to <=62 chars and descriptions to <=165 so nothing is truncated in results; a school's `brand` is appended to sub-page titles only when it still fits.
- `scripts/prerender.js` — runs after `vite build` (wired into `npm run build`). Writes a real `dist/<route>/index.html` per route with that route's head plus a crawlable text summary inside `#root` (React discards it on hydration; it exists for bots that don't run JS). Covers 45 static routes **and every faculty profile** — `PRERENDER_FACULTY=0` (or `npm run build:fast`) skips the ~4.8k profile pages for a faster deploy at the cost of their long-tail visibility. Also emits `robots.txt` and a sitemap index. It **warns if `SCHOOL_SEO` counts drift from `faculty.json`** — heed that after a re-crawl.
- `src/components/Seo.jsx` — re-applies the same metadata on client-side navigation, since prerendered HTML only covers the first paint. Mounted once in `SchoolApp` (before `<main>`, so a page-level override runs last), plus `Landing` and `StatePage`. `ProfDetail` passes a memoized `meta` override so professor pages get their real name and `Person` schema.

Every tag those two own is marked `data-seo`; the prerenderer strips and re-emits them, and `applySeo` updates them in place, so tags never duplicate. **Vercel checks the filesystem before applying the SPA rewrite in `vercel.json`**, which is what makes the prerendered files win over the catch-all.

Because `seo.js` is imported by plain Node, its relative imports need explicit `.js` extensions — that's why `src/utils/search.js` imports `./topics.js`.

**Brand assets are generated, not hand-drawn.** `ui/scripts/gen_icons.py` (Pillow) renders the favicon set, PWA/maskable/apple-touch icons, and a 1200x630 Open Graph card per school in that school's colors, into `ui/public/`. It is **not** run at build time — run it manually and commit the output after a palette or school change. `public/favicon.svg` is the hand-written vector twin of the same mark.

**Data flow.** Each school's crawler writes `faculty[-<code>].json`. `merge.py` turns those into `ui/public/faculty.json` (combined) **and `ui/public/faculty-<code>.json` per school**. On the backend, `_auto_import_faculty()` ingests that combined file into the DB; the row-level `university` field powers `GET /api/faculty?university=<code>` filtering. On the UI, `AppContext` fetches **`/faculty-<code>.json`** through a module-level promise cache, so a visitor downloads only their school (worst case 0.95 MB gzipped, versus 2.15 MB for the combined file) and switching schools or StrictMode's double-mount doesn't re-fetch.

**Feedback goes to GitHub Issues.** `ui/api/feedback.js` files each submission as an issue on the repo via a raw `fetch` to the REST API (no new npm dependency). It follows the same degradation contract as the other functions: with no `GITHUB_TOKEN` it logs the payload and still returns success, so the user never sees a failure. `FeedbackModal.jsx` **must not call `useSchool()`** — it renders on Landing and StatePage, which are outside `SchoolProvider`; it reads `document.documentElement.dataset.school` instead. **Issues land on a public repo**, which is why the form says so.

**Mock mode is a first-class feature.** When `ANTHROPIC_API_KEY` is unset, `backend/services/llm.py` sets `MOCK_MODE=True` and the resume parser, matcher, and email drafter fall back to keyword/template implementations. The app stays fully functional. When changing AI features, preserve both code paths — check `MOCK_MODE` and provide a non-LLM fallback. `/api/health` exposes `mock_mode` so callers can tell which mode is active. The Vercel-side `ui/api/parse.js` and `ui/api/email.js` mirror this pattern (template fallback when `ANTHROPIC_API_KEY` is missing).

**LLM access is centralized.** All Anthropic calls from the backend go through `chat()` / `chat_json()` in `backend/services/llm.py`. Don't instantiate `anthropic.Anthropic()` elsewhere. The model is pinned via `MODEL` (currently `claude-haiku-4-5-20251001`). The Vercel functions instantiate the client directly because they're separate runtimes.

**School-aware email signatures.** The Vercel `/api/email` (which the UI actually calls) and the backend `/api/email/draft` both accept a `school_name` parameter. `EmailModal.jsx` passes `useSchool().name`. Don't hardcode "Texas A&M" in template bodies.

**Crawler dispatcher.** `extract_profile_fields(html, url)` routes by URL host: Rice → `_extract_rice_profile`, UT → `_extract_ut_profile`, TAMU artsci → `_extract_artsci_profile`, otherwise → `_extract_engineering_profile`. Each parser returns the same field shape. For Rice, `department` is read from the profile page itself (URL doesn't encode it) and slugified via `slugify_rice_dept()`. For UT, `department` comes from the subdomain (`ut_dept_from_host()`). The TAMU URL-derived `dept_slug` is overridden by the parser's returned `department` via the `**fields` spread.

**UT Austin is subdomain-sharded across many themes.** Unlike TAMU (one engineering domain) and Rice (one JSON:API), UT spreads STEM faculty across per-department subdomains (`ece.utexas.edu`, `me.utexas.edu`, …), each a *separately-built site with its own markup*. The department is the leading subdomain label, mapped to a slug by `_UT_SUBDOMAIN_DEPT`. `_extract_ut_profile()` is a **dispatcher** that routes by host to one of three Cockrell-engineering theme parsers:

- `ece.` → `_extract_ut_drupalkit_profile` — UT Drupal Kit (`field--name-field-*` / `views-field-field-*`; name from `<title>`). Link pattern `/people/faculty/<slug>`.
- `me.` → `_extract_ut_me_profile` — legacy theme (`.facphoto`, `.endowtitle`). Link pattern `/people/faculty-directory/<slug>`.
- everything else Cockrell → `_extract_ut_cockrell_profile` — modern WordPress (`.page-header__name`, `.contact__*`, `.position__*`, `.research_interests__content`; portrait from `og:image`). Link pattern `/person/<slug>`. Covers ae/bme/che/caee; **pge** is a WP variant where name/email/photo parse but title/research use different block classes (partial — see `seeds-ut.txt`).

`extract_profile_links()` recognizes all four UT URL shapes via `_UT_PROFILE_RE`; `_UT_NON_PROFILE_SLUGS` drops the appointment-category landing pages. `lab_website`/`google_scholar` come from scanning external links, filtered by `_UT_EXT_LINK_SKIP` (drops socials, ResearchGate, ORCID, admin/form domains).

**Status:** UT is **live** (`available: true`) with all 13 STEM departments — 7 **Cockrell School of Engineering** + 6 **College of Natural Sciences** — **913 faculty** in `faculty-ut.json`. CNS adds two parsers beyond the three engineering ones: `_extract_ut_cns_profile` (shared central-directory heading theme at `<dept>.utexas.edu/directory/<slug>` for math/physics/chemistry/statistics/molbio — no semantic classes, so it extracts by heading and dedups doubled desktop+mobile markup) and `_extract_ut_cs_profile` (UTCS theme at `cs.utexas.edu/people/faculty-researchers/<slug>`; the list lives at `/people`, since `/people/faculty-researchers` redirects to login). CNS directories list everyone (grad students, staff), so `_UT_CNS_FACULTY_RE` keeps only faculty by title. `_collect_ut_directory_links` runs in a **dedicated clean context** — the main crawl context forces `Sec-Fetch-Site: none` on every request, which breaks the same-origin XHR CNS directories use to lazy-load cards. UT reuses TAMU's dept slugs, so no new `DEPT_DISPLAY` entries are needed.

**UT Dallas has its own entry point (`crawl_utd.py`), like Rice.** UTD publishes one university-wide HTML directory at `profiles.utdallas.edu/browse?page=N` (URL-paginated, no JSON:API), with each person at `profiles.utdallas.edu/<slug>`. Plain `requests` works — no Playwright. Markup is consistent: `.profile-titles` = "Title - Department", `.profile_summary` = research blurb, `og:image` = portrait, building-code office (`GR 4.118`). The directory spans every school, so `STEM_RULES` keeps only STEM departments (parsed from the title line) — same curate-don't-dump pattern as Rice/CNS. UTD adds `systems-engineering` + `geosciences` to `DEPT_DISPLAY`; everything else reuses existing slugs. `university` code is `utd`.

**MIT spans two crawler entry points covering 13 departments, 857 faculty total.** `crawl_mit.py` covers EECS alone (~188 faculty, `department` derived from research-area keywords into `cse`/`electrical`). `crawl_mit2.py` covers the other 12 — School of Engineering (AeroAstro, ChemE, CEE, Materials/DMSE, NSE, Biological Engineering, MechE) + School of Science (Biology, BCS, Chemistry, EAPS, Math, Physics) — because MIT has no institute-wide directory; every department runs its own WordPress/Drupal/legacy site with different markup. `crawl_mit2.py` is dispatch-shaped like `crawl.py`'s UT handling: a per-department `collect_<dept>()` finds the faculty roster + profile URLs (table scrape, WP card grid, or JSON API depending on the site), and `parse_generic_profile()` — a heading-text-based extractor (matches any heading containing "research", walks forward collecting text) plus `og:image`/`<picture>` photo sniffing and mailto/external-link scanning — handles profile pages for the 9 departments built on ordinary WordPress. Three departments needed bespoke profile parsers: **MechE** (Drupal, table+letter-range pagination at `/people/all/<range>`, interests in an `<ol>`), **Math** (a legacy hand-built site — `/directory/faculty/{professors,associate,assistant}.html`, profile pages at `/directory/profile.html?pid=N` with base64-encoded `data-email`), and **BCS** (Drupal with Drupal-field markup, but the faculty *listing* is client-rendered — `collect_bcs()` uses Playwright to get the roster, then plain `requests` for the (server-rendered) profile pages). **NSE is the exception needing no profile fetch at all** — `nse.mit.edu/wp-json/endpoints/v1/people/search/?people_type=faculty` is an undocumented JSON API returning name/email/photo/research/bio/links in one call; check for this endpoint pattern (`wp-json/endpoints/v1/people/search/`) before assuming a department needs a profile-page scrape. Faculty-rank filtering everywhere is `FACULTY_TITLE_RE` (title contains "professor") minus `EMERITUS_RE` — same curate-don't-dump bar as Rice/UTD. New MIT-only `DEPT_DISPLAY` slugs: `brain-cognitive-sciences`, `earth-atmospheric-planetary` (others reuse existing Rice/Harvard slugs — `aerospace`, `chemical`, `civil`, `materials`, `nuclear`, `bioengineering`, `mechanical`, `biology`, `chemistry`, `mathematics`, `physics-astronomy`).

**Rice anti-bot guards.** `profiles.rice.edu` returns **406** to plain crawlers. `crawl_rice.py` defeats this with plain `requests` + a Chrome-like UA (with `ResearchFinderBot/1.0` suffix so we're still honest), `Accept: application/vnd.api+json`, `Referer: https://profiles.rice.edu/`, and `Sec-Fetch-*` headers (see `HEADERS` in the file). **No Playwright/Chromium needed** — an earlier version drove a headless browser before we found the header set that works. If a new school's JSON/HTML comes back empty or 406s, copy this header block first.

**Rice JSON:API field-mapping gotchas** (cost real debugging time — don't relearn them):
- **Photos require `?include=field_image`.** Without it the `included` array is empty and every `photo_url` silently resolves to `""` (this is why the first Rice ship had 0% photos). The image lives in an inlined `file--file` entity; read `attributes.uri.url` and prefix with `https://profiles.rice.edu`.
- **`field_image` relationship `data` is a LIST** (`[{...}]`), not a single object. Iterate it.
- **`field_links` is an ATTRIBUTE, not a relationship.** It's a plain list of Drupal link dicts on `attributes`. Do **not** add it to `include` (the API 400s — `field_links` is "not a valid relationship field name"). That mistake is why `lab_website` was 0%.
- **Filtering is load-bearing.** The raw endpoint returns ~4,400 records across every Rice unit (admin offices, residential colleges, alumni, emeriti, humanities, business). `crawl_rice.py` keeps only `field_profile_category == "Faculty"` AND a department that maps to a known STEM slug (`STEM_RULES`), and drops emeriti — yielding ~607 research faculty comparable to the curated TAMU set. `--all` / `--keep-emeritus` disable these.
- **Department names are filthy.** 241 raw variants with stray whitespace, `&` vs `and`, `Department of …` prefixes, and typos (`MSNE`, `Physics of Astronomy`). `stem_slug()` normalizes then substring-matches `STEM_RULES` (ordered: specific phrases before the bare `mathematics` fallback). New Rice STEM slugs (`biosciences`, `earth-environmental`, `systems-synthetic-biology`, `applied-physics`, `cmor`, `kinesiology`) are registered in `ui/src/utils/search.js` `DEPT_DISPLAY` — add a label there or they render as the raw slug.

**ai_review enrichment.** Reviews are generated post-crawl by `enrich_ollama.py` (local Ollama, `--file <faculty json>`), `enrich.py` (Gemini, needs `GEMINI_API_KEY`), or `enrich_local.py` (no-API templates — low quality, the "faculty member in …" text the other two are built to replace). All are re-runnable and only touch records missing a real review. `enrich_ollama.py` takes `--file` so it works per school. None of these run without either Ollama up or an API key, so a fresh crawl ships with `ai_review` empty until enriched.

**Blank-profile recovery (the research_summary / ai_review gap).** Many profiles ship "thin" (research_summary < 40 chars). Causes and fixes, in order of yield:
- **Parser misses.** TAMU arts-&-sciences pages put the "Research Interests" prose in a *different wrapper* than the `<h2>`, and `_collect_section_text` used to read only direct siblings → it grabbed a stray label. It now **walks the document in order** (find_all_next, de-duped); a re-extract recovered 256 TAMU summaries. Audit new parsers for the same sibling-only assumption.
- **Google Scholar (by URL).** For thin profiles that have (or are given) a `google_scholar` link, `enrich_scholar_pydoll.py` scrapes interests + top publications into `scholar_interests` + `research_summary`. It uses **pydoll** (real Chrome via CDP, py3.12 `venv312`) because Scholar CAPTCHAs plain requests/Playwright headless, and SeleniumBase-UC needs Rosetta on Apple Silicon. Scholar *profile pages* go through clean; the *author search* is still CAPTCHA-walled headless, so unknown links can't be auto-found.
- **Finding links:** `find_lab_scholar.py` harvests Scholar links off lab websites (~17% have one). For the rest, `tools/scholar-links.html` (internal, file-based) lets a human paste links → export a `--map` for `enrich_scholar_pydoll.py`.
- The genuinely source-sparse remainder (no research text, no lab, no Scholar) can't be filled; cards point to lab/Scholar instead, and matching excludes them.
- `tools/` also has `lab-review.html` (mark has-lab / no-lab / needs-enrichment). Internal only — not part of the deployed app.

**Matching is interest-first.** `services/matcher.py` weights student-stated interests over resume content (resume contribution is multiplied by 0.35). Fit labels are relative to the top score in the result set, not absolute thresholds — see README "Matching Algorithm" for the exact rules.

**Dev API proxy.** `ui/vite.config.js` proxies `/api/*` → `http://localhost:8000` so the frontend can call relative URLs in dev. In production set `VITE_API_BASE_URL` and the fetch wrapper in `ui/src/utils/api.js` will prepend it. `ui/api/` contains Vercel serverless functions (`email.js`, `parse.js`) used in the deployed environment — those are what the live UI actually calls, not the FastAPI backend.

## Environment

`backend/.env` (copied from `.env.example`):
- `ANTHROPIC_API_KEY` — leave empty for mock mode
- `DATABASE_URL` — defaults to `sqlite:///./tamurf.db`; swap for Postgres in prod
- `CORS_ORIGINS` — comma-separated; must include the UI origin
- `UPLOAD_DIR` — resume uploads

`crawler/.env` (optional):
- `GEMINI_API_KEY` — if set, crawler generates AI research reviews via Gemini. Disables itself on first failure for the rest of the run.

Backend deploy entry point is `backend/Procfile` (`uvicorn main:app --host 0.0.0.0 --port $PORT`).

## Gotchas

- `backend/tamurf.db`, `backend/uploads/`, `crawler/venv/`, `crawler/venv312/` (pydoll's py3.12 env), `crawler/downloaded_files/`, and `crawler/.cache/` are gitignored — never commit them.
- The crawler ships a `faculty[-<code>].json` per school in-tree; don't regenerate-and-commit casually. The Rice JSON:API crawl (`crawl_rice.py`) re-runs in ~2 minutes; `ai_review` enrichment over those records via local Ollama takes much longer (tens of minutes) — run it once and reuse.
- `ui/public/faculty.json` is the *combined* file the UI fetches and the backend imports on startup. After running per-school crawls, you must merge them into this file (see README quick-start).
- Adding a school means adding a `taxonomy.py` mapping for its department names, a `SCHOOL_SEO` entry in `ui/src/lib/seo.js` too, or its pages inherit no brand alias, keywords, or OG card — and add the card to `ui/scripts/gen_icons.py`, then re-run it.
- `/api/*` 404s under `npm run dev` — `vite.config.js` proxies `/api` to the FastAPI backend on :8000, so the Vercel functions (`parse`, `email`, `feedback`) aren't reachable. Use `vercel dev` or a preview deploy to exercise them.
- `npm run preview` always serves the SPA fallback, so sub-route `<title>`s look generic there. That's a `vite preview` behavior, not a bug — check prerendered output with `npx serve dist`, which resolves files the way Vercel does.
- When adding new internal Links in per-school pages, always use `useSchoolPath()` — absolute paths like `to="/search"` will navigate the user out of the school namespace.
- localStorage keys follow the pattern `<schoolCode>_<name>`. Don't write to bare `tamu_*` keys; use `${school.code}_*`.
- Tailwind classes for school-specific colors must be written out in full (`bg-maroon-700`, `text-rice-blue-700`) — JIT compilation can't follow `bg-${school.accent}-700` interpolation.
