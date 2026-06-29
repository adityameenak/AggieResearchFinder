# Internal tools

Not part of the deployed app — local utilities for data work.

## Why some profiles are blank (investigation, 2026-06)

Across the combined `ui/public/faculty.json` (3,834 faculty): **~10% have a
blank research summary, ~20% are "thin" (<40 chars).** It's very uneven by
school, which points at the *source pages* and the per-site parsers, not a
single bug:

| School | Blank research |
|---|---|
| TAMU | 0% (original crawl was Gemini-enriched + good source) |
| Rice | 13% |
| UT Austin | 15% |
| UT Dallas | **36%** (many profiles.utdallas.edu pages are genuinely sparse) |

Two distinct causes:
1. **Sparse source** — the profile page itself has little/no research prose
   (common at UTD; nothing to scrape).
2. **Missed extraction** — the page *does* describe research but our per-site
   parser didn't capture it. Tell-tale sign: **the profile still has a lab
   website and/or Google Scholar link** even though research text is blank
   (e.g. Wen Song, petroleum). Of the 779 thin profiles, **261 have a
   lab/scholar link** → likely active researchers worth re-enriching.

## lab-review.html — triage tool

Self-contained page to quickly decide, per professor, whether they actually run
a lab (and flag who needs re-enrichment).

**Run it** (a server avoids `file://` fetch limits):
```bash
cd tools && python3 -m http.server 8090
# open http://localhost:8090/lab-review.html
```
It auto-loads `lab-review-queue.json` (the 779 thin profiles, link-having ones
first). Or open the HTML directly and click **Load queue…** to pick the JSON.

**Use it:** each card shows the photo, title/dept/school, clickable **Profile /
Lab site / Scholar** links, and the captured summary (if any). Mark each with
keyboard shortcuts — <kbd>l</kbd> has lab · <kbd>n</kbd> no lab ·
<kbd>e</kbd> needs enrichment — add an optional note/blurb, filter by school or
"has links / no links", and **Export decisions** to `lab-review-decisions.json`
(`[{id, verdict, notes}]`). Decisions persist in localStorage as you go.

Regenerate the queue after a re-crawl:
```bash
python3 - <<'PY'
import json
d=json.load(open("../ui/public/faculty.json"))
q=[{k:r.get(k,'') for k in ('id','university','name','title','department',
    'profile_url','lab_website','google_scholar','photo_url','email','research_summary')}
   for r in d if len((r.get('research_summary') or '').strip())<40]
q.sort(key=lambda r:(0 if (r['lab_website'] or r['google_scholar']) else 1, r['university'], r['department']))
json.dump(q, open("lab-review-queue.json","w"), ensure_ascii=False, indent=0)
print(len(q))
PY
```
The exported decisions can then drive a targeted re-enrichment pass (only the
"needs enrich" / "has lab" set).

## Google Scholar enrichment (for blank profiles)

Many thin profiles are blank only because the directory page has no research
text — but the professor has a Google Scholar profile with interests +
publications. We scrape that **by URL** with **pydoll** (a real Chrome via CDP):
plain `requests` / Playwright / SeleniumBase-UC all trip Scholar's CAPTCHA
headless, but pydoll fetching a *profile page* (not the author search, which is
still walled) goes through clean.

**Automatic** — scrape every thin profile that already has a `google_scholar`
link (needs the py3.12 venv: `python3.12 -m venv venv312 && venv312/bin/pip
install pydoll-python beautifulsoup4`):
```bash
cd crawler
./venv312/bin/python enrich_scholar_pydoll.py --file faculty-ut.json
```
It fills `scholar_interests` + a `research_summary` (interests + recent work).
Follow with `enrich_ollama.py --file …` to turn that into a clean `ai_review`.

**Manual links** — for the ~473 thin profiles with *no* captured Scholar link,
`scholar-links.html` lets you find + paste them fast:
```bash
cd tools && python3 -m http.server 8090   # → http://localhost:8090/scholar-links.html
```
It auto-loads `scholar-links-queue.json`; each card has a pre-filled **Search
Scholar** button. Paste the `…/citations?user=…` URL (validated), then **Export
links** → `scholar-links.json`. Apply them:
```bash
./venv312/bin/python enrich_scholar_pydoll.py --file faculty-rice.json --map scholar-links.json
```
Then re-run `enrich_ollama.py` and re-merge into `ui/public/faculty.json`.
