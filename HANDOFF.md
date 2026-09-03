# Handoff

State of the project as of 2026-09-02. `CLAUDE.md` covers architecture; this
covers what is running, what is unfinished, and the things that will bite you.

---

## Where things stand

Live at **stemresearchfinder.tech** (Vercel, auto-deploys from `main`).

**5,641 faculty across 6 universities.**

| school | records | photo | email | title | research | ai_review | blank |
|---|---|---|---|---|---|---|---|
| TAMU | 2,039 | 100% | 99% | 100% | 95% | 95% | 5% |
| UT Austin | 1,154 | 90% | 95% | 97% | 88% | 76% | 12% |
| MIT | 795 | 98% | 100% | 100% | 97% | 97% | 3% |
| Rice | 625 | 97% | 96% | 100% | 85% | 85% | 15% |
| UT Dallas | 607 | 100% | 100% | 100% | 65% | 68% | 33% |
| Harvard | 421 | 83% | 95% | 100% | 93% | 53% | 7% |

Department gaps: **TAMU 2, Rice 0, UT 1, UTD 0, MIT 0, Harvard 2.** Run
`python census.py --audit` for the live figure — it distinguishes a department
we failed to crawl from one the university does not have.

---

## Unfinished

### 1. AI reviews are paused mid-run

**371 records need a review**, counted with `enrich_ollama.py`'s own
`needs_review()` — not 283. It is what the cards render as their preview, so
those cards read worse than the rest.

The earlier figure missed `faculty.json` (TAMU), where **86 records carry a
`"Please provide..."` Gemini placeholder** — mostly statistics (62) and
oceanography (18). Those never appeared in the resume list, so they would have
stayed broken however many times the loop below was run. `faculty.json` is
first in the list now.

Stopped at `faculty-ut-extra.json` record 54 of 137. To resume:

```bash
cd crawler
for f in faculty faculty-ut-extra faculty-harvard-hsdm faculty-harvard-oeb \
         faculty-harvard-psychology faculty-harvard faculty-harvard-chemistry \
         faculty-harvard-statistics; do
  ./.venv/bin/python enrich_ollama.py --file $f.json
done
./.venv/bin/python merge.py --sync-sources
cd ../ui && npm run build
```

The model does not have to run on this Mac — this one has no GPU and no Ollama
installed. `enrich_ollama.py` now takes `--host`/`$OLLAMA_HOST`, so the run can
be pointed at the Windows box. **`HANDOFF-ollama-windows.md` is the setup doc
for that machine** — Ollama on loopback, a cloudflared tunnel, and a Cloudflare
Access service token, so nothing is exposed unauthenticated.

```bash
OLLAMA_HOST=http://<windows-ip>:11434 ./.venv/bin/python enrich_ollama.py --file faculty.json
```

It preflights the host and the model tag before starting, so a wrong address or
an unpulled model fails in one second instead of once per record for an hour.

Per-file counts as of 2026-09-02:

| file | needs review |
|---|---|
| faculty-harvard-hsdm | 109 |
| faculty-ut-extra | 87 |
| faculty (TAMU placeholders) | 86 |
| faculty-harvard-oeb | 38 |
| faculty-harvard-psychology | 27 |
| faculty-harvard | 15 |
| faculty-harvard-chemistry | 4 |
| faculty-harvard-statistics | 3 |
| faculty-ut | 1 |

A further ~500 records are blank but have less than 40 characters of
`research_summary`, so `needs_review()` skips them — no amount of enrichment
fixes those. They are the UTD blank-card population in §3.

`enrich_ollama.py` is re-runnable and only touches records missing a real
review, so re-running a partially-done file is safe. Roughly 3 records/minute.

### 2. Remaining department gaps — all investigated, all documented

Each has its reason recorded in `census.py` alongside the probe results. None
is simply unattempted.

| school | gap | why |
|---|---|---|
| TAMU | Medicine, Neuroscience | College of Medicine publishes no roster; its `_json-data` endpoint holds only placeholder records |
| UT | Oceanography | Marine Science Institute is client-rendered and returned 0 KB even in a browser |
| Harvard | Medicine, Neuroscience | HMS department URLs 404; its subdomains yield 5, 8, 1, 1, 0. Biomedical Informatics has 88 people but publishes no title line, so faculty cannot be separated from students |

### 3. Quality gaps that are not fixable from the source

- **UTD 33% blank cards (198 records).** Not a parser bug. Confirmed three
  ways: absent from raw HTML, absent from the rendered DOM after `networkidle`
  in a real browser, and the only endpoint (`profiles.utdallas.edu/tags/api`)
  is a CSRF-guarded Laravel tag search. Of the 198, 44 have a lab website and 1
  a Scholar link, so the documented Scholar ladder would recover about a dozen.
- **Harvard 83% photos, UT 90%.** Inherited from the newer Drupal parsers.
- **`scholar_interests` is 1–3% at Rice, UT and UTD** versus 41% at MIT. Would
  need `find_lab_scholar.py` → `enrich_scholar_pydoll.py` runs.

### 4. Not started

- **`publications` is TAMU-only** (35%, 0% elsewhere). Decide whether it is
  part of the standard or a TAMU bonus — right now it is undocumented.
- ~~**Core Web Vitals.**~~ Done 2026-09-02. `publications` is out of the list
  payload: `merge.py` writes `ui/public/pubs/<id>.json` per professor and puts
  `pub_count` on the record, and `ProfDetail` fetches that file only when the
  count is non-zero. TAMU's worst case went **1.00 MB → 0.58 MB gzipped**; 614
  files, 2.5 KB each. The combined `ui/public/faculty.json` still carries
  publications inline, because the backend importer and `find_lab_scholar.py`
  read it as the whole dataset.

  The estimate above said ~430 KB. The real floor is 0.58 MB — `ai_review`
  (1.09 MB raw) is the next-largest field and it stays, because the cards
  render it.

