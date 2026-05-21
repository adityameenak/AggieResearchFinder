#!/usr/bin/env python3
"""
Rice University faculty crawler — uses the Drupal JSON:API at
profiles.rice.edu/jsonapi/node/profile.

This is a separate entry point from crawl.py because Rice's data flow is
fundamentally different: there is a single paginated JSON endpoint that
returns structured records, so we don't need per-profile HTML scraping.

Why not put this in crawl.py?
- Different transport (JSON:API vs HTML)
- Different pagination (offset/limit query params, server-honored)
- Different field shape (Drupal field_* names mapped 1:1)
- No risk of breaking the well-tested TAMU pipeline

Usage:
  python crawl_rice.py                            # pulls all 5000+ profiles
  python crawl_rice.py --limit 50                 # quick smoke test
  python crawl_rice.py --output ../ui/public/faculty-rice.json
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright

# Drupal's max page size for JSON:API. Anything higher returns an error.
PAGE_LIMIT = 50

# Map "field_department" string → short slug (mirrors the schema used by
# the TAMU crawler so the UI's deptLabel works without changes).
DEPT_SLUGS = {
    "bioengineering": "bioengineering",
    "chemical and biomolecular engineering": "chemical",
    "chemistry": "chemistry",
    "civil and environmental engineering": "civil",
    "computer science": "cse",
    "computational and applied mathematics": "cmor",
    "electrical and computer engineering": "electrical",
    "materials science and nanoengineering": "materials",
    "mechanical engineering": "mechanical",
    "statistics": "statistics",
    "physics and astronomy": "physics-astronomy",
    "biosciences": "biology",
    "earth, environmental and planetary sciences": "earth-environmental",
    "psychological sciences": "psychological-brain-sciences",
}


def slugify_dept(dept_name: str) -> str:
    if not dept_name:
        return "unknown"
    key = dept_name.lower().strip()
    # Strip common leading boilerplate so "Department of Anthropology"
    # slugifies as "anthropology" rather than "department-of".
    for prefix in ("department of ", "school of ", "the "):
        if key.startswith(prefix):
            key = key[len(prefix):]
            break
    if key in DEPT_SLUGS:
        return DEPT_SLUGS[key]
    # Fallback: kebab-case the first 3 meaningful words (3 keeps phrases like
    # "political science" intact instead of truncating to "political")
    words = re.findall(r"[a-z0-9]+", key)
    return "-".join(words[:3]) if words else "unknown"


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
    # Drop tags, collapse whitespace
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"&amp;", "&", s)
    s = re.sub(r"&#\d+;", "", s)
    return re.sub(r"\s+", " ", s).strip()


def normalize_record(item: dict, included_by_id: dict) -> Optional[dict]:
    """Map a single JSON:API node--profile item to our FacultyRecord shape.

    Returns None for records that are missing the essentials (no name).
    """
    attrs = item.get("attributes", {}) or {}
    rels = item.get("relationships", {}) or {}

    first_name = (attrs.get("field_first_name") or "").strip()
    last_name = (attrs.get("field_last_name") or "").strip()
    name = f"{first_name} {last_name}".strip()
    if not name:
        # Some records pack the whole name into `title`
        name = (attrs.get("title") or "").strip()
    if not name:
        return None

    # Title can be a list of multiple roles
    title_raw = attrs.get("field_title")
    if isinstance(title_raw, list):
        title = " | ".join(t.strip() for t in title_raw if t).strip(" |")
    else:
        title = (title_raw or "").strip()

    department_name = (attrs.get("field_department") or "").strip()
    department = slugify_dept(department_name)

    # Email, phone, address
    email = (attrs.get("field_email") or "").strip()
    phone_raw = first(attrs.get("field_phone"))
    phone = phone_raw.strip() if isinstance(phone_raw, str) else ""
    office_raw = attrs.get("field_address")
    office = ""
    if isinstance(office_raw, dict):
        # Drupal address fields are dicts with address_line1 / locality / etc.
        parts = [office_raw.get(k, "") or "" for k in
                 ("organization", "address_line1", "address_line2", "locality")]
        office = ", ".join(p for p in parts if p).strip(", ")
    elif isinstance(office_raw, str):
        office = office_raw.strip()

    # Profile URL (canonical Rice URL)
    path_info = attrs.get("path") or {}
    alias = path_info.get("alias") if isinstance(path_info, dict) else None
    profile_url = f"https://profiles.rice.edu{alias}" if alias else ""

    # Research summary: prefer field_summary, fall back to body, then research areas/keywords
    research_summary = html_to_text(first(attrs.get("field_summary")))
    if len(research_summary) < 80:
        body = attrs.get("body")
        if isinstance(body, dict):
            research_summary = html_to_text(body.get("value", "")) or research_summary
        elif isinstance(body, str):
            research_summary = html_to_text(body) or research_summary
    # Append research areas + keywords as " | "-joined tail so the search
    # tokenizer can still match them even if the bio is short.
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

    # Google Scholar URL from scholar_id (Drupal stores just the ID)
    scholar_id = (attrs.get("field_scholar_id") or "").strip()
    google_scholar = (f"https://scholar.google.com/citations?user={scholar_id}"
                      if scholar_id else "")

    # Lab website: prefer the department URL only if it's an external personal lab;
    # otherwise leave blank. Most useful lab links live in `field_links` (relationship).
    lab_website = ""
    links_data = (rels.get("field_links") or {}).get("data") or []
    for link_ref in links_data if isinstance(links_data, list) else [links_data]:
        ref_id = link_ref.get("id") if isinstance(link_ref, dict) else None
        if not ref_id:
            continue
        included = included_by_id.get(ref_id)
        if not included:
            continue
        href = (included.get("attributes", {}) or {}).get("field_url", {}) or {}
        url = href.get("uri") if isinstance(href, dict) else None
        if url and "rice.edu" not in url and "scholar.google" not in url:
            lab_website = url
            break

    # Photo URL from included image entity
    photo_url = ""
    img_data = (rels.get("field_image") or {}).get("data")
    if isinstance(img_data, dict) and img_data.get("id"):
        img = included_by_id.get(img_data["id"])
        if img:
            file_url = (img.get("attributes", {}) or {}).get("uri", {}) or {}
            if isinstance(file_url, dict) and file_url.get("url"):
                photo_url = f"https://profiles.rice.edu{file_url['url']}"

    return {
        "id":               hashlib.md5(profile_url.encode()).hexdigest()[:12] if profile_url else hashlib.md5(name.encode()).hexdigest()[:12],
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


async def fetch_all(limit: int = 0) -> list[dict]:
    """Walk the JSON:API pagination until we've consumed every page (or hit
    `limit`). Returns mapped FacultyRecord dicts.
    """
    results: list[dict] = []
    # Drupal JSON:API rejects some include paths; start without and let
    # photo/lab URLs come back as best-effort blanks. We still get every
    # field we strictly need (name, dept, email, summary, profile path).
    next_url = (
        "https://profiles.rice.edu/jsonapi/node/profile"
        f"?page%5Blimit%5D={PAGE_LIMIT}"
    )

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36 "
                "(ResearchFinderBot/1.0; educational-use)"
            ),
            viewport={"width": 1280, "height": 720},
            extra_http_headers={
                "Accept": "application/vnd.api+json",
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            },
        )
        page = await context.new_page()

        page_num = 0
        while next_url:
            page_num += 1
            print(f"[page {page_num}] {next_url[:120]} …")
            try:
                resp = await page.goto(next_url, wait_until="domcontentloaded", timeout=30_000)
            except Exception as exc:
                print(f"  fetch failed: {exc}")
                break
            if resp.status != 200:
                print(f"  HTTP {resp.status} — stopping")
                break
            try:
                text = await page.evaluate("() => document.body.innerText")
                doc = json.loads(text)
            except Exception as exc:
                print(f"  JSON parse failed: {exc}")
                break

            included_by_id = {
                i.get("id"): i for i in (doc.get("included") or [])
                if isinstance(i, dict) and i.get("id")
            }

            data = doc.get("data") or []
            mapped_in_page = 0
            for item in data:
                rec = normalize_record(item, included_by_id)
                if rec:
                    results.append(rec)
                    mapped_in_page += 1
            print(f"  ← {len(data)} items, {mapped_in_page} mapped (cumulative: {len(results)})")

            if limit and len(results) >= limit:
                print(f"  hit limit={limit} — stopping")
                results = results[:limit]
                break

            links = doc.get("links") or {}
            next_link = links.get("next")
            if isinstance(next_link, dict):
                next_url = next_link.get("href")
            else:
                next_url = None

            # Small politeness delay
            await asyncio.sleep(0.5)

        await browser.close()
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
                        help="Output filename stem (writes <stem>.json + <stem>.csv). "
                             "Default: faculty-rice")
    parser.add_argument("--limit", type=int, default=0,
                        help="Stop after this many records (0 = no limit, ~5000 total).")
    args = parser.parse_args()

    records = asyncio.run(fetch_all(limit=args.limit))
    if not records:
        print("No records collected.")
        sys.exit(1)
    write_outputs(records, args.output)


if __name__ == "__main__":
    main()
