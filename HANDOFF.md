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

**283 records have no `ai_review`.** This is the only outstanding task. It is
what the cards render as their preview, so those cards read worse than the rest.

Stopped at `faculty-ut-extra.json` record 54 of 137. To resume:

```bash
cd crawler
ollama serve &                      # if not already running
for f in faculty-ut-extra faculty-harvard-hsdm faculty-harvard-oeb \
         faculty-harvard-psychology faculty-harvard faculty-harvard-chemistry \
         faculty-harvard-statistics; do
  ./venv/bin/python enrich_ollama.py --file $f.json
done
python merge.py --sync-sources
cd ../ui && npm run build
```

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
- **Core Web Vitals.** The per-school split took the worst case from 2.15 MB to
  0.95 MB gzipped, but TAMU is still ~1 MB. Splitting `publications` out of the
  list payload would take it to ~430 KB; only `ProfDetail` reads that field.

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
