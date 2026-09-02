#!/usr/bin/env python3
"""
Texas A&M health-science schools — the medical coverage the dataset was missing.

Why a separate entry point (like crawl_rice.py): A&M's health schools are not
on the engineering or arts-&-sciences sites that crawl.py's seeds cover. They
run their own CMS, and it publishes a complete roster as JSON at
    https://<school>.tamu.edu/_json-data/json-profile-data.json
which is far cheaper and more reliable than scraping the directory page — that
page renders its cards client-side, so plain requests sees nothing.

The roster gives name, titles, department, photo, profile link and a `group`
field that separates Faculty from Staff. Everything else (email, research
interests) comes from the profile page, which is heading-based: an <h2>
"Research Interests" followed by list items.

Usage:
  python crawl_tamu_health.py                       # all working schools
  python crawl_tamu_health.py --limit 5             # smoke test first
  python crawl_tamu_health.py --school public-health
  python crawl_tamu_health.py --output faculty-tamu-health
"""
import argparse, hashlib, html, json, re, sys, time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

import taxonomy

# Verified working rosters. medicine/nursing/pharmacy/vetmed are deliberately
# absent: medicine's endpoint holds only placeholder records, nursing and
# pharmacy don't expose one, and vetmed 403s even with browser-like headers.
# See census.py CANDIDATES for the full probe results.
SCHOOLS = {
    "public-health": ("https://public-health.tamu.edu", "public-health"),
    "dentistry":     ("https://dentistry.tamu.edu",     "dentistry"),
}

# The same header block crawl_rice.py uses to get past bot filtering — a
# Chrome-like UA (honest about being us via the suffix) plus the Sec-Fetch
# headers a real navigation sends.
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Upgrade-Insecure-Requests": "1",
}

DELAY = 0.4          # be polite; this is a university's own web server
TIMEOUT = 30

# Department name (from the roster) -> canonical slug. The roster's department
# field is pipe-separated and mixes real departments with research centres.
DEPT_RULES = [
    ("epidemiology",            "public-health"),
    ("biostatistics",           "public-health"),
    ("environmental",           "public-health"),
    ("occupational",            "public-health"),
    ("health policy",           "public-health"),
    ("health behavior",         "public-health"),
    ("health promotion",        "public-health"),
    ("public health",           "public-health"),
    ("oral",                    "dentistry"),
    ("dental",                  "dentistry"),
    ("periodontics",            "dentistry"),
    ("endodontics",             "dentistry"),
    ("orthodontics",            "dentistry"),
    ("prosthodontics",          "dentistry"),
    ("restorative",             "dentistry"),
    ("diagnostic sciences",     "dentistry"),
    ("biomedical sciences",     "dentistry"),
]

_TITLE_NOISE = re.compile(r"\b(interim|acting)\b", re.I)


def clean(text):
    return " ".join(html.unescape(text or "").split())


def dept_slug(raw, fallback):
    """Map a roster department string onto the canonical vocabulary."""
    d = clean(raw).lower()
    for needle, slug in DEPT_RULES:
        if needle in d:
            return slug
    return fallback


def fetch(session, url):
    r = session.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r


def section_text(soup, pattern):
    """Text under a heading matching `pattern`, up to the next heading.

    Walks the document in order rather than reading direct siblings only —
    the sibling-only assumption is what silently cost the TAMU arts-&-sciences
    parser 256 research summaries.
    """
    for hd in soup.find_all(["h2", "h3", "h4"]):
        if not re.search(pattern, hd.get_text(" ", strip=True), re.I):
            continue
        out = []
        for el in hd.find_all_next():
            if el.name in ("h1", "h2", "h3", "h4"):
                break
            if el.name in ("p", "li"):
                t = clean(el.get_text(" ", strip=True))
                if t and t not in out:
                    out.append(t)
        if out:
            return " | ".join(out)
    return ""


