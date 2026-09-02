#!/usr/bin/env python3
"""
UT Dallas faculty crawler — central HTML directory at profiles.utdallas.edu.

UTD publishes one university-wide profile system: a paginated directory at
profiles.utdallas.edu/browse?page=N (no JSON:API), with each person at
profiles.utdallas.edu/<slug>. Plain `requests` works (no Playwright); the
profile markup is consistent (`.profile-titles` = "Title - Department",
`.profile_summary` = research blurb, og:image = portrait).

Like Rice/CNS, the directory lists everyone across every school, so we keep
only STEM departments (STEM_RULES) parsed from each profile's title line.

Usage:
  python crawl_utd.py                       # all STEM faculty
  python crawl_utd.py --limit 40            # quick smoke test
  python crawl_utd.py --all                 # keep every department
  python crawl_utd.py --output faculty-utd
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

BASE = "https://profiles.utdallas.edu"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

# STEM department whitelist. Keys are substrings matched against the normalized
# department name (from the "<Title> - <Department>" line). Order: specific
# before general. Slugs mirror the TAMU/Rice/UT schema so the UI's deptLabel
# reuses (geosciences + systems-engineering are added to DEPT_DISPLAY).
STEM_RULES = [
    ("computer science", "cse"),
    ("computer engineering", "electrical"),
    ("electrical engineering", "electrical"),
    ("mechanical engineering", "mechanical"),
    ("biomedical engineering", "bioengineering"),
    ("bioengineering", "bioengineering"),
    ("materials science", "materials"),
    ("material science", "materials"),      # UTD writes it singular
    ("nanotech", "materials"),
    ("systems engineering", "systems-engineering"),
    ("industrial engineering", "industrial"),
    ("mathematical sciences", "mathematics"),
    ("mathematics", "mathematics"),
    ("physics", "physics-astronomy"),
    ("biochemistry", "chemistry"),
    ("chemistry", "chemistry"),
    ("molecular biology", "biology"),
    ("biological sciences", "biology"),
    ("biology", "biology"),
    ("geoscience", "geosciences"),
    ("data science", "statistics"),
    ("statistics", "statistics"),
    ("cognition and neuroscience", "psychological-brain-sciences"),
    ("neuroscience", "psychological-brain-sciences"),
    ("cognitive", "psychological-brain-sciences"),
    ("psychological sciences", "psychological-brain-sciences"),
    ("psychology", "psychological-brain-sciences"),
    # Health sciences — speech/language/hearing is an audiology and speech
    # pathology research department, not a service unit.
    ("speech, language", "speech-hearing"),
    ("speech and hearing", "speech-hearing"),
    ("communication disorders", "speech-hearing"),
    ("audiology", "speech-hearing"),
    ("public health", "public-health"),
    ("epidemiology", "public-health"),
    # Space Sciences is UTD's astronomy/planetary group.
    ("space sciences", "physics-astronomy"),
    ("earth systems science", "earth-atmospheric"),
    ("sustain earth", "earth-atmospheric"),
]

_EXT_SKIP = ("utdallas.edu", "scholar.google", "facebook.com", "twitter.com",
             "x.com", "linkedin.com", "youtube.com", "instagram.com",
             "researchgate.net", "orcid.org", "doi.org", "wikipedia.org")

_OFFICE_RE = re.compile(r"\b[A-Z]{2,4}\s?\d+\.\d+[A-Z]?\b")
_PHONE_RE = re.compile(r"\(?\+?1?\)?[\s.\-]?\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}")
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")


def stem_slug(dept_name: str) -> Optional[str]:
    key = re.sub(r"\s+", " ", (dept_name or "").lower()).strip()
    key = re.sub(r"^department of |^dept\.? of |^school of ", "", key)
    for needle, slug in STEM_RULES:
        if needle in key:
            return slug
    return None


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def collect_profile_slugs(s: requests.Session, limit: int = 0) -> list[str]:
    """Walk browse?page=N until a page yields no new profile links."""
    slugs: list[str] = []
    seen: set[str] = set()
    page = 1
    while page <= 80:
        try:
            r = s.get(f"{BASE}/browse?page={page}", timeout=30)
        except Exception as exc:
            print(f"  [browse {page}] error: {exc}")
            break
        if r.status_code != 200:
            break
        soup = BeautifulSoup(r.text, "html.parser")
        new = 0
        for a in soup.find_all("a", href=True):
            href = a["href"].split("?")[0].split("#")[0].rstrip("/")
            m = re.match(r"^(?:https?://profiles\.utdallas\.edu)?/([a-z][a-z0-9.\-]+)$",
                         href, re.I)
            if not m:
                continue
            slug = m.group(1).lower()
            if slug in ("browse", "login", "schools", "students", "search",
                        "about", "faq", "contact", "home"):
                continue
            if slug not in seen:
                seen.add(slug)
                slugs.append(slug)
                new += 1
        print(f"  [browse {page}] +{new} (total {len(slugs)})")
        if new == 0 and page > 1:
            break
        if limit and len(slugs) >= limit * 3:  # over-collect; many get filtered
            break
        page += 1
        time.sleep(0.3)
    return slugs


def parse_profile(html: str, url: str, stem_only: bool) -> Optional[dict]:
    soup = BeautifulSoup(html, "html.parser")

    h1 = soup.find("h1")
    name = h1.get_text(" ", strip=True) if h1 else ""
    if not name:
        return None

    # Title - Department line
    tblock = soup.find(class_=lambda c: c and "profile-titles" in c)
    title_dept = tblock.get_text(" ", strip=True) if tblock else ""
    if not title_dept and h1:
        nxt = h1.find_next(lambda t: t.name in ("div", "p", "span")
                           and t.get_text(strip=True))
        title_dept = nxt.get_text(" ", strip=True) if nxt else ""
    # split on the first " - "
    if " - " in title_dept:
        title, dept_raw = title_dept.split(" - ", 1)
    else:
        title, dept_raw = title_dept, ""
    title = title.strip()
    dept_raw = dept_raw.strip()

    slug = stem_slug(dept_raw)
    if stem_only and slug is None:
        return None
    department = slug or re.sub(r"[^a-z0-9]+", "-",
                                dept_raw.lower()).strip("-") or "unknown"

    # Email
    email = ""
    a = soup.find("a", href=lambda h: h and h.startswith("mailto:"))
    if a:
        email = a["href"].replace("mailto:", "").split("?")[0].strip()

    # Contact block text → phone + office
    contact_txt = ""
    for sib in (h1.find_all_next() if h1 else []):
        t = sib.get_text(" ", strip=True)
        if t and ("@" in t or re.search(r"\d{3}[\s.\-]\d{4}", t)):
            contact_txt = t
            break
    pm = _PHONE_RE.search(contact_txt)
    phone = pm.group(0).strip() if pm else ""
    om = _OFFICE_RE.search(contact_txt)
    office = om.group(0).strip() if om else ""

    # Photo
    photo_url = ""
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        photo_url = og["content"].strip()

    # Research: .profile_summary + a "Research Areas/Interests" section
    parts = []
    summ = soup.find(class_=lambda c: c and "profile_summary" in c)
    if summ:
        parts.append(re.sub(r"^\s*Research Interests:\s*", "",
                            summ.get_text(" ", strip=True)))
    for h in soup.find_all(["h2", "h3", "h4"]):
        if h.get_text(" ", strip=True) in ("Research Areas", "Research Interests"):
            seg = []
            for sib in h.find_all_next():
                if sib.name in ("h1", "h2", "h3", "h4"):
                    break
                t = sib.get_text(" ", strip=True)
                if t:
                    seg.append(t)
                if sum(len(x) for x in seg) > 600:
                    break
            if seg:
                parts.append(" ".join(seg))
            break
    research_summary = " | ".join(p for p in parts if p)[:1500]

    # External links
    google_scholar = ""
    lab_website = ""
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.startswith("http"):
            continue
        if "scholar.google" in href and not google_scholar:
            google_scholar = href
        elif not lab_website and not any(x in href for x in _EXT_SKIP):
            lab_website = href

    return {
        "id":               hashlib.md5(url.encode()).hexdigest()[:12],
        "university":       "utd",
        "name":             name,
        "title":            title,
        "department":       department,
        "email":            email,
        "profile_url":      url,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "ai_review":        "",
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           office,
        "scholar_interests": [],
        "publications":      [],
    }


def crawl(limit: int = 0, stem_only: bool = True) -> list[dict]:
    s = session()
    print("Collecting profile slugs from browse…")
    slugs = collect_profile_slugs(s, limit=limit)
    print(f"Collected {len(slugs)} candidate profiles. Fetching…")
    records: list[dict] = []
    for i, slug in enumerate(slugs, 1):
        url = f"{BASE}/{slug}"
        try:
            r = s.get(url, timeout=30)
        except Exception as exc:
            print(f"  [{i}] {slug} error: {exc}")
            continue
        if r.status_code != 200:
            continue
        rec = parse_profile(r.text, url, stem_only)
        if rec:
            records.append(rec)
            print(f"  [{i}/{len(slugs)}] {rec['name']} ({rec['department']}) "
                  f"— kept {len(records)}")
        time.sleep(0.25)
        if limit and len(records) >= limit:
            break
    return records


def write_outputs(records: list[dict], stem: str) -> None:
    Path(f"{stem}.json").write_text(json.dumps(records, indent=2, ensure_ascii=False),
                                    encoding="utf-8")
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
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--output", default="faculty-utd")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--all", action="store_true",
                    help="Keep every department (disable STEM filter).")
    args = ap.parse_args()
    records = crawl(limit=args.limit, stem_only=not args.all)
    if not records:
        print("No records collected.")
        sys.exit(1)
    write_outputs(records, args.output)


if __name__ == "__main__":
    main()
