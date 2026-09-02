#!/usr/bin/env python3
"""
Data-parity reporting for the faculty dataset. Read-only — writes no data.

Two modes:

  python census.py --audit          coverage + card-quality tables for what we
                                    already have (offline, instant)
  python census.py --probe          hit candidate sources for departments we're
                                    missing and estimate what each would yield
  python census.py --probe --only harvard        just one school's candidates

`--audit` is the parity scoreboard: run it before and after any crawl. The goal
is that no school is an outlier in either table — every school covers the same
canonical STEM departments, with cards of the same completeness.

`--probe` is the go/no-go input for crawler work. It reports, per candidate
source, whether the roster is reachable, whether it is server-rendered or needs
a browser, and roughly how many people it lists — so we can decide what's worth
building before building it.
"""
import argparse, collections, json, re, sys
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import taxonomy

HERE = Path(__file__).parent
UI_JSON = HERE.parent / "ui" / "public" / "faculty.json"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ResearchFinderBot/1.0")

SCHOOLS = ["tamu", "rice", "ut", "utd", "mit", "harvard"]

# ── Card-quality checks — the "gold standard" definition ─────────────────
# A card is only as good as these fields; `research` and `ai_review` are what
# the card body actually renders (see splitResearch in ui/src/utils/search.js).
CHECKS = [
    ("photo",     lambda r: bool(r.get("photo_url"))),
    ("email",     lambda r: bool(r.get("email"))),
    ("title",     lambda r: bool(r.get("title"))),
    ("research",  lambda r: len((r.get("research_summary") or "").strip()) >= 40),
    ("ai_review", lambda r: len((r.get("ai_review") or "").strip()) >= 40),
    ("interests", lambda r: bool(r.get("scholar_interests"))),
    ("lab_site",  lambda r: bool(r.get("lab_website"))),
    ("scholar",   lambda r: bool(r.get("google_scholar"))),
]


def is_blank(r):
    """Matches matcher.isMatchable — no research signal means never a match."""
    return (len((r.get("research_summary") or "").strip()) < 40
            and not r.get("scholar_interests"))


# ── Audit ────────────────────────────────────────────────────────────────

def load(path):
    if not Path(path).exists():
        sys.exit(f"census: {path} not found — run merge.py first.")
    return json.loads(Path(path).read_text())


