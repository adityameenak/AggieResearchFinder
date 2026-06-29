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