def parse_profile(session, url):
    """Pull email, research interests and any lab/Scholar links off a profile."""
    try:
        r = fetch(session, url)
    except Exception as exc:
        return {"error": str(exc)}
    soup = BeautifulSoup(r.text, "html.parser")

    emails = re.findall(r"[\w.+-]+@[\w.-]*tamu\.edu", r.text)
    research = section_text(soup, r"research interest|research area|research focus")

    lab, scholar = "", ""
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "scholar.google" in href and not scholar:
            scholar = href
        elif re.search(r"\blab\b|laboratory|research(group|-group)", href, re.I) and not lab:
            if href.startswith("http") and "tamu.edu" not in href.split("/")[2]:
                lab = href

    return {
        "email": emails[0] if emails else "",
        "research_summary": research,
        "lab_website": lab,
        "google_scholar": scholar,
    }


def crawl_school(session, key, limit=None):
    base, fallback_slug = SCHOOLS[key]
    roster_url = f"{base}/_json-data/json-profile-data.json"
    print(f"\n{key}: {roster_url}")
    try:
        data = fetch(session, roster_url).json()
    except Exception as exc:
        print(f"  ! roster unavailable ({exc}) — skipped")
        return []

    people = data if isinstance(data, list) else list(data.values())
    faculty = [p for p in people
               if isinstance(p, dict) and "Faculty" in (p.get("group") or [])]
    print(f"  {len(people)} listed, {len(faculty)} faculty")
    if limit:
        faculty = faculty[:limit]

    records = []
    for i, p in enumerate(faculty, 1):
        link = p.get("link") or ""
        url = link if link.startswith("http") else base + link
        titles = [clean(t) for t in (p.get("titles") or []) if clean(t)]
        depts = [d for d in clean(p.get("department")).split("|") if d]

        rec = {
            "id": hashlib.md5(url.encode()).hexdigest()[:12],
            "university": "tamu",
            "name": clean(p.get("name")),
            "title": _TITLE_NOISE.sub("", titles[0]).strip() if titles else "",
            "department": dept_slug(depts[0] if depts else "", fallback_slug),
            "email": "",
            "profile_url": url,
            "research_summary": "",
            "lab_website": "",
            "google_scholar": "",
            "ai_review": "",
            "photo_url": clean(p.get("imagesrc")),
            "phone": "",
            "office": "",
            "scholar_interests": [],
            "publications": [],
        }
        detail = parse_profile(session, url)
        if "error" in detail:
            print(f"  [{i}/{len(faculty)}] {rec['name']}: {detail['error']}")
        else:
            rec.update(detail)
        records.append(rec)
        if i % 25 == 0:
            print(f"  [{i}/{len(faculty)}] …")
        time.sleep(DELAY)
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--school", choices=sorted(SCHOOLS),
                    help="crawl one school (default: all)")
    ap.add_argument("--limit", type=int, help="cap profiles per school (smoke test)")
    ap.add_argument("--output", default="faculty-tamu-health",
                    help="output stem (default: faculty-tamu-health)")
    args = ap.parse_args()

    keys = [args.school] if args.school else list(SCHOOLS)
    session = requests.Session()
    records = []
    for key in keys:
        records.extend(crawl_school(session, key, args.limit))

    if not records:
        sys.exit("No records collected.")

    out = Path(f"{args.output}.json")
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2))

    def pct(fn):
        return 100.0 * sum(1 for r in records if fn(r)) / len(records)

    print(f"\nWrote {out} — {len(records)} records")
    print(f"  photo    {pct(lambda r: bool(r['photo_url'])):.0f}%")
    print(f"  email    {pct(lambda r: bool(r['email'])):.0f}%")
    print(f"  research {pct(lambda r: len(r['research_summary']) >= 40):.0f}%")
    print("\nNext: python enrich_ollama.py --file %s && python merge.py" % out.name)


if __name__ == "__main__":
    main()
