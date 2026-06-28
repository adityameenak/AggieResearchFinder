#!/usr/bin/env python3
"""
Rice University faculty crawler — uses the Drupal JSON:API at
profiles.rice.edu/jsonapi/node/profile.

This is a separate entry point from crawl.py because Rice's data flow is
fundamentally different: there is a single paginated JSON endpoint that
returns structured records, so we don't need per-profile HTML scraping.

Why not put this in crawl.py?
- Different transport (JSON:API vs HTML)
- Different pagination (server-provided `links.next` cursor)
- Different field shape (Drupal field_* names mapped 1:1)
- No risk of breaking the well-tested TAMU pipeline

Transport: plain `requests` is enough. profiles.rice.edu returns 406 to bare
crawlers, but a Chrome-like User-Agent + Sec-Fetch-* headers (and an
`application/vnd.api+json` Accept) get a 200. We keep a `ResearchFinderBot/1.0`
suffix on the UA so we're still honest about who we are. No Playwright/Chromium
needed (the older version used it before we found the header set that works).

Scope: the raw endpoint returns ~4,400 records spanning every Rice unit —
admin offices, residential colleges, alumni, emeriti, humanities, business.
To mirror the curated TAMU set (research faculty in STEM departments) we keep
only records whose profile_category is "Faculty" AND whose department maps to a
known STEM slug, and we drop emeriti. Pass --all to disable both filters when
onboarding a school where you want everyone.

Usage:
  python crawl_rice.py                            # STEM faculty (~1k–1.5k)
  python crawl_rice.py --limit 50                 # quick smoke test
  python crawl_rice.py --all                       # no STEM/faculty filter
  python crawl_rice.py --keep-emeritus             # include emeriti
  python crawl_rice.py --output ../ui/public/faculty-rice
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

# Drupal's max page size for JSON:API. Anything higher returns an error.
PAGE_LIMIT = 50

BASE_URL = "https://profiles.rice.edu/jsonapi/node/profile"

# Resolving photos needs the file entity inlined; profile_category gives us the
# Faculty/Staff/Student tag we filter on. field_links is a plain attribute (a
# list), NOT a relationship — do not add it to `include` or the API 400s.
INCLUDE = "field_image,field_profile_category"

# Headers that get a 200 out of Rice's anti-bot layer (bare requests get 406).
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 "
        "Safari/537.36 ResearchFinderBot/1.0"
    ),
    "Accept": "application/vnd.api+json",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "Referer": "https://profiles.rice.edu/",
}

# Canonical STEM department slugs. Keys are substrings matched against the
# normalized (lower-cased, "&"→"and", "department of " stripped) department
# name. Order matters: more specific phrases first (e.g. "computational
# applied mathematics" must win over the bare "mathematics" fallback).
# Slugs mirror the TAMU schema where one exists so the UI's deptLabel reuses.
STEM_RULES = [
    ("electrical and computer engineering", "electrical"),
    ("electrical & computer", "electrical"),
    ("electrical and computing", "electrical"),
    ("materials science", "materials"),
    ("msne", "materials"),
    ("civil and environmental", "civil"),
    ("civil & environmental", "civil"),
    ("biomedical engineering", "bioengineering"),
    ("bioengineering", "bioengineering"),
    ("mechanical engineering", "mechanical"),
    ("chemical and biomolecular", "chemical"),
    ("chemical & biomolecular", "chemical"),
    ("chemical engineering", "chemical"),
    ("computational applied mathematics", "cmor"),
    ("computational and applied mathematics", "cmor"),
    ("operations research", "cmor"),
    ("computer science", "cse"),
    ("chemistry", "chemistry"),
    ("physics and astronomy", "physics-astronomy"),
    ("physics & astronomy", "physics-astronomy"),
    ("physics of astronomy", "physics-astronomy"),
    ("applied physics", "applied-physics"),
    ("statistics", "statistics"),
    ("biosciences", "biosciences"),
    ("bioscience", "biosciences"),
    ("earth, environmental", "earth-environmental"),
    ("earth environmental", "earth-environmental"),
    ("planetary sciences", "earth-environmental"),
    ("systems, synthetic", "systems-synthetic-biology"),
    ("synthetic, and physical biology", "systems-synthetic-biology"),
    ("synthetic & physical biology", "systems-synthetic-biology"),
    ("psychological science", "psychological-brain-sciences"),
    ("psychological sciences", "psychological-brain-sciences"),
    ("mathematics", "mathematics"),
    ("kinesiology", "kinesiology"),
]


def normalize_dept_key(dept_name: str) -> str:
    key = (dept_name or "").lower().strip()
    key = key.replace("&", "and")
    key = re.sub(r"\s+", " ", key)
    for prefix in ("department of ", "the dept. of ", "dept. of ", "school of ", "the "):
        if key.startswith(prefix):
            key = key[len(prefix):]
            break
    return key


def stem_slug(dept_name: str) -> Optional[str]:
    """Return the canonical STEM slug for a department, or None if the
    department isn't a recognized STEM unit (admin office, humanities, center)."""
    key = normalize_dept_key(dept_name)
    if not key:
        return None
    for needle, slug in STEM_RULES:
        if needle in key:
            return slug
    return None


