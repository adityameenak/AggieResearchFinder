# Handoff

State of the project as of **2026-09-03**. `CLAUDE.md` covers architecture and
the rules that must not be broken; this covers what is running, what is
unfinished, and the things that will bite you.

---

## Where things stand

Live at **stemresearchfinder.tech** (Vercel, auto-deploys from `main`).

**5,260 faculty across 6 universities.**

| school | records | photo | email | research | ai_review | interests | blank |
|---|---|---|---|---|---|---|---|
| TAMU | 1,676 | 100% | 99% | 89% | 87% | 34% | 12% |
| UT Austin | 1,147 | 90% | 95% | 90% | 88% | 3% | 12% |
| MIT | 792 | 98% | 100% | 97% | 97% | 41% | 3% |
| Rice | 618 | 97% | 96% | 87% | 85% | 1% | 15% |
| UT Dallas | 606 | 100% | 100% | 68% | 68% | 2% | 32% |
| Harvard | 421 | 84% | 95% | 95% | 94% | 26% | 5% |

Run `python census.py --audit` for the live figure. **Do not compare these
against notes written before 2026-09-03** — the record count dropped from 5,641
when `merge.py` started dropping non-faculty, and TAMU's research coverage moved
twice in one day (down when 443 navigation-menu summaries were removed, up when
382 students and staff were). Both moves were corrections.

Department gaps: **TAMU 2, Rice 0, UT 1, UTD 0, MIT 0, Harvard 2** — all
investigated, all recorded in `census.py`. None is simply unattempted.

---

## The one open task

### 26 records need an `ai_review`

They have real research text (scraped from Google Scholar on 2026-09-02) and are
ready for a review. The pass was cut short when the Windows GPU box's tunnel
dropped mid-run.

```bash
cd crawler
cloudflared access tcp --hostname ollama.akvaithi.page --url localhost:11435 \
  --service-token-id "$CF_ACCESS_CLIENT_ID" \
  --service-token-secret "$CF_ACCESS_CLIENT_SECRET" &
curl -s http://localhost:11435/api/tags          # expect the model list

for f in faculty faculty-tamu-health faculty-harvard faculty-ut faculty-mit2 \
         faculty-rice faculty-ut-neuro faculty-utd; do
  OLLAMA_HOST=http://localhost:11435 ./.venv/bin/python -u enrich_ollama.py --file $f.json
done
./.venv/bin/python merge.py --sync-sources
./.venv/bin/python census.py --audit
cd ../ui && npm run build
```

Roughly a minute of GPU time. `HANDOFF-ollama-windows.md` is the setup doc for
that machine; `gemma3:4b` and nothing else (see CLAUDE.md on model consistency).

**If it fails, read the status code before touching the Access config.** With a
valid service token, **403** means Access refused you and **530** means Access
passed you and the origin is unreachable — 530 is the Windows box asleep or
`cloudflared` not running, and no amount of policy editing will fix it.

---

## Known limits, with the reason

None of these is an unrun job. Each was attempted and this is where it stopped.

### Google Scholar: the ceiling is ~43 records, not hundreds

`scholar_interests` reads Rice 1%, UT 3%, UTD 2% against MIT 41%, which looks
like a large recoverable gap. It is not.

Of 705 thin profiles, only **23** carried a Scholar link. `find_lab_scholar.py`
scanned the 216 with a lab website and found **20** more (9% — the ~17% quoted
elsewhere in this repo is optimistic). All 43 were scraped successfully, no
CAPTCHA. The remaining ~660 have no link and **no automatic way to get one**,
because Scholar's author *search* is CAPTCHA-walled while profile pages fetch
cleanly. `tools/scholar-links.html` — a human pasting links — is the only route.

MIT's 41% did not come from this pipeline at all; it comes from MIT's own
department pages. Do not plan another sweep expecting a big win.

### UTD's 32% blank cards are a source problem

Confirmed three ways: absent from raw HTML, absent from the rendered DOM after
`networkidle` in a real browser, and the only endpoint
(`profiles.utdallas.edu/tags/api`) is a CSRF-guarded Laravel tag search.

