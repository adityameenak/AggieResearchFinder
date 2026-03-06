#!/usr/bin/env python3
"""
TAMU Engineering Faculty Crawler
=================================
Crawls faculty directory pages and individual profile pages to build a
structured research dataset.

Usage:
  python crawl.py                                  # uses seeds.txt
  python crawl.py <url1> <url2> ...                # CLI seeds (appended to seeds.txt seeds)
  python crawl.py --no-cache                       # clear cache and re-download everything
"""

from __future__ import annotations

import sys
# Force UTF-8 output on Windows (avoids cp1252 UnicodeEncodeError for non-ASCII names)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import argparse
import asyncio
import csv
import hashlib
import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CACHE_DIR   = Path(".cache")
OUTPUT_JSON = Path("faculty.json")
OUTPUT_CSV  = Path("faculty.csv")
SEEDS_FILE  = Path("seeds.txt")

RATE_LIMIT_SECONDS = 1.5   # polite delay between non-cached requests
MAX_RETRIES        = 3
PAGE_TIMEOUT_MS    = 45_000  # 45 s

CSV_FIELDS = ["id", "name", "title", "department", "email",
              "profile_url", "research_summary", "lab_website"]

# ---------------------------------------------------------------------------
# Disk cache helpers
# ---------------------------------------------------------------------------

def _cache_path(url: str) -> Path:
    key = hashlib.md5(url.encode()).hexdigest()
    return CACHE_DIR / f"{key}.html"


def _load_cache(url: str) -> Optional[str]:
    p = _cache_path(url)
    return p.read_text(encoding="utf-8", errors="replace") if p.exists() else None


def _save_cache(url: str, html: str) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _cache_path(url).write_text(html, encoding="utf-8")


# ---------------------------------------------------------------------------
# URL / slug helpers
# ---------------------------------------------------------------------------

def dept_slug_from_url(url: str) -> str:
    """
    Derive a short department slug from a directory or profile URL.
    e.g. https://engineering.tamu.edu/chemical/profiles/... -> 'chemical'
    """
    path_parts = urlparse(url).path.strip("/").split("/")
    skip = {"engineering", "profiles", "index.html", ""}
    for part in path_parts:
        if part and part not in skip and not part.endswith(".html"):
            return part
    return "unknown"


# ---------------------------------------------------------------------------
# Page fetching (Playwright + cache + retry)
# ---------------------------------------------------------------------------

async def fetch_html(page, url: str, retries: int = MAX_RETRIES) -> Optional[str]:
    """Return rendered HTML for *url*, using cache when available."""
    cached = _load_cache(url)
    if cached is not None:
        return cached

    for attempt in range(retries):
        try:
            await page.goto(url, wait_until="networkidle", timeout=PAGE_TIMEOUT_MS)
            html = await page.content()
            _save_cache(url, html)
            await asyncio.sleep(RATE_LIMIT_SECONDS)
            return html
        except PlaywrightTimeout:
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"  [timeout] {url}  — retry in {wait}s …")
                await asyncio.sleep(wait)
            else:
                print(f"  [failed]  {url}  — giving up after {retries} attempts")
        except Exception as exc:
            print(f"  [error]   {url}  — {exc}")
            if attempt >= retries - 1:
                return None
            await asyncio.sleep(2 ** attempt)

    return None


# ---------------------------------------------------------------------------
# Profile-link extraction from directory pages
# ---------------------------------------------------------------------------

_PROFILE_RE = re.compile(
    r'href=["\']([^"\']*\/profiles\/[^"\'#?]+\.html)["\']',
    re.IGNORECASE,
)


def extract_profile_links(html: str, base_url: str) -> list[str]:
    """
    Return sorted, deduplicated absolute profile URLs found in *html*.
    Matches links that contain /profiles/ and end in .html.
    """
    found: set[str] = set()
    for m in _PROFILE_RE.finditer(html):
        href = m.group(1)
        full = urljoin(base_url, href).split("#")[0].split("?")[0]
        # Skip the directory index page itself
        if full.endswith("index.html"):
            continue
        found.add(full)
    return sorted(found)


# ---------------------------------------------------------------------------
# Profile-page field extraction
# ---------------------------------------------------------------------------

