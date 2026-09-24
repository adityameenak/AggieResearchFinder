# Handoff

State of the project as of **2026-09-22**. `CLAUDE.md` covers architecture and
the rules that must not be broken; this covers what is running, what is
unfinished, and the things that will bite you.

---

## Where things stand

Live at **stemresearchfinder.tech** (Vercel, auto-deploys from `main`).

**5,218 faculty across 6 universities.** Percentages count only *valid* values
(see `crawler/quality.py`), so they are lower than before 2026-09-22 in places —
that drop was a correction, not a regression:

| school | records | photo | email | research | ai_review | interests | blank |
|---|---|---|---|---|---|---|---|
| TAMU | 1,674 | 96% | 98% | 82% | 87% | 34% | 17% |
| UT Austin | 1,134 | 88% | 95% | 89% | 89% | 3% | 11% |
| MIT | 773 | 78% | 100% | 97% | 97% | 41% | 3% |
| Rice | 618 | 97% | 95% | 85% | 86% | 1% | 15% |
| UT Dallas | 606 | 86% | 98% | 68% | 68% | 2% | 32% |
| Harvard | 413 | 71% | 83% | 95% | 95% | 27% | 5% |

`python census.py --audit --quality` for the live figures. `--quality` must read
0 in every cell; `merge.py` runs `quality.clean()` on every merge.

### The 2026-09-22 quality pass

- **UT Dallas outreach went to the research office.** 603 of 606 records had
  the site footer's `oris@utdallas.edu`. Real addresses were recovered from the
  profile's ROT13-obfuscated anchor (591), and `crawl_utd.py` now skips the footer.
  MIT biology's `bexec@` (72) was recovered by surname match. Harvard dental's
  44 `clinical_affairs@` are blanked — HSDM is Akamai-protected (403) and needs
  the CDP browser session below to recover.
- **Filler removed**: 379 placeholder photos/logos, 617 non-lab "lab websites",
  114 navigation-menu summaries, 22 TAMU Health footers, 28 mojibake fields, 51
  junk reviews; honorifics/degrees moved from `name` to `credentials`.
- **UT mechanical engineering** moved to the Cockrell theme; all 65 titles read
  "Distinguished". Re-extracted. 6 listing pages scraped as people were dropped.
- **34 people were listed twice** under name variants; merged by shared personal email.
- **New fields**: `credentials`, `title_short` (cards), `rank_type`
  (research/teaching/emeritus/adjunct/visiting — badged in the UI, down-weighted
  in matching, filterable).
- 71 AI reviews regenerated; 1 still errors (`needs_review` reports it).

### Open items

- **`crawler/stale_profiles.json`: 85 faculty whose profile page 404s** and who
  are not on their department's current listing. Probably left, retired or died.
  Review by hand; nothing was deleted. Built 2026-09-24 from a check of all
  5,802 profile URLs: 143 were dead, 42 of those had only moved (the TAMU
  engineering/statistics slug renames, including 16 statistics records crawled
  at the CMS placeholder `lowercase-firstname-lastnameN.html`) and were
  re-pointed, and 15 students/staff/category pages need nothing because
  merge.py drops them anyway.
- **Not dead-checked**: `profiles.rice.edu` answers 406 to plain requests (628
  pages) and the Akamai departments answer 403 (342). They need a browser.

Closed 2026-09-24:
- **Harvard HSDM emails are a source limit, not an unrun job.** A CDP session
  passes Akamai, but the profile pages carry only `clinical_affairs@`. 2 of 10
  sampled list an outside address (hospital, Gmail); not worth a crawl.
- **The last erroring AI review** (Francesco Maggi, UT math) had a summary of
  "See here" link text with no research in it. `quality._MENU_RE` now catches
  it, so it is blanked rather than retried.

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

### Harvard photos 71%, MIT 78%

Mostly placeholders that `quality.py` now refuses to count (MIT EECS logo ×104,
a Harvard shield ×55). There is no real photo behind them to recover.

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

## The MCP server

Live at **`https://stemresearchfinder.tech/api/mcp`**, documented for humans at `/mcp`.
Users add it in Claude under Settings → Connectors → Add custom connector. No key, no sign-up.

Architecture and the rules that must not be broken are in CLAUDE.md. What matters operationally:

- **Rate limiting in code is weak by construction.** `ui/api/_lib/ratelimit.js` counts in memory,
  so the ceiling is 60/min *per instance*. It is a guard against a runaway agent loop, not a
  defence. It is acceptable because the endpoint is read-only over files that are already public and
  CDN-cached, and because no paid model is reachable from it — `draft_email_brief` deliberately
  returns material rather than calling Anthropic.
- **The real lever is a Vercel Firewall rate-limit rule on `/api/mcp`**, set in the dashboard. Like
  `GITHUB_TOKEN` below, that is dashboard state this repo cannot see, so it is recorded here. **It
  has not been created yet** — do that before publicising the endpoint widely.
- It serves faculty JSON by fetching this site's own `/faculty-<code>.json`, which is already
  cached for an hour. So the endpoint costs bandwidth on cache hits and nothing else.
- To debug: exercise `ui/api/_lib/tools.js` directly first (no server needed), then `vercel dev`
  plus `npx @modelcontextprotocol/inspector`, then a preview deploy in a real client. Only a real
  client proves the transport.

## Outreach email quality

Rewritten because professors could tell the drafts came from a tool. The cause was inputs, not
phrasing: the prompt never saw `ai_review`, `scholar_interests` or the publication titles.

Measured on 18 TAMU professors, template path, before → after:

| | before | after |
|---|---|---|
| distinct subject lines | 1/18 | 14/18 |
| pairwise shared 5-grams (mean) | 0.94 | 0.39 |
| drafts containing a banned phrase | 18/18 | 0/18 |

```bash
cd ui && node scripts/email-variance.mjs --school tamu --n 18 --yes   # add --out to diff runs
```

**Publications are TAMU-only today**, and that is not a bug in the email code. All 601
`ui/public/pubs/*.json` files belong to TAMU records; the other five schools have no `pub_count` on
any record, so the "cite one recent paper" grounding tier only ever fires for TAMU and the other
schools correctly fall through to the research-summary tier. If publications get enriched for
another school, that tier starts working there with no code change.

**The model path is not yet measured.** There is no local `ANTHROPIC_API_KEY` (it lives in the
Vercel dashboard), so only the template fallback has been run end to end. The model path is
verified for imports, prompt assembly and the three grounding tiers, but its variance numbers need
one run against `vercel dev` or a preview deploy with the key present. Do that before claiming the
complaint is fixed.

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

**Fix a parser, then repair only affected records** (never a full re-crawl):
```bash
python reextract.py --host engineering.tamu.edu --blank research_summary --dry-run
```

**Reaching the GPU box**: the `ollama.akvaithi.page` ingress passes Access but
returned an empty body on 2026-09-22. Go over ZeroTier instead:
`ssh -O forward -L 11437:127.0.0.1:11434 win` then `OLLAMA_HOST=http://127.0.0.1:11437`.
(`127.0.0.1`, not `localhost` — Ollama on Windows listens on IPv4 only.)

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
