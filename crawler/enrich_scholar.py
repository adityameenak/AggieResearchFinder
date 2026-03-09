#!/usr/bin/env python3
"""
enrich_scholar.py — Enrich faculty.json with Google Scholar data.

For each professor with a google_scholar URL, fetches their Scholar profile
and extracts research interests (tags) and top publications.

Re-runnable: skips records that already have scholar_interests populated.

Usage:
    python3 enrich_scholar.py
"""

import json
import re
import time
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup

FACULTY_JSON = Path(__file__).parent / "faculty.json"

SCHOLAR_BASE = "https://scholar.google.com/citations"
BASE_DELAY = 5       # seconds between requests
MAX_BACKOFF = 120    # max backoff cap in seconds
MAX_RETRIES = 10

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}


def extract_scholar_id(url):
    """Extract the user= parameter from a Google Scholar URL."""
    m = re.search(r"[?&]user=([^&]+)", url)
    return m.group(1) if m else None


def fetch_with_backoff(url):
    """Fetch a URL with exponential backoff on 429 responses."""
    for attempt in range(MAX_RETRIES):
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 200:
            return resp.text
        if resp.status_code == 429:
            delay = min(BASE_DELAY * (2 ** attempt), MAX_BACKOFF)
            print(f"  Rate limited (429). Backing off {delay}s (attempt {attempt + 1}/{MAX_RETRIES})")
            time.sleep(delay)
            continue
        print(f"  HTTP {resp.status_code} for {url}")
        return None
    print(f"  Gave up after {MAX_RETRIES} retries")
    return None


def parse_scholar_profile(html):
    """Parse a Google Scholar profile page for interests and publications."""
    soup = BeautifulSoup(html, "html.parser")

    # Research interests / tags
    interests = []
    for a in soup.select("#gsc_prf_int a, .gsc_prf_inta"):
        text = a.get_text(strip=True)
        if text:
            interests.append(text)

    # Publications
    publications = []
    for row in soup.select("#gsc_a_b .gsc_a_tr, tr.gsc_a_tr"):
        title_el = row.select_one(".gsc_a_at, td.gsc_a_t a")
        year_el = row.select_one(".gsc_a_y span, td.gsc_a_y span")
        cite_el = row.select_one(".gsc_a_c a, td.gsc_a_c a")

        title = title_el.get_text(strip=True) if title_el else ""
        year = year_el.get_text(strip=True) if year_el else None
        cited_by = None
        if cite_el:
            try:
                cited_by = int(cite_el.get_text(strip=True))
            except (ValueError, TypeError):
                pass

        if title:
            publications.append({
                "title": title,
                "year": year,
                "cited_by": cited_by,
            })

    return {
        "interests": interests,
        "publications": publications[:20],  # top 20
    }


def main():
    if not FACULTY_JSON.exists():
        print(f"Error: {FACULTY_JSON} not found")
        sys.exit(1)

    records = json.loads(FACULTY_JSON.read_text(encoding="utf-8"))
    print(f"Loaded {len(records)} records")

    # Find candidates: have google_scholar URL and no scholar_interests yet
    candidates = []
    for i, r in enumerate(records):
        scholar_url = r.get("google_scholar", "")
        existing = r.get("scholar_interests", [])
        if scholar_url and not existing:
            scholar_id = extract_scholar_id(scholar_url)
            if scholar_id:
                candidates.append((i, scholar_id))

    print(f"Found {len(candidates)} profiles to enrich")
    if not candidates:
        print("Nothing to do.")
        return

    enriched = 0
    for idx, (rec_idx, scholar_id) in enumerate(candidates):
        name = records[rec_idx].get("name", "???")
        print(f"\n[{idx + 1}/{len(candidates)}] {name} (user={scholar_id})")

        url = f"{SCHOLAR_BASE}?user={scholar_id}&hl=en"
        html = fetch_with_backoff(url)

        if html is None:
            print("  Skipped (fetch failed)")
            # Save progress so far
            if enriched > 0:
                FACULTY_JSON.write_text(
                    json.dumps(records, indent=2, ensure_ascii=False),
                    encoding="utf-8"
                )
                print(f"  Saved progress ({enriched} enriched so far)")
            continue

        data = parse_scholar_profile(html)
        records[rec_idx]["scholar_interests"] = data["interests"]
        records[rec_idx]["publications"] = data["publications"]
        enriched += 1

        print(f"  Interests: {len(data['interests'])}, Publications: {len(data['publications'])}")

        # Rate limit
        if idx < len(candidates) - 1:
            time.sleep(BASE_DELAY)

    # Final save
    FACULTY_JSON.write_text(
        json.dumps(records, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )
    print(f"\nDone. Enriched {enriched}/{len(candidates)} records.")
    print(f"Saved to {FACULTY_JSON}")


if __name__ == "__main__":
    main()
