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

### 1. AI reviews — done, except 83 that cannot be done this way

**All 371 were generated on 2026-09-02** against Ollama on the Windows GPU box
(gemma3:4b, ~100% GPU, 89.7 tok/s, whole run under 20 minutes — not the
~3 records/min the old note assumed).

Result: **288 genuine reviews, 83 refusals.** Coverage moved Harvard 53% → 94%,
UT 81% → 88%, overall 85% → 88%. TAMU reads 95% → 91% because the 83 refusals
used to be counted as reviews; the lower number is the honest one.

**The 83 are a TAMU parser bug, not an enrichment gap.** Their
`research_summary` is scraped navigation chrome —

    "Research Faculty Instructional Faculty Emeritus Faculty Joint Appointm…"
    "Research Areas Seminars Lecture Series Close the Research menu"

— so the model is handed a menu and correctly answers that it has nothing to
work with. This is why they were `"Please provide…"` placeholders before: the
earlier Gemini run hit the identical wall and its refusal got saved as the
review. **Running any enrichment against them again will produce the same
refusal.** The fix is upstream, in whatever TAMU parser wrote a menu into
`research_summary` — the sibling-walking problem CLAUDE.md describes under
blank-profile recovery, in a spot where it was not fixed.

`enrich_ollama.py` now refuses to make that mistake again:

- `is_refusal()` rejects a model response that asks for input instead of
  answering, so it is never written into `ai_review`. Previously anything over
  50 characters was accepted, which is how a 277-character "Please provide me
  with the scraped research information" ended up rendering on search cards.
- `is_junk_summary()` makes `needs_review()` skip records whose source is menu
  text, so they stop consuming GPU time on every run.
- The `enrich_local.py` template check now matches its actual sentence, **"As a
  faculty member in"**, instead of the bare phrase `"faculty member in"`. The
  loose version also matched good output — gemma3 naturally writes "X, a faculty
  member in the Department of Y" — so 37 correct ut-extra reviews were already
  queued to be regenerated forever.

The 84 refusal texts already in the dataset were cleared. **That takes two
passes:** clearing them in `crawler/faculty*.json` alone is undone by the next
merge, because `carry_forward()` refills an empty field from the previous
`ui/public/faculty.json` and cannot tell a deliberate clear from a value lost in
a re-crawl. Clear both sides, then merge.

To re-run enrichment against a GPU box:

```bash
cd crawler
cloudflared access tcp --hostname ollama.<domain> --url localhost:11435 \
  --service-token-id "$CF_ACCESS_CLIENT_ID" \
  --service-token-secret "$CF_ACCESS_CLIENT_SECRET" &
OLLAMA_HOST=http://localhost:11435 ./.venv/bin/python enrich_ollama.py --file <file>.json
./.venv/bin/python merge.py --sync-sources
```

`HANDOFF-ollama-windows.md` covers the Windows side.

### 1b. The artsci navigation-menu bug (fixed 2026-09-02)

**443 TAMU records — 22% of the school — had a navigation menu as their
`research_summary`.** `_extract_research_summary()` Strategy 2 did

```python
el = soup.find(class_=re.compile("research", re.I))
```

and `find()` returns the first match in document order. On artsci.tamu.edu that
is `<div class="megamenu megamenu--two-column research">`, rendered before
`<main>`. Every profile on that site got the Research mega-menu instead of the
person's research, which is where `"Close the Research menu"` came from.

It was not confined to one field. `research_summary` feeds the search keyword
pills and `matcher.py`, so the menu text was in the search index and the match
scores; and 360 of the 443 carried an `enrich_local.py` review written *from*
that menu — "Dr. Clair is a researcher in Biology. Research Overview Biology
Course-based Experience (CUREs) Seminars…" — rendering as their card preview.

The fix, in `crawl.py`:

- `_in_chrome()` walks outward but **stops at `<main>`**. An earlier attempt
  checked nav-ish class names on every ancestor and matched
  `<div class="main-wrapper has-sidebar">`, which discarded every good summary
  on the site. Layout words are deliberately not in the pattern.
- `_CHROME_CLASS_RE` matches as a **substring**: the wrapper is `megamenu`, and
  `\bmenu\b` does not match it.
- Strategy 2 gathers every candidate and picks the best, preferring prose. Several
  wrappers on one page carry a research-ish id and only one is the summary.
- `_looks_like_contact()` rejects the `research-next-to-photo` contact panel.
- `_BIO_HEADING_RE` adds a `Biography` fallback — worth +31 records by itself,
  mostly graduate students who describe their work there and have no Research
  heading.

**Known false negative.** Jack Waas (chemistry) has genuine research prose
*inside* the contact panel, and `_looks_like_contact()` throws it away. The
repair was applied only to records whose stored summary was junk, so he is
untouched today — but **a full re-crawl of artsci would lose him** and anyone
laid out like him. Worth handling before the next full TAMU crawl.

**The coverage numbers went down, and that is the point.** TAMU research
95% → 79%, `ai_review` 91% → 79%, blank 5% → 21%. The old figures counted menu
text as research. 114 of the 443 had real prose recoverable and were re-enriched;
the other 329 are genuinely empty pages.

**Which exposes a separate problem.** Sampling those 329 turns up "Executive
Assistant II", "Senior Administrative Coordinator II", postdocs and graduate
students — pages with ~140 characters of name and email. **Administrative staff
are in a research-faculty dataset.** `crawl.py`'s title filter for artsci is not
doing what `FACULTY_TITLE_RE` does for MIT. Fixing that would drop the record
count and raise every quality percentage at once, because the denominator is
wrong. Not attempted here.

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
