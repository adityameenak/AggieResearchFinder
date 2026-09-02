#!/usr/bin/env python3
"""
UT Austin College of Education — Kinesiology & Health Education, and
Educational Psychology.

Why a separate entry point rather than a seed for crawl.py: education.utexas.edu
is a WordPress theme none of the UT parsers in crawl.py handle, and its profile
URLs are /faculty/<slug> with UNDERSCORES — a shape _UT_PROFILE_RE doesn't
match. Extending that shared regex risks the 939 UT records the existing
parsers already produce, so this follows the crawl_rice.py / crawl_tamu_health.py
pattern of a self-contained crawler instead.

The faculty listing is college-wide (210 people across four departments), so we
filter to STEM departments by the "Department of ..." line on each profile —
the same curate-don't-dump approach Rice and UTD use.

Everything is server-rendered, so plain requests is enough.

Usage:
  python crawl_ut_education.py --limit 5      # smoke test first
  python crawl_ut_education.py
"""
import argparse, hashlib, html, json, re, sys, time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://education.utexas.edu"
LISTING = f"{BASE}/departments/kinesiology-health-education/faculty"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Upgrade-Insecure-Requests": "1",
}

DELAY = 0.4
TIMEOUT = 30

# Which College of Education departments count as STEM.
#
# Kinesiology & Health Education is a health science and the reason for this
# crawler. Educational Psychology is a judgement call: it is a research
# psychology department (quantitative methods, human development, school and
# counselling psychology), and UT currently has no psychology coverage at all,
# so including it closes a real gap. If that reads as a stretch, delete the row
# — nothing else depends on it.
#
# Educational Leadership & Policy and Curriculum & Instruction are education
# research, not STEM, and are deliberately excluded.
DEPT_RULES = [
    ("kinesiology",            "kinesiology"),
    ("health education",       "kinesiology"),
    ("educational psychology", "psychological-brain-sciences"),
]

# Titles that mark someone as research/teaching faculty. The listing includes
# staff and administrators.
FACULTY_TITLE_RE = re.compile(
    r"professor|lecturer|instructor|research scientist|\bchair\b|\bdean\b", re.I)
EMERITUS_RE = re.compile(r"emerit", re.I)

_DEPT_RE = re.compile(r"Department of ([A-Z][A-Za-z,&\s]{3,60})")


def clean(t):
    return " ".join(html.unescape(t or "").split())


def dept_slug(text):
    t = clean(text).lower()
    for needle, slug in DEPT_RULES:
        if needle in t:
            return slug
    return None


def fetch(session, url):
    r = session.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r


def collect_links(session):
    """Every /faculty/<slug> on the college faculty listing."""
    html_text = fetch(session, LISTING).text
    slugs = sorted(set(re.findall(r'href="(/faculty/[a-z0-9._-]+)"', html_text)))
    return [BASE + s for s in slugs]


def parse_profile(session, url):
    try:
        r = fetch(session, url)
    except Exception as exc:
        return {"error": str(exc)}
    soup = BeautifulSoup(r.text, "html.parser")

    h1 = soup.find("h1")
    if not h1:
        return {"error": "no h1"}
    name = clean(h1.get_text(" ", strip=True))

    # The block around the h1 carries the title lines, phone, email and office.
    header = h1.find_parent(["div", "section"])
    header_text = clean(header.get_text(" | ", strip=True)) if header else ""

    # Title lines sit between the name and the "Phone:"/"Email:" labels.
    parts = [p.strip() for p in header_text.split("|")]
    titles = []
    for p in parts[1:]:
        if re.match(r"^(Phone|Email|Office|View|Google)\b", p, re.I) or "@" in p:
            break
        if p:
            titles.append(p)
    title = "; ".join(titles)

    dept = dept_slug(header_text)

    emails = re.findall(r"[\w.+-]+@[\w.-]*utexas\.edu", r.text)
    phone = ""
    m = re.search(r"Phone:\s*\|?\s*([\d+()\-\s.]{7,})", header_text)
    if m:
        phone = clean(m.group(1))
    office = ""
    m = re.search(r"Office:\s*\|?\s*([^|]+)", header_text)
    if m:
        office = clean(m.group(1))

    # Research prose lives in the tab panels (.coe-profile-tabs). Biography and
    # Expertise are the two that describe research; the rest are degrees,
    # publications, grants and courses.
    research = []
    tabs = soup.select(".coe-profile-tabs section, .tabs-content section")
    for sec in tabs[:3]:
        t = clean(sec.get_text(" ", strip=True))
        if len(t) >= 40 and t not in research:
            research.append(t)
    research_summary = " | ".join(research)[:1500]

    photo, scholar, lab = "", "", ""
    for img in soup.find_all("img", src=True):
        if re.search(r"/photos/|headshot|faculty", img["src"], re.I):
            photo = img["src"]
            break
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "scholar.google" in href and not scholar:
            scholar = href
        elif (href.startswith("http") and "utexas.edu" not in href
              and re.search(r"\blab\b|laboratory|research", href, re.I) and not lab):
            lab = href

    return {
        "name": name, "title": title, "department": dept,
        "email": emails[0] if emails else "", "phone": phone, "office": office,
        "research_summary": research_summary, "photo_url": photo,
        "google_scholar": scholar, "lab_website": lab,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="cap profiles fetched (smoke test)")
    ap.add_argument("--output", default="faculty-ut-education", help="output stem")
    ap.add_argument("--all", action="store_true",
                    help="keep every department, not just the STEM ones")
    args = ap.parse_args()

    session = requests.Session()
    links = collect_links(session)
    print(f"{len(links)} profiles listed on the college faculty page")
    if args.limit:
        links = links[:args.limit]

    records, skipped = [], {"dept": 0, "title": 0, "error": 0}
    for i, url in enumerate(links, 1):
        d = parse_profile(session, url)
        time.sleep(DELAY)
        if "error" in d:
            skipped["error"] += 1
            print(f"  [{i}/{len(links)}] {url.rsplit('/', 1)[-1]}: {d['error']}")
            continue
        if not args.all and not d["department"]:
            skipped["dept"] += 1
            continue
        if not FACULTY_TITLE_RE.search(d["title"]) or EMERITUS_RE.search(d["title"]):
            skipped["title"] += 1
            continue

        records.append({
            "id": hashlib.md5(url.encode()).hexdigest()[:12],
            "university": "ut",
            "profile_url": url,
            "ai_review": "",
            "scholar_interests": [],
            "publications": [],
            **d,
            "department": d["department"] or "kinesiology",
        })
        if i % 25 == 0:
            print(f"  [{i}/{len(links)}] kept {len(records)}")

    if not records:
        sys.exit("No records collected.")

    out = Path(f"{args.output}.json")
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2))

    def pct(fn):
        return 100.0 * sum(1 for r in records if fn(r)) / len(records)

    import collections
    print(f"\nWrote {out} — {len(records)} records "
          f"(skipped {skipped['dept']} non-STEM dept, "
          f"{skipped['title']} non-faculty, {skipped['error']} errors)")
    print(" ", dict(collections.Counter(r["department"] for r in records)))
    print(f"  photo    {pct(lambda r: bool(r['photo_url'])):.0f}%")
    print(f"  email    {pct(lambda r: bool(r['email'])):.0f}%")
    print(f"  research {pct(lambda r: len(r['research_summary']) >= 40):.0f}%")


if __name__ == "__main__":
    main()
