# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Three independent components, each with its own dependencies and lifecycle:

- `crawler/` — Python + Playwright scraper that produces `faculty.json` / `faculty.csv`
- `backend/` — FastAPI + SQLAlchemy API (resume parsing, matching, email drafting)
- `ui/` — Vite + React 18 + Tailwind frontend

There is no top-level package manager. Treat each directory as its own project.

## Common commands

### Backend (`cd backend`)
```bash
source venv/bin/activate
uvicorn main:app --reload         # dev server on :8000, docs at /docs
```
Faculty are auto-imported on startup from `../ui/public/faculty.json` if the DB is empty. Manual reimport: `POST /api/faculty/import`. To force a re-import, delete `backend/tamurf.db`.

### UI (`cd ui`)
```bash
npm run dev                       # Vite on :5173, proxies /api → :8000
npm run build                     # production build to ui/dist
npm run preview                   # preview built bundle
```

### Crawler (`cd crawler`)
```bash
source venv/bin/activate
python crawl.py                   # writes faculty.json + faculty.csv in-place
cp faculty.json ../ui/public/faculty.json   # publish to UI + backend auto-import
```
Variants `enrich.py`, `enrich_local.py`, `enrich_ollama.py`, `enrich_scholar.py` are alternate enrichment passes — read the top of each before invoking.

No test suite is configured in any of the three components.

## Architecture notes

**Data flow.** `crawler/faculty.json` is the source of truth for faculty data. Copying it to `ui/public/faculty.json` powers both:
1. The frontend's static `/search` page (read directly from `public/`).
2. The backend's SQLite DB (auto-imported into `FacultyRecord` rows on first boot).

This means the static UI search works with **no backend running**. Only `/discover` and `/match` require the backend.

**Mock mode is a first-class feature.** When `ANTHROPIC_API_KEY` is unset, `backend/services/llm.py` sets `MOCK_MODE=True` and the resume parser, matcher, and email drafter fall back to keyword/template implementations. The app stays fully functional. When changing AI features, preserve both code paths — check `MOCK_MODE` and provide a non-LLM fallback. The `/api/health` endpoint exposes `mock_mode` so callers can tell which mode is active.

**LLM access is centralized.** All Anthropic calls go through `chat()` / `chat_json()` in `backend/services/llm.py`. Don't instantiate `anthropic.Anthropic()` elsewhere. The model is pinned via the `MODEL` constant in that file (currently `claude-haiku-4-5-20251001`) — update there to switch models.

**Backend wiring.** `main.py` mounts four routers under `/api/{faculty,resume,match,email}`. Each router delegates business logic to a peer module in `services/` (`parser.py`, `matcher.py`, `emailer.py`). DB models live in `db/models.py`; SQLAlchemy engine/session in `db/database.py`.

**Matching is interest-first.** `services/matcher.py` weights student-stated interests over resume content (resume contribution is multiplied by 0.35). Fit labels are relative to the top score in the result set, not absolute thresholds — see README "Matching Algorithm" for the exact rules.

**Dev API proxy.** `ui/vite.config.js` proxies `/api/*` → `http://localhost:8000` so the frontend can call relative URLs in dev. In production set `VITE_API_BASE_URL` and the fetch wrapper in `ui/src/utils/api.js` will prepend it. `ui/api/` contains Vercel serverless functions (`email.js`, `parse.js`) used in the deployed environment.

## Environment

`backend/.env` (copied from `.env.example`):
- `ANTHROPIC_API_KEY` — leave empty for mock mode
- `DATABASE_URL` — defaults to `sqlite:///./tamurf.db`; swap for Postgres in prod
- `CORS_ORIGINS` — comma-separated; must include the UI origin
- `UPLOAD_DIR` — resume uploads

Backend deploy entry point is `backend/Procfile` (`uvicorn main:app --host 0.0.0.0 --port $PORT`).

## Gotchas

- `backend/tamurf.db` and `backend/uploads/` are gitignored — never commit them.
- The crawler ships a 4MB `faculty.json` in-tree; don't regenerate-and-commit casually.
- `ui/public/faculty.json` is the file the backend imports on startup; keep it in sync with what the crawler produces.
