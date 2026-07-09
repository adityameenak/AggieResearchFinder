#!/usr/bin/env python3
"""
Harvard SEAS faculty crawler.

Paginates through https://seas.harvard.edu/faculty?page=%2C{n} to collect
all /person/<slug> profile links, then visits each profile.

Harvard SEAS is explicitly interdisciplinary (no departments), so 'department'
is derived from the "Primary Teaching Area" field on each profile.

Usage:
  python crawl_harvard.py                       # all SEAS faculty (~170)
  python crawl_harvard.py --limit 20            # quick smoke test
  python crawl_harvard.py --output faculty-harvard
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

BASE = "https://seas.harvard.edu"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://seas.harvard.edu/",
}

# Primary Teaching Area → department slug (longer match before shorter)
SEAS_DEPT_MAP = [
    ("computational science",  "cse"),
    ("computer science",       "cse"),
    ("electrical engineering", "electrical"),
    ("applied physics",        "applied-physics"),
    ("materials science",      "materials"),
    ("mechanical engineering", "mechanical"),
    ("materials and mechanical", "mechanical"),
    ("applied mathematics",    "mathematics"),
    ("mathematics",            "mathematics"),
    ("bioengineering",         "bioengineering"),
    ("environmental",          "environmental"),
    ("earth and planetary",    "geosciences"),
    ("statistics",             "statistics"),
    ("data",                   "statistics"),
    ("physics",                "applied-physics"),
    ("chemistry",              "chemistry"),
    ("biology",                "biology"),
]

# Skip non-STEM teaching areas
_NON_STEM = {"economics", "government", "history", "sociology", "law",
             "education", "arts", "humanities", "public policy", "business"}


def _seas_dept(teaching_area: str) -> Optional[str]:
    ta = teaching_area.lower().strip()
    if any(kw in ta for kw in _NON_STEM):
        return None
    for needle, slug in SEAS_DEPT_MAP:
        if needle in ta:
            return slug
    # If no match but looks technical, default to interdisciplinary
    if ta:
        return "cse"
    return None


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


# ---------------------------------------------------------------------------
# Directory collection
# ---------------------------------------------------------------------------

def collect_profile_urls(s: requests.Session) -> list[str]:
    """Paginate through /faculty?page=%2C{n} collecting /person/ links."""
    seen: set[str] = set()
    out: list[str] = []
    page = 0
    while page <= 15:
        url = f"{BASE}/faculty" + (f"?page=%2C{page}" if page > 0 else "")
        try:
            r = s.get(url, timeout=30)
        except Exception as exc:
            print(f"  [page {page}] error: {exc}")
            break
        if r.status_code != 200:
            print(f"  [page {page}] HTTP {r.status_code} — stopping")
            break
        soup = BeautifulSoup(r.text, "html.parser")
        new = 0
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if re.search(r"/person/[a-z]", href):
                full = href if href.startswith("http") else BASE + href
                full = full.rstrip("/")
                if full not in seen:
                    seen.add(full)
                    out.append(full)
                    new += 1
        print(f"  [page {page}] +{new} new (total {len(out)})")
        if new == 0 and page > 0:
            break
        page += 1
        time.sleep(0.5)
    return out


# ---------------------------------------------------------------------------
# Profile parsing
# ---------------------------------------------------------------------------

_SKIP_EMAIL_DOMAINS = ("seas.harvard.edu", "fas.harvard.edu", "harvard.edu")
_EXT_LINK_SKIP = ("scholar.google", "twitter.com", "x.com", "facebook.com",
                  "linkedin.com", "researchgate.net", "orcid.org", "doi.org",
                  "harvard.edu", "youtube.com", "instagram.com")


def parse_profile(html: str, url: str) -> Optional[dict]:
    soup = BeautifulSoup(html, "html.parser")

    # Name
    h1 = soup.find("h1")
    name = h1.get_text(" ", strip=True) if h1 else ""
    if not name or len(name) > 80:
        return None

    # Photo — headshot is lazy-loaded via data-src; src is an SVG placeholder
    photo_url = ""
    for img in soup.find_all("img"):
        src = img.get("data-src", "") or img.get("src", "")
        if "/images/Directory/" in src:
            photo_url = src if src.startswith("http") else f"https://seas.harvard.edu{src}"
            break

    # Use soup.body to exclude <head> (which has <title>Name | SEAS...</title>)
    body = soup.body or soup
    body_text = body.get_text("\n", strip=True)

    # Title: first element after h1 that looks like an academic title
    title = ""
    if h1:
        for el in h1.find_all_next(["p", "div", "span", "li"]):
            t = el.get_text(" ", strip=True)
            if (t and 8 < len(t) < 250 and len(el.find_all()) < 3
                    and re.search(
                        r"professor|lecturer|director|scientist|engineer|"
                        r"research|faculty|instructor|postdoc|fellow", t, re.I)
                    and not re.search(r"seas\.harvard\.edu|harvard\.edu|@", t)):
                title = t
                break

    # Skip profiles with no academic title at all
    if not title:
        return None

    # Primary Teaching Area → department
    pta_m = re.search(r"PRIMARY TEACHING AREA\s*\n(.+)", body_text, re.I)
    teaching_area = pta_m.group(1).strip() if pta_m else ""
    dept = _seas_dept(teaching_area)
    if dept is None:
        return None  # non-STEM teaching area

    # Email — prefer faculty/non-staff email
    email = ""
    for a in soup.find_all("a", href=re.compile(r"^mailto:")):
        addr = a["href"].replace("mailto:", "").split("?")[0].strip()
        if not any(skip in addr for skip in ("staff", "marina@", "admin@")):
            email = addr
            break
    if not email:
        a = soup.find("a", href=re.compile(r"^mailto:"))
        if a:
            email = a["href"].replace("mailto:", "").split("?")[0].strip()

    # Research areas — text between "RESEARCH AREAS" and "RELATED NEWS"
    areas: list[str] = []
    ra_m = re.search(r"RESEARCH AREAS\s*\n([\s\S]{0,800}?)(?:RELATED NEWS|$)", body_text, re.I)
    if ra_m:
        chunk = ra_m.group(1)
        for line in chunk.splitlines():
            line = line.strip()
            if (line and len(line) >= 4 and len(line) <= 80
                    and not re.match(r"^(science and engineering for|https?://)", line, re.I)
                    and not re.search(r"\d{4}", line)):
                areas.append(line)

    # Research summary — first 2 news snippets
    snippets: list[str] = []
    rn_m = re.search(r"RELATED NEWS\s*\n([\s\S]{0,1500})", body_text, re.I)
    if rn_m:
        chunk = rn_m.group(1)
        # News entries are: DATE\nHEADLINE\n\nBLURB\nTAGS
        # Pick lines that look like blurbs (longer, no uppercase shouting)
        for line in chunk.splitlines():
            line = line.strip()
            if (len(line) > 40 and line[0].isupper()
                    and not re.match(r"^[A-Z]{3}\s+\d", line)
                    and not re.match(r"^[A-Z ,&]+$", line)):
                snippets.append(line)
            if len(snippets) >= 2:
                break
    research_summary = " ".join(snippets)[:1000]
    if not research_summary and areas:
        research_summary = "Research areas: " + ", ".join(areas[:6])

    # Lab website — WEBSITES section
    lab_website = ""
    ws_m = re.search(r"WEBSITES?\s*\n(.+)", body_text, re.I)
    if ws_m:
        raw = ws_m.group(1).strip()
        # May be domain-only (e.g. "aizenberglab.seas.harvard.edu")
        if raw and not raw.startswith("http"):
            raw = "https://" + raw
        if raw:
            lab_website = raw

    # Google Scholar
    google_scholar = ""
    for a in soup.find_all("a", href=True):
        if "scholar.google" in a["href"]:
            google_scholar = a["href"].strip()
            break

    return {
        "id":               hashlib.md5(url.encode()).hexdigest()[:12],
        "university":       "harvard",
        "name":             name,
        "title":            title,
        "department":       dept,
        "email":            email,
        "profile_url":      url,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "ai_review":        "",
        "photo_url":        photo_url,
        "phone":            "",
        "office":           "",
        "scholar_interests": areas,
        "publications":      [],
    }


# ---------------------------------------------------------------------------
# Main crawl loop
# ---------------------------------------------------------------------------

def crawl(limit: int = 0) -> list[dict]:
    s = session()
    print("Collecting profile URLs from /faculty pages…")
    urls = collect_profile_urls(s)
    if not urls:
        print("No profile URLs found — aborting.")
        sys.exit(1)
    print(f"\nCollected {len(urls)} profiles. Fetching…\n")

    records: list[dict] = []
    for i, url in enumerate(urls, 1):
        try:
            r = s.get(url, timeout=30)
        except Exception as exc:
            print(f"  [{i}] {url} — error: {exc}")
            continue
        if r.status_code != 200:
            print(f"  [{i}] HTTP {r.status_code} — {url}")
            continue
        rec = parse_profile(r.text, url)
        if rec:
            records.append(rec)
            print(f"  [{i}/{len(urls)}] + {rec['name']} ({rec['department']}) -- {len(records)} kept")
        else:
            soup = BeautifulSoup(r.text, "html.parser")
            h1 = soup.find("h1")
            print(f"  [{i}/{len(urls)}] skip: {h1.get_text(strip=True) if h1 else url}")
        time.sleep(0.4)
        if limit and len(records) >= limit:
            break
    return records


def write_outputs(records: list[dict], stem: str) -> None:
    Path(f"{stem}.json").write_text(
        json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    fields = ["id", "university", "name", "title", "department", "email",
              "profile_url", "research_summary", "lab_website", "google_scholar",
              "ai_review", "photo_url", "phone", "office", "scholar_interests",
              "publications"]
    with open(f"{stem}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(records)
    print(f"\nWrote {len(records)} records → {stem}.json / {stem}.csv")


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--output", default="faculty-harvard")
    ap.add_argument("--limit", type=int, default=0,
                    help="Stop after N records (smoke test).")
    args = ap.parse_args()
    records = crawl(limit=args.limit)
    if not records:
        print("No records collected.")
        sys.exit(1)
    write_outputs(records, args.output)


if __name__ == "__main__":
    main()