def first(value):
    """Drupal JSON:API often returns a one-element list for text fields.
    Return the first element, the value itself, or '' for None.
    """
    if value is None:
        return ""
    if isinstance(value, list):
        return value[0] if value else ""
    return value


def html_to_text(s: str) -> str:
    """Strip Drupal-emitted HTML tags from a field. Cheap and good enough."""
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"&amp;", "&", s)
    s = re.sub(r"&#\d+;", "", s)
    return re.sub(r"\s+", " ", s).strip()


def category_name(item: dict, included_by_id: dict) -> str:
    """Resolve the field_profile_category taxonomy term to its name
    ('Faculty', 'Staff', 'Student', ...)."""
    ref = ((item.get("relationships", {}) or {}).get("field_profile_category", {}) or {}).get("data")
    if isinstance(ref, dict) and ref.get("id"):
        term = included_by_id.get(ref["id"])
        if term:
            return (term.get("attributes", {}) or {}).get("name", "") or ""
    return ""


def normalize_record(item: dict, included_by_id: dict,
                     stem_only: bool, keep_emeritus: bool) -> Optional[dict]:
    """Map a single JSON:API node--profile item to our FacultyRecord shape.

    Returns None for records that fail an essential check (no name) or that the
    active filters exclude (non-Faculty, non-STEM dept, emeritus)."""
    attrs = item.get("attributes", {}) or {}

    first_name = (attrs.get("field_first_name") or "").strip()
    last_name = (attrs.get("field_last_name") or "").strip()
    name = f"{first_name} {last_name}".strip()
    if not name:
        name = (attrs.get("title") or "").strip()
    if not name:
        return None

    # --- filters -----------------------------------------------------------
    if stem_only and category_name(item, included_by_id) != "Faculty":
        return None

    department_name = (attrs.get("field_department") or "").strip()
    if stem_only:
        slug = stem_slug(department_name)
        if slug is None:
            return None
        department = slug
    else:
        department = stem_slug(department_name) or _fallback_slug(department_name)

    # Title can be a list of multiple roles
    title_raw = attrs.get("field_title")
    if isinstance(title_raw, list):
        title = " | ".join(t.strip() for t in title_raw if t).strip(" |")
    else:
        title = (title_raw or "").strip()

    if not keep_emeritus and re.search(r"emerit", title, re.I):
        return None

    # --- contact -----------------------------------------------------------
    email = (attrs.get("field_email") or "").strip()
    phone_raw = first(attrs.get("field_phone"))
    phone = phone_raw.strip() if isinstance(phone_raw, str) else ""
    office_raw = attrs.get("field_address")
    office = ""
    if isinstance(office_raw, dict):
        parts = [office_raw.get(k, "") or "" for k in
                 ("organization", "address_line1", "address_line2", "locality")]
        office = ", ".join(p for p in parts if p).strip(", ")
    elif isinstance(office_raw, str):
        office = office_raw.strip()

    path_info = attrs.get("path") or {}
    alias = path_info.get("alias") if isinstance(path_info, dict) else None
    profile_url = f"https://profiles.rice.edu{alias}" if alias else ""

    # --- research summary --------------------------------------------------
    research_summary = html_to_text(first(attrs.get("field_summary")))
    if len(research_summary) < 80:
        body = attrs.get("body")
        if isinstance(body, dict):
            research_summary = html_to_text(body.get("value", "")) or research_summary
        elif isinstance(body, str):
            research_summary = html_to_text(body) or research_summary
    extras = []
    areas = attrs.get("field_research_areas")
    if isinstance(areas, list):
        extras.extend(a for a in areas if a)
    elif isinstance(areas, str) and areas:
        extras.append(areas)
    kws = attrs.get("field_research_keywords")
    if isinstance(kws, str) and kws:
        extras.append(kws)
    if extras:
        tail = " | ".join(extras)
        research_summary = (research_summary + " | " + tail) if research_summary else tail
    research_summary = research_summary[:1500]

    # --- scholar -----------------------------------------------------------
    scholar_id = (attrs.get("field_scholar_id") or "").strip()
    google_scholar = (f"https://scholar.google.com/citations?user={scholar_id}"
                      if scholar_id else "")

    # --- lab website -------------------------------------------------------
    # field_links is an ATTRIBUTE: a list of Drupal link dicts ({uri/url,
    # title}). Take the first external (non-rice.edu, non-scholar) link.
    lab_website = ""
    links = attrs.get("field_links")
    if isinstance(links, dict):
        links = [links]
    if isinstance(links, list):
        for link in links:
            if not isinstance(link, dict):
                continue
            url = (link.get("uri") or link.get("url") or "").strip()
            url = re.sub(r"^internal:|^entity:", "", url)
            if url.startswith("http") and "rice.edu" not in url and "scholar.google" not in url:
                lab_website = url
                break
    # Fall back to an external organization URL if no explicit lab link.
    if not lab_website:
        org_url = (attrs.get("field_organization_url") or "").strip()
        if org_url.startswith("http") and "rice.edu" not in org_url:
            lab_website = org_url

    # --- photo -------------------------------------------------------------
    # field_image relationship data is a LIST of file refs (usually one).
    photo_url = ""
    img_data = ((item.get("relationships", {}) or {}).get("field_image", {}) or {}).get("data")
    if isinstance(img_data, dict):
        img_data = [img_data]
    if isinstance(img_data, list):
        for ref in img_data:
            if not (isinstance(ref, dict) and ref.get("id")):
                continue
            img = included_by_id.get(ref["id"])
            if not img:
                continue
            uri = (img.get("attributes", {}) or {}).get("uri", {}) or {}
            rel = uri.get("url") if isinstance(uri, dict) else None
            if rel:
                photo_url = rel if rel.startswith("http") else f"https://profiles.rice.edu{rel}"
                break

    return {
        "id":               hashlib.md5((profile_url or name).encode()).hexdigest()[:12],
        "university":       "rice",
        "name":             name,
        "title":            title,
        "department":       department,
        "email":            email,
        "profile_url":      profile_url,
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


def _fallback_slug(dept_name: str) -> str:
    """Kebab slug for --all mode when a dept isn't a known STEM unit."""
    key = normalize_dept_key(dept_name)
    words = re.findall(r"[a-z0-9]+", key)
    return "-".join(words[:3]) if words else "unknown"


def fetch_all(limit: int = 0, stem_only: bool = True,
              keep_emeritus: bool = False) -> list[dict]:
    """Walk the JSON:API pagination via `links.next` until exhausted (or
    `limit` kept records). Dedupes by record id."""
    results: list[dict] = []
    seen: set[str] = set()
    raw_seen = 0
    session = requests.Session()
    session.headers.update(HEADERS)

    next_url = f"{BASE_URL}?page%5Blimit%5D={PAGE_LIMIT}&include={INCLUDE}"
    page_num = 0
    while next_url:
        page_num += 1
        try:
            resp = session.get(next_url, timeout=40)
        except Exception as exc:
            print(f"  fetch failed: {exc}")
            break
        if resp.status_code != 200:
            print(f"[page {page_num}] HTTP {resp.status_code} — stopping")
            break
        doc = resp.json()
        if "errors" in doc:
            print(f"[page {page_num}] API error: {json.dumps(doc['errors'])[:200]}")
            break

        included_by_id = {
            i.get("id"): i for i in (doc.get("included") or [])
            if isinstance(i, dict) and i.get("id")
        }
        data = doc.get("data") or []
        raw_seen += len(data)
        kept_in_page = 0
        for item in data:
            rec = normalize_record(item, included_by_id, stem_only, keep_emeritus)
            if rec and rec["id"] not in seen:
                seen.add(rec["id"])
                results.append(rec)
                kept_in_page += 1
        print(f"[page {page_num}] {len(data)} raw, {kept_in_page} kept "
              f"(total kept {len(results)} / seen {raw_seen})")

        if limit and len(results) >= limit:
            results = results[:limit]
            print(f"  hit limit={limit} — stopping")
            break

        next_link = (doc.get("links") or {}).get("next")
        next_url = next_link.get("href") if isinstance(next_link, dict) else None
        time.sleep(0.3)
    return results


def write_outputs(records: list[dict], stem: str) -> None:
    out_json = Path(f"{stem}.json")
    out_csv = Path(f"{stem}.csv")
    out_json.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nWrote {len(records)} records → {out_json}")

    fields = ["id", "university", "name", "title", "department", "email",
              "profile_url", "research_summary", "lab_website",
              "google_scholar", "ai_review", "photo_url", "phone", "office",
              "scholar_interests", "publications"]
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(records)
    print(f"Wrote {len(records)} records → {out_csv}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", default="faculty-rice",
                        help="Output filename stem (writes <stem>.json + <stem>.csv).")
    parser.add_argument("--limit", type=int, default=0,
                        help="Stop after this many KEPT records (0 = no limit).")
    parser.add_argument("--all", action="store_true",
                        help="Disable STEM-department + Faculty-only filtering "
                             "(keep every profile the endpoint returns).")
    parser.add_argument("--keep-emeritus", action="store_true",
                        help="Keep emeritus/emerita faculty (dropped by default).")
    args = parser.parse_args()

    records = fetch_all(limit=args.limit, stem_only=not args.all,
                        keep_emeritus=args.keep_emeritus)
    if not records:
        print("No records collected.")
        sys.exit(1)
    write_outputs(records, args.output)


if __name__ == "__main__":
    main()