### Department gaps

| school | gap | why |
|---|---|---|
| TAMU | Medicine, Neuroscience | College of Medicine publishes no roster; its `_json-data` endpoint holds only placeholder records |
| UT | Oceanography | Marine Science Institute is client-rendered and returned 0 KB even in a browser |
| Harvard | Medicine, Neuroscience | HMS department URLs 404; its subdomains yield 5, 8, 1, 1, 0. Biomedical Informatics has 88 people but publishes no title line, so faculty cannot be separated from students |

### Harvard photos 84%, UT 90%

Inherited from the newer Drupal parsers. Not investigated.

---

## Things that will bite you

### Re-crawling destroys enrichment unless you use merge.py

`ai_review`, `scholar_interests` and `publications` are generated *after* a
crawl, so a fresh crawl writes them empty. This has already happened once:
re-crawling Rice and UTD took their `ai_review` from 85%/65% to **0%**, silently.

**Always merge with `python merge.py --sync-sources`.** Never hand-assemble.

### Clearing an enriched field takes two passes

The mirror image of the above, and it cost real time. `carry_forward()` refills
an empty enriched field from the previous `ui/public/faculty.json` and **cannot
distinguish a deliberate clear from a value lost to a re-crawl**. Blanking bad
values in `crawler/faculty*.json` alone is silently undone by the next merge —
clear both sides, then merge.

### A full artsci re-crawl will lose some summaries

`_looks_like_contact()` in `crawl.py` rejects the contact panel, which is
usually right and occasionally wrong: Jack Waas (chemistry) has genuine research
prose *inside* that panel. The September repair was applied only to records whose
summary was already junk, so he is intact today. **A full re-crawl of artsci
would drop him** and anyone laid out the same way. Handle before the next one.

### Harvard's Akamai departments need a browser you started yourself