---

## Things that will bite you

### Re-crawling destroys enrichment unless you use merge.py

`ai_review`, `scholar_interests` and `publications` are generated *after* a
crawl, so a fresh crawl always writes them empty. This already happened once:
re-crawling Rice and UTD took their `ai_review` from 85%/65% to **0%**, silently.

`merge.py` now carries those fields forward by record id and `--sync-sources`
writes them back into the crawler files. **Always merge with
`python merge.py --sync-sources`.** Never hand-assemble the dataset.

### Harvard's Akamai departments need a browser you started yourself

Chemistry, physics, OEB, statistics, psychology and the dental school sit
behind Akamai. Every browser Playwright launches is refused — headless
Chromium, `playwright-stealth`, real Chrome channel, headed, persistent
profile, all 403. Attaching over CDP to a Chrome running as a normal session
passes immediately.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 --user-data-dir=/tmp/hv-cdp &
cd crawler
./venv/bin/python crawl_harvard_fas.py --cdp http://localhost:9333 --source chemistry
```

Their `robots.txt` — readable only through that browser — is stock Drupal
boilerplate with `/people/` untouched, same as `seas.harvard.edu`.

The Cloudflare departments (`eps`, `hsph`) need only `playwright-stealth` and
run without `--cdp`.

### The SEAS catch-all mislabels silently

`crawl_harvard.py` `_seas_dept()` ends with "if it looks technical, call it
`cse`". That turned 63 records into computer science, including every
electrical engineer, because SEAS writes "Electrical **&** Computer
Engineering" and the map looked for "electrical engineering". Fixed, but the
catch-all is still there. If a Harvard department looks suspiciously absent,
check whether it is hiding inside `cse`.

### Listings are paginated more often than they look

OEB returned 12 of 65 and the dental school 12 of 144 before pagination was
added. `crawl_harvard_fas.py` now walks `?page=N` until a page adds nothing.
When adding a source, check page 2 before believing the count.

### Department listings are rarely just faculty

Every listing so far has mixed in graduate students, postdocs, staff and
administrators, and some link to category landing pages that carry an `<h1>`
exactly like a person page ("Administration & Finance"). Harvard EPS is 103
grad students, 44 postdocs and 23 undergrads out of 167. Always filter on both
a name check and a genuine academic title, then eyeball the output.

### Other operational notes

- `/api/*` 404s under `npm run dev` — Vite proxies `/api` to the FastAPI
  backend on :8000, so the Vercel functions are unreachable. Use `vercel dev`
  or a preview deploy.
- `npm run preview` always serves the SPA fallback, so sub-route `<title>`s
  look generic. Check prerendered output with `npx serve dist`.
- Playwright browsers must be installed: `./venv/bin/python -m playwright install chromium`.
- `crawl_harvard_fas.py` needs `playwright-stealth` (in `requirements.txt`).

---

## The feedback box

`ui/api/feedback.js` files each submission as a GitHub issue on
`adityameenak/AggieResearchFinder`, labelled `feedback`, with the school code
and page path in the body. Verified working in production.

`GITHUB_TOKEN` is a fine-grained PAT with **Issues: write**, set in the Vercel
dashboard. It expires — when it does, the failure is **silent by design**: the
user still sees success and the payload goes to the Vercel function log
(Deployments → Functions → `/api/feedback`). Check there, not the UI, if
issues stop arriving.

Issues are public. The form says so, but that is the only guard.

---

## Feedback triage

`tools/triage.py` reads the open issues the feedback box files and does the
lookups by hand-checking them against the dataset: is that professor actually
present, is that department one the university does not have (`census.NOT_OFFERED`)
versus one we failed to collect, and what does the record behind that page URL
currently hold. It only reads — it never edits the dataset and never touches
GitHub.

```bash
cd tools
../crawler/.venv/bin/python triage.py                  # open issues
../crawler/.venv/bin/python triage.py --state all      # include closed
../crawler/.venv/bin/python triage.py --out report.md
```

The distinction that matters: "Rice has no neuroscience department" is a reply
to the reporter, while "UT oceanography has no records" is crawler work. The
script separates them so a triage pass does not keep proposing work that
`census.py` already recorded as a dead end.

As of 2026-09-02 there are **no open feedback issues** — the only three ever
filed are the closed setup tests (#10, #11, #12).

---

## Routine tasks

**Add a school:** entry in `ui/src/schools.js` + a crawler + department
mappings in `crawler/taxonomy.py` + a `SCHOOL_SEO` entry in `ui/src/lib/seo.js`
+ an OG card in `ui/scripts/gen_icons.py` (then re-run it) + a
`[data-school="<code>"]` block in `ui/src/index.css`. Then
`merge.py --sync-sources`, `census.py --audit`, rebuild.

**After any crawl:**
```bash
cd crawler
python merge.py --sync-sources     # never skip --sync-sources
python census.py --audit           # check no school became an outlier
# paste the printed counts into SCHOOL_SEO / TOTAL_FACULTY in ui/src/lib/seo.js
cd ../ui && npm run build          # prerender warns if the counts drifted
```

**Check what a candidate source would yield before building a crawler:**
`python census.py --probe`. Its `CANDIDATES` table records verified results
including the dead ends, so you do not re-probe them.
