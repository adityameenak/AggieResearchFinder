# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Three independent components, each with its own dependencies and lifecycle:

- `crawler/` — Python + Playwright scrapers that produce `faculty.json` / `faculty.csv`
- `backend/` — FastAPI + SQLAlchemy API (resume parsing, matching, email drafting)
- `ui/` — Vite + React 18 + Tailwind frontend, served as a multi-school SPA

There is no top-level package manager. Treat each directory as its own project.

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

# TAMU (default — uses seeds.txt, writes faculty.json)
python crawl.py

# Rice (~1320 profiles, ~45 min)
python crawl.py --seeds seeds-rice.txt --university rice --output faculty-rice

# Validate a new parser on 5 records before committing to a long run
python crawl.py --seeds seeds-<school>.txt --university <code> --output faculty-<code> --limit 5
```
Output stems are configurable via `--output`. After running per-school crawls, merge their JSON arrays into `ui/public/faculty.json` (see README).

No test suite is configured in any of the three components.

## Architecture notes

**Multi-university is the load-bearing concept.** The whole stack is per-school:
- Every faculty record carries a `university` field (`tamu`, `rice`, …).
- The UI is a multi-tenant SPA rooted at `/`: `/` shows a school picker (Landing), `/:schoolCode/*` mounts the per-school app shell.
- All per-user localStorage (saved profs, in-progress session, application tracker, search counts) is namespaced by school code so a Rice user's data never leaks into the TAMU view (and vice versa).
- Adding a school = entry in `ui/src/schools.js` + parser in `crawler/crawl.py` + crawl run + merge into `ui/public/faculty.json`.

**Per-school UI rendering.** `App.jsx` mounts `<SchoolApp>` for any `/:schoolCode/*` route. `SchoolApp` wraps the existing pages in `SchoolProvider` + `AppProvider` so every page can call `useSchool()` for branding and `useSchoolPath()` for school-prefixed Link/navigate targets. Invalid school codes redirect to `/` via SchoolProvider's guard. **Don't write absolute Links inside per-school pages** — use `useSchoolPath()` (`to={tx('/search')}`) or it'll break Rice's namespace.

**Data flow.** Each school's crawler writes `faculty[-<code>].json`. These get merged into `ui/public/faculty.json` (one combined file, each record tagged with `university`). On the backend, `_auto_import_faculty()` ingests that combined file into the DB; the row-level `university` field powers `GET /api/faculty?university=<code>` filtering. On the UI, `AppContext` fetches `/faculty.json` once and filters in-memory by `useSchool().code`.

**Mock mode is a first-class feature.** When `ANTHROPIC_API_KEY` is unset, `backend/services/llm.py` sets `MOCK_MODE=True` and the resume parser, matcher, and email drafter fall back to keyword/template implementations. The app stays fully functional. When changing AI features, preserve both code paths — check `MOCK_MODE` and provide a non-LLM fallback. `/api/health` exposes `mock_mode` so callers can tell which mode is active. The Vercel-side `ui/api/parse.js` and `ui/api/email.js` mirror this pattern (template fallback when `ANTHROPIC_API_KEY` is missing).

**LLM access is centralized.** All Anthropic calls from the backend go through `chat()` / `chat_json()` in `backend/services/llm.py`. Don't instantiate `anthropic.Anthropic()` elsewhere. The model is pinned via `MODEL` (currently `claude-haiku-4-5-20251001`). The Vercel functions instantiate the client directly because they're separate runtimes.

**School-aware email signatures.** The Vercel `/api/email` (which the UI actually calls) and the backend `/api/email/draft` both accept a `school_name` parameter. `EmailModal.jsx` passes `useSchool().name`. Don't hardcode "Texas A&M" in template bodies.

**Crawler dispatcher.** `extract_profile_fields(html, url)` routes by URL host: Rice → `_extract_rice_profile`, UT → `_extract_ut_profile`, TAMU artsci → `_extract_artsci_profile`, otherwise → `_extract_engineering_profile`. Each parser returns the same field shape. For Rice, `department` is read from the profile page itself (URL doesn't encode it) and slugified via `slugify_rice_dept()`. For UT, `department` comes from the subdomain (`ut_dept_from_host()`). The TAMU URL-derived `dept_slug` is overridden by the parser's returned `department` via the `**fields` spread.

**UT Austin is subdomain-sharded (scaffolding, partial).** Unlike TAMU (one engineering domain) and Rice (one JSON:API), UT spreads STEM faculty across per-department subdomains (`ece.utexas.edu`, `me.utexas.edu`, …), each a separately-built site. The department is the leading subdomain label, mapped to a slug by `_UT_SUBDOMAIN_DEPT`. `_extract_ut_profile()` targets the shared **UT Drupal Kit** markup (`field--name-field-*` / `views-field-field-*` wrappers; the name comes from `<title>`, not an `<h1>`). **Only ECE (`electrical`) is verified end-to-end** — it yields 114 profiles at full field completeness. Other Cockrell departments are listed in `seeds-ut.txt` with a status legend: some directories are JS-rendered (links only appear under Playwright), and some (e.g. `me.utexas.edu`) use *different* profile markup that needs a per-site branch in `_extract_ut_profile()`. CNS departments (CS, math, physics, chemistry) use entirely different sites — future work. The `ut` school is registered in `ui/src/schools.js` with `available: false`; flip it once enough departments are merged. UT reuses TAMU's dept slugs, so no new `DEPT_DISPLAY` entries were needed.

**Rice anti-bot guards.** `profiles.rice.edu` returns 406 to plain crawlers. The crawler's Playwright context now sends a Chrome-like UA (with `ResearchFinderBot/1.0` suffix so we're still honest) plus `Sec-Fetch-*` headers, and `fetch_html` uses `domcontentloaded` + a 1.5s settle for Rice URLs (`networkidle` hangs there). If you add another university and see empty HTML or 406s, copy the Rice header set.

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

- `backend/tamurf.db`, `backend/uploads/`, `crawler/venv/`, and `crawler/.cache/` are gitignored — never commit them.
- The crawler ships a ~4MB `faculty.json` per school in-tree; don't regenerate-and-commit casually. Each Rice crawl re-runs in ~45 minutes.
- `ui/public/faculty.json` is the *combined* file the UI fetches and the backend imports on startup. After running per-school crawls, you must merge them into this file (see README quick-start).
- When adding new internal Links in per-school pages, always use `useSchoolPath()` — absolute paths like `to="/search"` will navigate the user out of the school namespace.
- localStorage keys follow the pattern `<schoolCode>_<name>`. Don't write to bare `tamu_*` keys; use `${school.code}_*`.
- Tailwind classes for school-specific colors must be written out in full (`bg-maroon-700`, `text-rice-blue-700`) — JIT compilation can't follow `bg-${school.accent}-700` interpolation.