_RESEARCH_HEADING_RE = re.compile(
    r"^(research(\s+(interests?|areas?|focus|summary|overview|expertise))?|"
    r"expertise|areas\s+of\s+(interest|research|expertise))$",
    re.IGNORECASE,
)

_TITLE_RE = re.compile(
    r"(professor|associate professor|assistant professor|lecturer|"
    r"research scientist|postdoctoral|adjunct|emeritus|clinical|"
    r"distinguished|endowed|regents)",
    re.IGNORECASE,
)

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

_LAB_LINK_RE = re.compile(
    r"(lab\s*website|group\s*website|research\s*group|lab\s*page|"
    r"visit\s*(my|our|the)?\s*(lab|group|website)|our\s*lab)",
    re.IGNORECASE,
)


def _collect_section_text(heading_tag, soup) -> str:
    """Gather text from siblings after *heading_tag* until the next heading."""
    parts: list[str] = []
    for sib in heading_tag.find_next_siblings():
        if sib.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            break
        if sib.name in ("ul", "ol"):
            items = [li.get_text(" ", strip=True) for li in sib.find_all("li")]
            parts.append(" | ".join(filter(None, items)))
        else:
            t = sib.get_text(" ", strip=True)
            if t:
                parts.append(t)
        if sum(len(p) for p in parts) > 1200:
            break
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def extract_profile_fields(html: str) -> dict:
    """
    Parse a faculty profile page and return a dict with:
    name, title, email, research_summary, lab_website
    """
    soup = BeautifulSoup(html, "html.parser")

    # ---- Name ---------------------------------------------------------------
    name = ""
    for tag in ("h1", "h2"):
        el = soup.find(tag)
        if el:
            name = el.get_text(" ", strip=True)
            break
    if not name:
        for cls in ("faculty-name", "profile-name", "name", "person-name"):
            el = soup.find(class_=cls)
            if el:
                name = el.get_text(" ", strip=True)
                break

    # ---- Title / rank -------------------------------------------------------
    title = ""
    for cls in ("faculty-title", "profile-title", "title", "position", "rank"):
        el = soup.find(class_=cls)
        if el:
            candidate = el.get_text(" ", strip=True)
            if _TITLE_RE.search(candidate) and len(candidate) < 200:
                title = candidate
                break
    if not title:
        # Look in first few siblings of h1
        h1 = soup.find("h1")
        if h1:
            for sib in h1.find_next_siblings(["p", "div", "span", "h2", "h3"])[:6]:
                text = sib.get_text(" ", strip=True)
                if _TITLE_RE.search(text) and len(text) < 200:
                    title = text
                    break

    # ---- Email --------------------------------------------------------------
    email = ""
    mailto = soup.find("a", href=re.compile(r"^mailto:", re.I))
    if mailto:
        email = mailto["href"].replace("mailto:", "").strip().rstrip(".")
    if not email:
        for cls in ("contact", "contact-info", "faculty-contact", "vcard"):
            el = soup.find(class_=cls)
            if el:
                m = _EMAIL_RE.search(el.get_text())
                if m:
                    email = m.group()
                    break

    # ---- Research summary ---------------------------------------------------
    research_summary = ""

    # Strategy 1: heading followed by body text
    for heading in soup.find_all(["h2", "h3", "h4", "h5", "strong", "b"]):
        text = heading.get_text(strip=True)
        if _RESEARCH_HEADING_RE.match(text):
            research_summary = _collect_section_text(heading, soup)
            if research_summary:
                break

    # Strategy 2: id/class attributes containing "research" etc.
    if not research_summary:
        for attr_val in ("research", "research-interests", "research-areas", "expertise"):
            el = (soup.find(id=re.compile(attr_val, re.I)) or
                  soup.find(class_=re.compile(attr_val, re.I)))
            if el:
                research_summary = re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()[:1200]
                break

    # Strategy 3: Drupal / CMS field wrappers common on TAMU sites
    if not research_summary:
        for wrapper_cls in ("field-name-body", "field-body", "field--name-body",
                            "content-area", "profile-body"):
            el = soup.find(class_=re.compile(wrapper_cls, re.I))
            if el:
                research_summary = re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip()[:1200]
                if len(research_summary) > 80:
                    break

    # Strategy 4: longest <p> on the page (best-effort fallback)
    if not research_summary:
        candidates = [
            re.sub(r"\s+", " ", p.get_text(" ", strip=True)).strip()
            for p in soup.find_all("p")
            if len(p.get_text(strip=True)) > 100
        ]
        if candidates:
            research_summary = max(candidates, key=len)[:1200]

    research_summary = re.sub(r"\s+", " ", research_summary).strip()

    # ---- Lab website --------------------------------------------------------
    lab_website = ""
    for a in soup.find_all("a", href=True):
        link_text = a.get_text(strip=True)
        href = a["href"]
        if not href or href.startswith("mailto:") or href.startswith("#"):
            continue
        if _LAB_LINK_RE.search(link_text):
            lab_website = href if href.startswith("http") else urljoin("https://engineering.tamu.edu", href)
            break
        # External links near research keywords
        if href.startswith("http") and "tamu.edu" not in href:
            if any(kw in link_text.lower() for kw in ("lab", "group", "research")):
                lab_website = href
                break

    return {
        "name":             name,
        "title":            title,
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
    }


