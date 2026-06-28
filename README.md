# ResearchFinder (Multi-University)

> AI-powered research discovery and outreach platform for Texas students. Started as the Aggie Research Finder for Texas A&M; now expanding to other Texas universities.

Upload your resume, enter your research interests, and get matched with faculty whose work aligns with where you want to go — not just where you've been. Then generate a personalized outreach email draft in one click.

Supported schools (each with its own subpage and branding):
- **Texas A&M** — `/tamu` — Aggie Research Finder
- **Rice** — `/rice` — Owl Research Finder

The landing page at `/` lets users pick their school.

| Part | Stack | Location |
|------|-------|----------|
| Crawler | Python + Playwright + BeautifulSoup | `/crawler` |
| Backend | FastAPI + SQLAlchemy + Claude AI | `/backend` |
| UI | Vite + React 18 + Tailwind CSS | `/ui` |

---

## Quick Start

### Frontend (works without backend — static search only)

```bash
cd ui
npm install
npm run dev
# → http://localhost:5173
```

`/search` works immediately using `ui/public/faculty.json`. The `/discover` and `/match` features require the backend.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env          # then edit .env

uvicorn main:app --reload
# → http://localhost:8000
# → API docs: http://localhost:8000/docs
```

Faculty data from `ui/public/faculty.json` is **auto-imported on startup**. No manual step needed. The DB schema is multi-tenant: each `FacultyRecord` carries a `university` code (`tamu`, `rice`, …) and `GET /api/faculty?university=<code>` filters to a single school.

### Crawler (to collect fresh faculty data)

**TAMU** (engineering + arts & sciences departments):
```bash
cd crawler
pip install -r requirements.txt
playwright install chromium
python crawl.py
# writes faculty.json + faculty.csv (university=tamu)
cp crawler/faculty.json ui/public/faculty.json
```

**Rice** (~5000 profiles via Drupal JSON:API — finishes in ~2 minutes):
```bash
cd crawler
python crawl_rice.py
# writes faculty-rice.json + faculty-rice.csv
```
Rice uses a separate entry point (`crawl_rice.py`) because `profiles.rice.edu` exposes a clean JSON:API at `/jsonapi/node/profile` — no HTML scraping required. Pagination is server-honored (`page[offset]`/`page[limit]`).

**Merge per-school datasets into the UI's combined file** (run after any school's crawl):
```bash
cd crawler
python -c "
import json
# Map each per-school file to its university code. The TAMU faculty.json is not
# self-tagged, so we backfill 'tamu' here; per-school files that already carry a
# 'university' field (e.g. faculty-rice.json) keep their own value.
SOURCES = {'faculty.json': 'tamu', 'faculty-rice.json': 'rice'}
combined = []
for path, uni in SOURCES.items():
    try: recs = json.load(open(path))
    except FileNotFoundError: continue
    for r in recs: r.setdefault('university', uni)
    combined.extend(recs)
json.dump(combined, open('../ui/public/faculty.json', 'w'), ensure_ascii=False, indent=2)
print(f'merged {len(combined)} records')
"
```

**Adding another university** — pick the strategy that fits the source:
- *Has a JSON/REST API?* Copy `crawl_rice.py` as `crawl_<school>.py`, change endpoint + field mapping. Easiest.
- *Only has HTML directory pages?* Add a `_extract_<school>_profile()` parser in `crawl.py`, dispatch via `extract_profile_fields`, supply a `seeds-<school>.txt`, run `python crawl.py --seeds seeds-<school>.txt --university <code> --output faculty-<code>`.

In both cases, register the school in `ui/src/schools.js`. The `university` field on each record is what makes per-school filtering work end-to-end.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | _(empty)_ | Claude API key. Leave blank to run in **mock mode** — all features work with template-based AI responses. |
| `DATABASE_URL` | `sqlite:///./tamurf.db` | SQLite (dev) or Postgres (`postgresql://user:pass@host/db`) |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed frontend origins |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded resume files |

### Frontend (`ui/.env.local` — only needed in production)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | _(empty)_ | Backend base URL (e.g. `https://api.yourapp.com`). In dev, Vite proxies `/api` → `localhost:8000` automatically. |

---

## API Reference

Full interactive docs at `http://localhost:8000/docs`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check + mock mode status |
| `GET` | `/api/faculty` | List all faculty |
| `GET` | `/api/faculty/{id}` | Get one faculty record |
| `POST` | `/api/faculty/import` | Re-import faculty.json into the database |
| `POST` | `/api/resume/upload` | Upload resume PDF/DOCX + interests → `session_id` + parsed profile |
| `GET` | `/api/resume/{session_id}` | Retrieve a session |
| `POST` | `/api/match` | Run matching → ranked professors with fit labels + explanations |
| `POST` | `/api/email/draft` | Generate a draft outreach email |

---

## AI Features & Mock Mode

**Mock mode** (no API key) — app is fully functional:
- Resume parsing uses keyword heuristics (extracts skills, tools, inferred themes from text)
- Match explanations use research summary snippets + interest text
- Email drafts use polished, tone-aware templates

