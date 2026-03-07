# TAMUResearchFinder

> AI-powered research discovery and outreach platform for Texas A&M students.

Upload your resume, enter your research interests, and get matched with TAMU faculty whose work aligns with where you want to go — not just where you've been. Then generate a personalized outreach email draft in one click.

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

Faculty data from `ui/public/faculty.json` is **auto-imported on startup**. No manual step needed.

### Crawler (to collect fresh faculty data)

```bash
cd crawler
pip install -r requirements.txt
playwright install chromium
python crawl.py
# writes faculty.json + faculty.csv
cp crawler/faculty.json ui/public/faculty.json
```

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
├── .gitignore
├── crawler/
│   ├── crawl.py
│   ├── requirements.txt
│   └── seeds.txt
├── backend/
│   ├── main.py               ← FastAPI app entry + startup
│   ├── requirements.txt
│   ├── .env.example
│   ├── db/
│   │   ├── database.py       ← SQLAlchemy engine + session
│   │   └── models.py         ← FacultyRecord, ResumeSession
│   ├── routers/
│   │   ├── faculty.py        ← GET/POST /api/faculty
│   │   ├── resume.py         ← POST /api/resume/upload
│   │   ├── match.py          ← POST /api/match
│   │   └── email.py          ← POST /api/email/draft
│   └── services/
│       ├── llm.py            ← Anthropic client + mock mode
│       ├── parser.py         ← Resume text extraction + parsing
│       ├── matcher.py        ← Hybrid keyword matching
│       └── emailer.py        ← Email draft generation
└── ui/
    ├── package.json
    ├── vite.config.js        ← proxies /api → localhost:8000 in dev
    ├── tailwind.config.js
    ├── public/
    │   └── faculty.json      ← static dataset for search
    └── src/
        ├── App.jsx
        ├── AppContext.jsx
        ├── utils/
        │   ├── search.js
        │   └── api.js        ← fetch wrapper for backend calls
        ├── pages/
        │   ├── Home.jsx
        │   ├── Results.jsx
        │   ├── ProfDetail.jsx ← now includes Draft Email button
        │   ├── Saved.jsx
        │   ├── About.jsx
        │   ├── Discover.jsx  ← resume upload + interests
        │   └── Match.jsx     ← match results dashboard
        └── components/
            ├── NavBar.jsx
            ├── Footer.jsx
            ├── ProfCard.jsx
            ├── Reveal.jsx
            └── EmailModal.jsx ← tone selector + editable draft
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