# ---------------------------------------------------------------------------
# Main crawl routine
# ---------------------------------------------------------------------------

async def crawl(seed_urls: list[str]) -> list[dict]:
    all_records: list[dict] = []
    seen_profile_urls: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_extra_http_headers({
            "User-Agent": (
                "Mozilla/5.0 (compatible; TAMUResearchCrawler/1.0; "
                "educational-use)"
            )
        })

        for seed_url in seed_urls:
            print(f"\n[directory] {seed_url}")
            html = await fetch_html(page, seed_url)
            if html is None:
                print("  Skipping — could not load directory page.")
                continue

            profile_links = extract_profile_links(html, seed_url)
            dept_slug = dept_slug_from_url(seed_url)
            print(f"  Found {len(profile_links)} profile link(s)  dept={dept_slug!r}")

            for profile_url in profile_links:
                if profile_url in seen_profile_urls:
                    print(f"  [dup]     {profile_url}")
                    continue
                seen_profile_urls.add(profile_url)

                print(f"  [profile] {profile_url}")
                phtml = await fetch_html(page, profile_url)
                if phtml is None:
                    continue

                fields = extract_profile_fields(phtml)
                record = {
                    "id":          hashlib.md5(profile_url.encode()).hexdigest()[:12],
                    "profile_url": profile_url,
                    "department":  dept_slug,
                    **fields,
                }
                all_records.append(record)
                print(f"    name={record['name']!r}")

            # Write after each department so results are available incrementally
            if all_records:
                save_outputs(all_records)

        await browser.close()

    return all_records


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

def save_outputs(records: list[dict]) -> None:
    OUTPUT_JSON.write_text(
        json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nWrote {len(records)} records → {OUTPUT_JSON}")

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)
    print(f"Wrote {len(records)} records → {OUTPUT_CSV}")


# ---------------------------------------------------------------------------
# Seeds loading
# ---------------------------------------------------------------------------

def load_seeds() -> list[str]:
    urls: list[str] = []
    if SEEDS_FILE.exists():
        for line in SEEDS_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                urls.append(line)
    return urls


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="TAMU Engineering Faculty Crawler",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "urls",
        nargs="*",
        metavar="URL",
        help="Extra seed directory URL(s) (appended to seeds.txt seeds)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Delete disk cache and re-download all pages",
    )
    args = parser.parse_args()

    if args.no_cache and CACHE_DIR.exists():
        shutil.rmtree(CACHE_DIR)
        print("Cache cleared.")

    seeds = load_seeds() + list(args.urls)

    # Deduplicate, preserve order
    seen: set[str] = set()
    unique_seeds: list[str] = []
    for s in seeds:
        if s not in seen:
            seen.add(s)
            unique_seeds.append(s)

    if not unique_seeds:
        parser.error(
            "No seed URLs found. Add them to seeds.txt or pass as CLI arguments."
        )

    print(f"Crawling {len(unique_seeds)} seed URL(s) …")
    records = asyncio.run(crawl(unique_seeds))

    if records:
        save_outputs(records)
    else:
        print("No records collected.")


if __name__ == "__main__":
    main()