Chemistry, physics, OEB, statistics, psychology and the dental school sit behind
Akamai. Every browser Playwright launches is refused — headless Chromium,
`playwright-stealth`, real Chrome channel, headed, persistent profile, all 403.
Attaching over CDP to a Chrome running as a normal session passes immediately.

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 --user-data-dir=/tmp/hv-cdp &
cd crawler
./.venv/bin/python crawl_harvard_fas.py --cdp http://localhost:9333 --source chemistry
```

The Cloudflare departments (`eps`, `hsph`) need only `playwright-stealth`.

### The SEAS catch-all mislabels silently

`crawl_harvard.py` `_seas_dept()` ends with "if it looks technical, call it
`cse`". That turned 63 records into computer science, including every electrical
engineer, because SEAS writes "Electrical **&** Computer Engineering" and the map
looked for "electrical engineering". Fixed, but the catch-all is still there. If
a Harvard department looks suspiciously absent, check inside `cse`.

### Listings are paginated more often than they look

OEB returned 12 of 65 and the dental school 12 of 144 before pagination was
added. When adding a source, check page 2 before believing the count.

### Department listings are rarely just faculty

Every listing so far has mixed in graduate students, postdocs, staff and
administrators. Harvard EPS is 103 grad students, 44 postdocs and 23
undergraduates out of 167. `merge.py` now drops the obvious cases by title
(see CLAUDE.md), but **that is a safety net, not a substitute for filtering in
the crawler** — it only knows what the title says.

### Other operational notes

- `/api/*` 404s under `npm run dev` — Vite proxies `/api` to the FastAPI backend
  on :8000, so the Vercel functions are unreachable. Use `vercel dev` or a
  preview deploy.
- `npm run preview` always serves the SPA fallback, so sub-route `<title>`s look
  generic. Check prerendered output with `npx serve dist`.
- Playwright browsers: `./.venv/bin/python -m playwright install chromium`.
- A fresh macOS checkout may have no Node, no Chrome, and only Python 3.9. See
  CLAUDE.md gotchas.

---

## The feedback box

`ui/api/feedback.js` files each submission as a GitHub issue on
`adityameenak/AggieResearchFinder`, labelled `feedback`, with the school code and
page path in the body. Verified working in production.

`GITHUB_TOKEN` is a fine-grained PAT with **Issues: write**, set in the Vercel
dashboard. It expires — and when it does the failure is **silent by design**: the
user still sees success and the payload goes to the Vercel function log
(Deployments → Functions → `/api/feedback`). Check there, not the UI, if issues
stop arriving.

Issues are public. The form says so; that is the only guard.

### Triage

`tools/triage.py` reads the open `feedback` issues and does the lookups by hand
first: is that professor actually in the dataset, is that department one the
university does not have (`census.NOT_OFFERED`) versus one we failed to collect,
and what does the record behind that page URL hold. It only reads — it never
edits the dataset and never touches GitHub.

```bash
cd tools
../crawler/.venv/bin/python triage.py                  # open issues
../crawler/.venv/bin/python triage.py --state all      # include closed
```

The distinction that matters: "Rice has no neuroscience department" is a reply to
the reporter, while "UT oceanography has no records" is crawler work. Keeping
them apart stops a triage pass proposing work `census.py` already recorded as a
dead end.

**Scheduled runs** are handled by `tools/triage-cron.sh` under launchd
(`~/Library/LaunchAgents/tech.stemresearchfinder.triage.plist`), every 3 hours,
independent of any interactive Claude session. `triage.py` is deterministic and
runs free on every tick; `claude -p` is invoked **only when the open-issue count
is non-zero**. `git push` is absent from its `--allowed-tools`, so an unattended
run cannot publish anything.

```bash
tail -f ~/Library/Logs/srf-triage.log
launchctl kickstart -k gui/$(id -u)/tech.stemresearchfinder.triage   # fire now
launchctl unload ~/Library/LaunchAgents/tech.stemresearchfinder.triage.plist
```

As of 2026-09-03 there are **no open feedback issues** — the only three ever
filed are the closed setup tests (#10, #11, #12).

---

## Routine tasks

**After any crawl:**
```bash
cd crawler
python merge.py --sync-sources     # never skip --sync-sources
python census.py --audit           # check no school became an outlier
# paste the printed counts into SCHOOL_SEO / TOTAL_FACULTY in ui/src/lib/seo.js
cd ../ui && npm run build          # prerender warns if the counts drifted
```

**Add a school:** entry in `ui/src/schools.js` + a crawler + department mappings
in `crawler/taxonomy.py` + a `SCHOOL_SEO` entry in `ui/src/lib/seo.js` + an OG
card in `ui/scripts/gen_icons.py` (then re-run it) + a `[data-school="<code>"]`
block in `ui/src/index.css`. Then `merge.py --sync-sources`, `census.py --audit`,
rebuild.

**Check what a candidate source would yield before building a crawler:**
`python census.py --probe`. Its `CANDIDATES` table records verified results
including the dead ends, so you do not re-probe them.

---

## Recent history (2026-09-02/03)

Four things landed, all on `main`:

1. **`publications` split out of the list payload.** `merge.py` writes
   `ui/public/pubs/<id>.json` per professor and leaves `pub_count` on the record;
   `ProfDetail` fetches only when the count is non-zero. TAMU's worst-case
   payload went 1.00 MB → 0.54 MB gzipped. The combined `ui/public/faculty.json`
   still carries publications inline, because the backend importer and
   `find_lab_scholar.py` read it as the whole dataset.
2. **371 AI reviews generated** on a Windows GPU box over a cloudflared tunnel;
   Harvard 53% → 94%, UT 81% → 88%. Three failure modes fixed in
   `enrich_ollama.py` (see CLAUDE.md) — refusals were being written into the
   dataset and rendered on cards.
3. **The artsci navigation-menu bug**: 443 records had a mega-menu as their
   research summary, and 360 had a review written from it. Fixed and repaired.
4. **382 non-faculty records dropped** — students, postdocs, administrative
   staff. This is what was inflating the blank-card rate.

`publications` was also settled as an **optional enrichment output**, not a
TAMU-only field and not a data-quality gap. See CLAUDE.md.