def audit(path):
    records = load(path)
    by_school = collections.defaultdict(list)
    for r in records:
        by_school[r.get("university", "?")].append(r)
    schools = [s for s in SCHOOLS if s in by_school] + \
              [s for s in sorted(by_school) if s not in SCHOOLS]

    # ── Coverage matrix ──────────────────────────────────────────────
    dept_of = collections.defaultdict(collections.Counter)
    for s, rows in by_school.items():
        for r in rows:
            dept_of[s][taxonomy.canonical_slug(r.get("department"))] += 1

    present = sorted({d for c in dept_of.values() for d in c})
    print("\n" + "=" * 78)
    print("COVERAGE — canonical department x school")
    print("=" * 78)
    print(f"{'department':<32}" + "".join(f"{s:>8}" for s in schools))
    print("-" * (32 + 8 * len(schools)))
    gaps = collections.Counter()
    for d in present:
        row = "".join(f"{dept_of[s][d]:>8}" if dept_of[s][d] else f"{'-':>8}"
                      for s in schools)
        print(f"{taxonomy.label(d)[:31]:<32}{row}")
        for s in schools:
            if not dept_of[s][d]:
                gaps[s] += 1
    print("-" * (32 + 8 * len(schools)))
    print(f"{'MISSING (of %d)' % len(present):<32}" +
          "".join(f"{gaps[s]:>8}" for s in schools))

    unknown = taxonomy.audit_slugs(d for c in dept_of.values() for d in c)
    if unknown:
        print(f"\n!! slugs with no CANONICAL entry: {', '.join(unknown)}")
        print("   add to taxonomy.CANONICAL (+ DEPT_DISPLAY) or taxonomy.ALIASES")

    # ── Card quality ─────────────────────────────────────────────────
    print("\n" + "=" * 78)
    print("CARD QUALITY — % of records with each field")
    print("=" * 78)
    hdr = f"{'school':<9}{'n':>6}" + "".join(f"{c[0]:>10}" for c in CHECKS) + f"{'blank':>8}"
    print(hdr)
    print("-" * len(hdr))
    for s in schools + ["ALL"]:
        rows = records if s == "ALL" else by_school[s]
        if not rows:
            continue
        cells = "".join(f"{100.0 * sum(1 for r in rows if fn(r)) / len(rows):>9.0f}%"
                        for _, fn in CHECKS)
        blank = 100.0 * sum(1 for r in rows if is_blank(r)) / len(rows)
        sep = "-" * len(hdr) + "\n" if s == "ALL" else ""
        print(f"{sep}{s:<9}{len(rows):>6}{cells}{blank:>7.0f}%")

    # ── Duplicates ───────────────────────────────────────────────────
    groups = collections.defaultdict(list)
    for r in records:
        groups[(r.get("university"), " ".join((r.get("name") or "").lower().split()))].append(r)
    dupes = {k: v for k, v in groups.items() if len(v) > 1}
    if dupes:
        surplus = sum(len(v) - 1 for v in dupes.values())
        per = collections.Counter(k[0] for k in dupes)
        print(f"\nDUPLICATES: {len(dupes)} people appear more than once "
              f"({surplus} surplus records) — " +
              ", ".join(f"{s} {n}" for s, n in per.most_common()))
    else:
        print("\nDUPLICATES: none")
    print()


# ── Probe ────────────────────────────────────────────────────────────────
# Candidate sources for departments a school is missing. `pattern` is the
# profile-link shape used to estimate roster size from the listing HTML.
CANDIDATES = [
    # school, canonical dept, listing URL, profile-link regex (None = JSON roster)
    #
    # Verified 2026-09-02. Notes record what actually happened, so nobody
    # re-probes a dead end:
    #   JSON      — plain requests, roster in a JSON file. Cheapest.
    #   rendered  — server-rendered HTML, plain requests works.
    #   browser   — client-rendered; needs Playwright (crawl_mit2.py BCS is the
    #               in-repo precedent).
    #   cloudflare— bot-protected. Headless is blocked even under pydoll;
    #               only a NON-headless pydoll window got through.
    #   dead      — no per-person profile pages found.

    # -- viable, cheap ----------------------------------------------------
    ("tamu", "public-health", "https://public-health.tamu.edu/_json-data/json-profile-data.json", None),   # JSON, 85 faculty
    ("tamu", "dentistry",     "https://dentistry.tamu.edu/_json-data/json-profile-data.json", None),       # JSON, 106 faculty
    ("mit",  "statistics",    "https://idss.mit.edu/people/", r"/staff/[a-z0-9-]+|/people/[a-z0-9-]+"),    # rendered, ~101
    ("ut",   "medicine",      "https://dellmed.utexas.edu/directory", r"/directory/[a-z0-9-]+"),           # rendered, ~21

    # -- viable, needs a browser -----------------------------------------
    # Both resolve to bio.cns.utexas.edu/directory/<slug>, which the existing
    # _extract_ut_cns_profile parser already handles — only the listing needs JS.
    ("ut", "neuroscience", "https://neuroscience.utexas.edu/directory", r"/directory/[a-z0-9-]+"),         # browser
    ("ut", "biology",      "https://integrativebio.utexas.edu/directory", r"/directory/[a-z0-9-]+"),       # browser

    # -- blocked: Cloudflare, non-headless browser only -------------------
    # Harvard is the biggest coverage gap and the hardest source we have.
    ("harvard", "chemistry",        "https://chemistry.harvard.edu/people/faculty", r"/people/[a-z0-9-]+"),
    ("harvard", "physics-astronomy","https://www.physics.harvard.edu/people/faculty", r"/people/[a-z0-9-]+"),
    ("harvard", "mathematics",      "https://www.math.harvard.edu/people/", r"/people/[a-z0-9-]+"),
    ("harvard", "medicine",         "https://hms.harvard.edu/departments/genetics/people", r"/people/[a-z0-9-]+"),
    ("harvard", "biology",          "https://www.mcb.harvard.edu/faculty/faculty-profiles/", r"/people/[a-z0-9-]+"),

    # -- dead ends: no per-person pages found -----------------------------
    ("tamu", "medicine",   "https://medicine.tamu.edu/_json-data/json-profile-data.json", None),  # placeholder data only
    ("tamu", "nursing",    "https://nursing.tamu.edu/faculty-staff/index.html", r"/faculty-staff/[a-z0-9._-]+\.html"),
    ("tamu", "pharmacy",   "https://pharmacy.tamu.edu/directory/index.html", r"/directory/[a-z0-9-]+\.html"),
    ("tamu", "veterinary", "https://vetmed.tamu.edu/directory/", r"/directory/[a-z0-9-]+"),        # 403 to requests
]


