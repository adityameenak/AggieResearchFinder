#!/usr/bin/env python3
"""
MIT EECS faculty crawler.

Collects all faculty from https://www.eecs.mit.edu/people/ via FacetWP AJAX
(Strategy 1) or by paginating role-filter archive pages (Strategy 2 fallback),
then visits each profile at https://www.eecs.mit.edu/people/<slug>/.

EECS spans Computer Science, Electrical Engineering, and AI/D. Emeriti are
excluded. The 'department' field is derived from the profile's Research Areas.

Usage:
  python crawl_mit.py                       # all EECS faculty (~200)
  python crawl_mit.py --limit 20            # quick smoke test
  python crawl_mit.py --output faculty-mit
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

BASE = "https://www.eecs.mit.edu"

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.eecs.mit.edu/",
}

# Role archive pages for faculty (excludes emeriti, staff, lecturers)
ROLE_PAGES = [
    "/role/faculty/",
    "/role/faculty-cs/",
    "/role/faculty-ee/",
    "/role/faculty-aid/",
]

# Research area → department slug mapping
# CS-leaning areas → cse; EE-leaning → electrical; overlapping → cse default
_EE_KEYWORDS = {
    "circuits", "photonics", "electromagnetics", "power", "quantum hardware",
    "communications", "signal processing", "analog", "rf ", "wireless hardware",
    "nano", "device", "energy conversion", "control",
}

def _area_to_dept(areas: list[str]) -> str:
    text = " ".join(areas).lower()
    ee_hits = sum(1 for kw in _EE_KEYWORDS if kw in text)
    return "electrical" if ee_hits >= 2 else "cse"


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


# ---------------------------------------------------------------------------
# Directory collection
# ---------------------------------------------------------------------------

def _collect_via_facetwp(s: requests.Session) -> list[str]:
    """Try FacetWP AJAX endpoint to get all faculty slugs in one shot."""
    try:
        r = s.get(f"{BASE}/people/", timeout=30)
        if r.status_code != 200:
            return []
        # Extract nonce from inline JS
        nonce_m = re.search(r'"nonce"\s*:\s*"([a-f0-9]+)"', r.text)
        nonce = nonce_m.group(1) if nonce_m else ""
        if not nonce:
            return []

        payload = {
            "action": "facetwp_refresh",
            "data": json.dumps({
                "facets": {},
                "template": "people_listing",
                "query_args": {},
                "pager": {"per_page": 500, "page": 1},
                "first_load": 1,
                "extras": {"sort": "default"},
                "soft_refresh": 0,
                "is_bfcache": 0,
                "url": f"{BASE}/people/",
            }),
            "nonce": nonce,
        }
        ar = s.post(f"{BASE}/wp-admin/admin-ajax.php",
                    data=payload, timeout=30,
                    headers={"X-Requested-With": "XMLHttpRequest"})
        if ar.status_code != 200:
            return []
        j = ar.json()
        html = j.get("template", "")
        return _parse_people_links(html)
    except Exception as exc:
        print(f"  [facetwp] {exc}")
        return []


def _parse_people_links(html: str) -> list[str]:
    """Extract unique /people/<slug>/ hrefs from HTML."""
    seen: set[str] = set()
    out: list[str] = []
    for m in re.finditer(r'href="(https?://www\.eecs\.mit\.edu/people/([a-z0-9\-]+)/?)"', html):
        url = m.group(1).rstrip("/") + "/"
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def _collect_via_role_pages(s: requests.Session) -> list[str]:
    """Walk role archive pages, paginating until no new links."""
    seen: set[str] = set()
    out: list[str] = []
    for role in ROLE_PAGES:
        page = 1
        while page <= 20:
            url = BASE + role if page == 1 else f"{BASE}{role}page/{page}/"
            try:
                r = s.get(url, timeout=30)
            except Exception as exc:
                print(f"  [{role} p{page}] error: {exc}")
                break
            if r.status_code != 200:
                break
            links = _parse_people_links(r.text)
            new = [l for l in links if l not in seen]
            for l in new:
                seen.add(l)
                out.append(l)
            print(f"  [{role} p{page}] +{len(new)} new (total {len(out)})")
            if not new:
                break
            page += 1
            time.sleep(0.4)
    return out


def collect_profile_urls(s: requests.Session) -> list[str]:
    print("Trying FacetWP AJAX…")
    urls = _collect_via_facetwp(s)
    if urls:
        print(f"  FacetWP: {len(urls)} URLs")
        return urls
    print("FacetWP failed — falling back to role archive pages…")
    return _collect_via_role_pages(s)


# ---------------------------------------------------------------------------
# Profile parsing
# ---------------------------------------------------------------------------

def parse_profile(html: str, url: str) -> Optional[dict]:
    soup = BeautifulSoup(html, "html.parser")

    # Name
    h1 = soup.find("h1", class_="page-title") or soup.find("h1")
    name = h1.get_text(" ", strip=True) if h1 else ""
    if not name:
        return None

    # Photo — og:image gives full-resolution; wp-post-image is 230px crop
    photo_url = ""
    og_img = soup.find("meta", property="og:image")
    if og_img and og_img.get("content"):
        photo_url = og_img["content"].strip()
    if not photo_url:
        img = soup.find("img", class_="wp-post-image")
        if img and img.get("src"):
            photo_url = img["src"]

    # Title/role — first <p> in the .bold-links cell
    title = ""
    bold_cell = soup.find(class_=re.compile(r"\bbold-links\b"))
    if bold_cell:
        p = bold_cell.find("p")
        if p:
            title = p.get_text(" ", strip=True)

    # Skip emeriti
    if "emeritus" in title.lower() or "emerita" in title.lower():
        return None

    # Email
    email = ""
    a = soup.find("a", href=re.compile(r"^mailto:"))
    if a:
        email = a["href"].replace("mailto:", "").split("?")[0].strip()

    # Lab website — .personal-website <a class="web">
    lab_website = ""
    pw = soup.find(class_="personal-website")
    if pw:
        wa = pw.find("a", class_="web")
        if wa and wa.get("href"):
            lab_website = wa["href"].strip()

    # Google Scholar
    google_scholar = ""
    for a2 in soup.find_all("a", href=True):
        if "scholar.google" in a2["href"]:
            google_scholar = a2["href"].strip()
            break

    # Research areas
    areas: list[str] = []
    ra_div = soup.find(class_="research-areas")
    if ra_div:
        for li in ra_div.find_all("li"):
            t = li.get_text(" ", strip=True)
            if t:
                areas.append(t)

    # Research summary — concatenate first two news snippets as a proxy
    snippets: list[str] = []
    for entry in soup.find_all(class_="related-news-entry"):
        p = entry.find("p")
        if p:
            t = p.get_text(" ", strip=True)
            if t:
                snippets.append(t)
        if len(snippets) >= 2:
            break
    research_summary = " ".join(snippets)[:1000]

    # If no news summary, use research areas as fallback
    if not research_summary and areas:
        research_summary = "Research areas: " + ", ".join(areas)

    department = _area_to_dept(areas)

    slug = url.rstrip("/").rsplit("/", 1)[-1]
    return {
        "id":               hashlib.md5(url.encode()).hexdigest()[:12],
        "university":       "mit",
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
    urls = collect_profile_urls(s)
    if not urls:
        print("No profile URLs collected — aborting.")
        sys.exit(1)
    print(f"\nCollected {len(urls)} profile URLs. Fetching profiles…\n")

    records: list[dict] = []
    for i, url in enumerate(urls, 1):
        try:
            r = s.get(url, timeout=30)
        except Exception as exc:
            print(f"  [{i}] {url} — error: {exc}")
            continue
        if r.status_code != 200:
            print(f"  [{i}] {url} — HTTP {r.status_code}")
            continue
        rec = parse_profile(r.text, url)
        if rec:
            records.append(rec)
            print(f"  [{i}/{len(urls)}] + {rec['name']} ({rec['department']}) -- {len(records)} kept")
        else:
            name_m = re.search(r"<h1[^>]*>(.*?)</h1>", r.text, re.S)
            name_hint = BeautifulSoup(name_m.group(1), "html.parser").get_text() if name_m else "?"
            print(f"  [{i}/{len(urls)}] skip: {name_hint} (emeritus or no name)")
        time.sleep(0.35)
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
    ap.add_argument("--output", default="faculty-mit")
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
