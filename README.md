# Texas A&M Engineering Research Finder

A two-part project for helping students find TAMU Engineering faculty whose research matches their interests.

| Part | Stack | Location |
|------|-------|----------|
| Crawler | Python + Playwright + BeautifulSoup | `/crawler` |
| UI | Vite + React + Tailwind CSS | `/ui` |

---

## Project Structure

```
ResearchFinder/
├── README.md
├── crawler/
│   ├── crawl.py           ← main crawler script
│   ├── requirements.txt   ← Python dependencies
│   ├── seeds.txt          ← one directory URL per line
│   └── .cache/            ← auto-created disk cache (gitignore this)
└── ui/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── index.html
    ├── public/
    │   └── faculty.json   ← dataset loaded at runtime by the UI
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── AppContext.jsx
        ├── index.css
        ├── utils/
        │   └── search.js
        ├── pages/
        │   ├── Home.jsx
        │   ├── Results.jsx
        │   ├── ProfDetail.jsx
        │   └── Saved.jsx
        └── components/
            ├── NavBar.jsx
            └── ProfCard.jsx
```

---

## Part 1 — Running the Crawler

### Prerequisites

- Python 3.10 or newer
- `pip` (comes with Python)

### Step 1 — Install Python dependencies

```bash
cd crawler
pip install -r requirements.txt
```

### Step 2 — Install the Playwright browser

```bash
playwright install chromium
```

This downloads a Chromium binary (~150 MB) that Playwright uses to render JavaScript-heavy pages.

### Step 3 — (Optional) Edit `seeds.txt`

`seeds.txt` already contains all 10 TAMU College of Engineering department directory URLs. Comment out any departments you don't need (prefix with `#`) or add new ones (see "Adding More Departments" below).

### Step 4 — Run the crawler

```bash
# Use seeds from seeds.txt
python crawl.py

# Or pass extra URLs directly on the command line
python crawl.py https://engineering.tamu.edu/chemical/profiles/index.html#Faculty

# Force re-download (ignore disk cache)
python crawl.py --no-cache
```

Output files are written to the `crawler/` directory:

| File | Description |
|------|-------------|
| `faculty.json` | Full dataset (one JSON object per faculty member) |
| `faculty.csv`  | Same data in CSV format for spreadsheet analysis |
| `.cache/`      | Cached HTML pages — speeds up re-runs dramatically |

Expected runtime: ~2–5 minutes for a single department (varies with network speed and number of faculty). The crawler adds a 1.5-second polite delay between non-cached requests.

### Data Schema

Each record in `faculty.json` has these fields:

| Field | Description |
|-------|-------------|
| `id` | 12-char hex hash of the profile URL (stable identifier) |
| `name` | Full name extracted from the profile page |
| `title` | Academic rank / position |
| `department` | Slug derived from the directory URL (e.g. `chemical`, `cse`) |
| `email` | Email address if publicly listed |
| `profile_url` | Canonical URL of the faculty profile page |
| `research_summary` | Best-effort research description extracted from the profile |
| `lab_website` | External lab/group website if linked from the profile |

---

## Part 2 — Copying the Dataset to the UI

After the crawler finishes, copy `faculty.json` into the UI's `public/` folder so the browser can fetch it at runtime:

**macOS / Linux**
```bash
cp crawler/faculty.json ui/public/faculty.json
```

**Windows (PowerShell)**
```powershell
Copy-Item crawler\faculty.json ui\public\faculty.json
```

**Windows (Git Bash / WSL)**
```bash
cp crawler/faculty.json ui/public/faculty.json
```

> The `ui/public/faculty.json` included in the repo is a **sample dataset** with 10 synthetic professors so you can explore the UI immediately without running the crawler first.

---

## Part 3 — Running the UI Locally

### Prerequisites

- Node.js 18+ (LTS recommended) — download from [nodejs.org](https://nodejs.org)

### Step 1 — Install dependencies

```bash
cd ui
npm install
```

### Step 2 — Start the development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Step 3 — (Optional) Build for production

```bash
npm run build
# Preview the production build:
npm run preview
```

The built files land in `ui/dist/` — deploy them to any static host (Netlify, Vercel, GitHub Pages, S3, etc.).

---

## UI Feature Overview

| Route | Description |
|-------|-------------|
| `/` | Home — search bar, clickable interest chips, department filter |
| `/results` | Search results — ranked professor cards with keyword highlights |
| `/prof/:id` | Full profile detail page |
| `/saved` | Bookmarked professors (persisted in `localStorage`) |

**Search ranking** — queries are tokenized into keywords; each professor is scored by the number of keyword occurrences in `research_summary`, `name`, and `title` (with a bonus for name matches). Results are sorted descending by score.

**Keyword highlighting** — matched tokens are highlighted in yellow inside research summary snippets on the results page.

**Bookmarks** — click the ☆ star on any card or profile page. Saved professors persist across browser sessions via `localStorage`.

---

## Adding More Departments

1. Open `crawler/seeds.txt`.
2. Add one directory URL per line. For example:

   ```
   # Biomedical Engineering (if it has a profiles directory)
   https://engineering.tamu.edu/biomedical/profiles/index.html#Faculty
   ```

3. Re-run the crawler. Already-crawled pages are served from the disk cache, so only the new department's pages are downloaded.

4. Copy the updated `faculty.json` to `ui/public/faculty.json` and refresh the UI.

The crawler automatically:
- Derives a department slug from the URL path (e.g. `biomedical`)
- De-duplicates profiles if the same URL appears across multiple seeds
- Merges new faculty with any previously exported records on subsequent runs (by overwriting the output files with the full dataset each run)

---

## Crawler Architecture Notes

```
seeds.txt / CLI args
       │
       ▼
  [Playwright] — headless Chromium, handles JS rendering
       │
  Directory page HTML
       │
  extract_profile_links()  ← regex on /profiles/*.html hrefs
       │
  Profile URLs (deduplicated)
       │
  fetch_html()  ← Playwright + disk cache + rate limit + retry
       │
  Profile page HTML
       │
  extract_profile_fields()  ← BeautifulSoup, 4 fallback strategies
       │
  faculty.json / faculty.csv
```

**Extraction strategies** (in priority order):
1. Find a heading matching "Research", "Research Interests", "Expertise", etc. and collect following text
2. Find elements with `id` or `class` attributes containing "research" or "expertise"
3. Look for Drupal/CMS wrapper classes common on TAMU sites (`field-name-body`, etc.)
4. Fall back to the longest `<p>` on the page

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `playwright install` fails | Run `pip install playwright` first, then retry |
| Pages time out | Try `--no-cache` and a stable internet connection. TAMU servers can be slow. |
| `faculty.json` is empty | Check that `seeds.txt` URLs are accessible from your network |
| UI shows "Loading dataset…" indefinitely | Make sure `faculty.json` is in `ui/public/` |
| `npm install` fails | Ensure Node 18+: `node --version` |
| Port 5173 already in use | Run `npm run dev -- --port 5174` |

---

## License

MIT — for educational and research purposes.