**Real mode** (with `ANTHROPIC_API_KEY`) — powered by Claude:
- Structured JSON resume parsing via LLM
- Natural-language match explanations (top 10 results)
- Fully personalized email drafts

---

## Matching Algorithm

Matching is **interest-driven** — the student's stated interests dominate. Resume provides a secondary boost.

1. Tokenize the student's stated interests
2. Score each professor:
   - `interest_score` = keyword overlap(interests, research_summary + name + dept)
   - `resume_score` = keyword overlap(resume themes + skills, research_summary) × 0.35
   - `total = interest_score + resume_score`
3. Rank by total score, assign fit labels:
   - **Strong Fit** — score ≥ 60% of top result
   - **Exploratory Fit** — score ≥ 25% of top result
   - **Adjacent Fit** — everything else
4. Return top 20 with per-professor match explanations

---

## Data Models

**Faculty**
```json
{ "id", "name", "title", "department", "email", "profile_url", "lab_website", "research_summary" }
```

**Parsed resume profile**
```json
{
  "name", "year", "major", "gpa",
  "coursework": [],
  "technical_skills": [],
  "software_tools": [],
  "lab_techniques": [],
  "research_experiences": [{"title", "lab", "description"}],
  "project_experiences": [{"title", "description"}],
  "inferred_themes": []
}
```

**Match result**
```json
{ "professor", "score", "fit_label", "explanation", "rank" }
```

**Email draft**
```json
{ "subject", "body", "tone", "faculty_id", "session_id", "mock_mode" }
```

---

## Project Structure

```
ResearchFinder/
├── README.md
├── CLAUDE.md                 ← guidance for Claude Code sessions
├── .gitignore
├── crawler/
│   ├── crawl.py              ← TAMU + Rice parsers, dispatched by URL
│   ├── requirements.txt
│   ├── seeds.txt             ← TAMU department directory URLs
│   └── seeds-rice.txt        ← Rice profiles.rice.edu paginated URLs
├── backend/
│   ├── main.py               ← FastAPI app entry + startup
│   ├── requirements.txt
│   ├── .env.example
│   ├── db/
│   │   ├── database.py       ← SQLAlchemy engine + add-column migration
│   │   └── models.py         ← FacultyRecord (with university), ResumeSession
│   ├── routers/
│   │   ├── faculty.py        ← GET/POST /api/faculty?university=
│   │   ├── resume.py         ← POST /api/resume/upload
│   │   ├── match.py          ← POST /api/match (accepts university filter)
│   │   └── email.py          ← POST /api/email/draft (accepts school_name)
│   └── services/
│       ├── llm.py            ← Anthropic client + mock mode
│       ├── parser.py         ← Resume text extraction + parsing
│       ├── matcher.py        ← Hybrid keyword matching
│       └── emailer.py        ← Email draft generation (school-aware)
└── ui/
    ├── package.json
    ├── vite.config.js        ← proxies /api → localhost:8000 in dev
    ├── tailwind.config.js    ← maroon (TAMU) + rice-blue palettes
    ├── public/
    │   └── faculty.json      ← combined dataset; each record has university
    └── src/
        ├── App.jsx           ← /, /:schoolCode/* routing
        ├── SchoolApp.jsx     ← per-school shell (NavBar + Routes + Footer)
        ├── SchoolContext.jsx ← useSchool(), useSchoolPath() hooks
        ├── schools.js        ← school registry (add new schools here)
        ├── AppContext.jsx    ← filters faculty.json by current school
        ├── utils/
        │   ├── search.js
        │   ├── topics.js     ← per-school search-count storage
        │   ├── trackerStorage.js ← per-school applications storage
        │   └── api.js        ← fetch wrapper for backend calls
        ├── pages/
        │   ├── Landing.jsx   ← school picker at /
        │   ├── Home.jsx
        │   ├── Results.jsx
        │   ├── ProfDetail.jsx
        │   ├── Saved.jsx
        │   ├── About.jsx     ← copy reads from school config
        │   ├── Discover.jsx
        │   ├── Match.jsx
        │   └── TrackerPage.jsx
        └── components/
            ├── NavBar.jsx    ← brand + links derived from school context
            ├── Footer.jsx    ← brand + copy derived from school context
            ├── ProfCard.jsx
            ├── Reveal.jsx
            └── EmailModal.jsx ← passes school_name to /api/email
```

---

## Deployment

- **Frontend**: Vercel — Root Directory: `ui`. Set `VITE_API_BASE_URL` env var to your backend URL.
- **Backend**: Railway / Render / Fly.io — set `DATABASE_URL` (Postgres), `CORS_ORIGINS`, and `ANTHROPIC_API_KEY`.
- `faculty.json` must be in `ui/public/` for static search; it's also auto-imported into the DB on backend startup.

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Home — hero, how-it-works, CTAs |
| `/search` | Faculty search — keyword + department filter |
| `/discover` | Resume upload + interest entry |
| `/match` | AI match dashboard — ranked results with fit labels |
| `/prof/:id` | Professor detail — research + Draft Email button |
| `/saved` | Bookmarked professors |
| `/about` | About + tech stack |

---

## License

MIT — for educational and research purposes.