def probe_one(c):
    school, dept, url, pattern = c
    import urllib.request, urllib.error
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read().decode("utf-8", "ignore")
            status = r.status
    except urllib.error.HTTPError as e:
        return (school, dept, url, e.code, 0, 0, "HTTP error")
    except Exception as e:
        return (school, dept, url, 0, 0, 0, type(e).__name__)

    size = len(body)

    # JSON rosters: count entries directly.
    if url.endswith(".json"):
        try:
            data = json.loads(body)
            people = data if isinstance(data, list) else list(data.values())
            fac = [p for p in people
                   if isinstance(p, dict) and "Faculty" in (p.get("group") or [])]
            note = f"JSON roster, {len(people)} listed"
            return (school, dept, url, status, size, len(fac), note)
        except Exception:
            return (school, dept, url, status, size, 0, "not valid JSON")

    n = len(set(re.findall(pattern, body))) if pattern else 0
    # A big page with almost no profile links means the roster is client-rendered.
    note = "server-rendered" if n >= 8 else (
        "JS-rendered? needs browser" if size > 30000 else "few links")
    return (school, dept, url, status, size, n, note)


def probe(only=None):
    cands = [c for c in CANDIDATES if not only or c[0] == only]
    print(f"\nprobing {len(cands)} candidate sources "
          f"({'all schools' if not only else only})...\n")
    print(f"{'school':<9}{'dept':<18}{'stat':>5}{'KB':>7}{'found':>7}  note")
    print("-" * 78)
    with ThreadPoolExecutor(max_workers=6) as ex:
        results = list(ex.map(probe_one, cands))
    for school, dept, url, status, size, n, note in results:
        flag = "  " if status == 200 and n else "!!"
        print(f"{flag}{school:<7}{dept:<18}{status:>5}{size // 1024:>7}{n:>7}  {note}")
        if status != 200 or not n:
            print(f"{'':<9}{url}")
    print("\n'found' = distinct profile links (or faculty entries for JSON rosters).")
    print("It is an estimate of roster size, not a guarantee of usable records.\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--audit", action="store_true",
                    help="coverage + card-quality tables for existing data")
    ap.add_argument("--probe", action="store_true",
                    help="reach out to candidate sources and estimate yield")
    ap.add_argument("--only", help="limit --probe to one school code")
    ap.add_argument("--file", default=str(UI_JSON),
                    help="dataset to audit (default: ui/public/faculty.json)")
    args = ap.parse_args()

    if not args.audit and not args.probe:
        ap.error("pass --audit and/or --probe")
    if args.audit:
        audit(args.file)
    if args.probe:
        probe(args.only)


if __name__ == "__main__":
    main()
