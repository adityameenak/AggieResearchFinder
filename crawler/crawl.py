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
# Gemini AI setup
# ---------------------------------------------------------------------------

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

_GEMINI_MODEL = None
_GEMINI_DISABLED = False  # Set to True after quota/auth errors to skip all future calls

def _get_gemini_model():
    global _GEMINI_MODEL, _GEMINI_DISABLED
    if _GEMINI_DISABLED:
        return None
    if _GEMINI_MODEL is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            _GEMINI_DISABLED = True
            return None
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            _GEMINI_MODEL = genai.GenerativeModel("gemini-3.1-flash-lite-preview")
        except Exception as exc:
            print(f"  [warn] Could not initialise Gemini: {exc}")
            _GEMINI_DISABLED = True
            return None
    return _GEMINI_MODEL


def generate_ai_review(name: str, department: str, research_summary: str) -> str:
    """Use Gemini to write a comprehensive, readable research review."""
    global _GEMINI_DISABLED
    if _GEMINI_DISABLED:
        return ""
    model = _get_gemini_model()
    if model is None:
        return ""
    # Skip stub/empty summaries
    cleaned = research_summary.replace("|", ",").strip()
    if len(cleaned) < 40:
        return ""
    prompt = (
        f"You are an academic writing assistant. Based on the following scraped research "
        f"information about a professor, write a comprehensive yet concise review (4-6 sentences) "
        f"of their research work that a student could read to quickly understand what this "
        f"professor does and what their lab focuses on. Write in third person. Be specific "
        f"about research topics and methods. Do not fabricate details beyond what is provided.\n\n"
        f"Professor: {name}\n"
        f"Department: {department}\n"
        f"Research information: {cleaned[:1000]}\n\n"
        f"Write the review as a single paragraph with no heading or bullet points."
    )
    try:
        response = model.generate_content(prompt)
        time.sleep(1)  # rate-limit Gemini calls
        return response.text.strip()
    except Exception as exc:
        exc_str = str(exc).lower()
        if "quota" in exc_str or "resource_exhausted" in exc_str or "429" in exc_str:
            print(f"  [warn] Gemini quota exhausted — disabling AI reviews for this run.")
        else:
            print(f"  [warn] Gemini call failed for {name}: {type(exc).__name__}")
        _GEMINI_DISABLED = True
        return ""

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
              "profile_url", "research_summary", "lab_website",
              "google_scholar", "ai_review", "photo_url", "phone", "office",
              "scholar_interests", "publications"]

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
         https://artsci.tamu.edu/biology/contact/... -> 'biology'

    For Rice profile pages the URL doesn't encode the department, so this
    returns 'rice-unknown' as a placeholder. The Rice profile extractor
    overrides it with the actual slugified department.
    """
    parsed = urlparse(url)
    host = parsed.hostname or ""
    path_parts = parsed.path.strip("/").split("/")

    if "artsci.tamu.edu" in host:
        # Arts & Sciences: first path segment is the department slug
        if path_parts and path_parts[0]:
            return path_parts[0]
        return "unknown"

    if is_rice_url(url):
        return "rice-unknown"

    if is_ut_url(url):
        # UT encodes the department in the subdomain, not the path.
        return ut_dept_from_host(url)

    skip = {"engineering", "profiles", "index.html", ""}
    for part in path_parts:
        if part and part not in skip and not part.endswith(".html"):
            return part
    return "unknown"


def is_artsci_url(url: str) -> bool:
    """Check if a URL belongs to the Arts & Sciences domain."""
    return "artsci.tamu.edu" in (urlparse(url).hostname or "")


def is_rice_url(url: str) -> bool:
    """Check if a URL belongs to a Rice University domain."""
    host = (urlparse(url).hostname or "").lower()
    return host == "profiles.rice.edu" or host.endswith(".rice.edu") or host == "rice.edu"


def is_ut_url(url: str) -> bool:
    """Check if a URL belongs to a UT Austin domain (utexas.edu)."""
    host = (urlparse(url).hostname or "").lower()
    return host == "utexas.edu" or host.endswith(".utexas.edu")


# UT Austin spreads its STEM faculty across per-department subdomains
# (ece.utexas.edu, me.utexas.edu, …). The leading subdomain label IS the
# department, so we map it to the shared slug schema. Add a row here when you
# add a department's directory to seeds-ut.txt.
_UT_SUBDOMAIN_DEPT = {
    # Cockrell School of Engineering
    "ece":  "electrical",      # Electrical & Computer Engineering
    "me":   "mechanical",      # Walker Dept. of Mechanical Engineering
    "che":  "chemical",        # McKetta Dept. of Chemical Engineering
    "caee": "civil",           # Civil, Architectural & Environmental Engineering
    "ae":   "aerospace",       # Aerospace Engineering & Engineering Mechanics
    "bme":  "biomedical",      # Biomedical Engineering
    "pge":  "petroleum",       # Hildebrand Dept. of Petroleum & Geosystems Eng.
    # College of Natural Sciences. Most CNS depts render profiles at
    # <dept>.utexas.edu/directory/<slug> off a shared central directory
    # (directory.cns.utexas.edu) — see _extract_ut_cns_profile.
    "cs":              "cse",                  # Computer Science
    "math":            "mathematics",
    "stat":            "statistics",
    "sds":             "statistics",           # Statistics & Data Sciences
    "chemistry":       "chemistry",
    "cm":              "chemistry",            # (legacy host alias)
    "physics":         "physics-astronomy",
    "ph":              "physics-astronomy",    # (legacy host alias)
    "molecularbiosci": "biosciences",          # Molecular Biosciences
    "integrativebio":  "biosciences",          # Integrative Biology
    "neuroscience":    "neuroscience",
    "bio":             "biology",              # bio.cns.utexas.edu hosts shared CNS profiles
    "dellmed":         "medicine",             # Dell Medical School
    "astronomy":       "physics-astronomy",
}

# CNS hosts whose profiles use the shared central-directory heading theme.
_UT_CNS_HOSTS = ("math.", "physics.", "chemistry.", "molecularbiosci.",
                 "integrativebio.", "neuroscience.", "astronomy.", "sds.",
                 "stat.", "bio.")

# CNS dept directories list *everyone* (grad students, staff, finance managers,
# …), so we keep only records whose title marks them as research/teaching
# faculty. Engineering depts are unaffected — this filter is CNS-scoped.
_UT_CNS_FACULTY_RE = re.compile(
    r"professor|lecturer|instructor|instruction|\bchair\b|emerit|"
    r"distinguished|\bfaculty\b|research scientist",
    re.IGNORECASE,
)


def is_ut_cns_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    return host.startswith(_UT_CNS_HOSTS)


def ut_dept_from_host(url: str) -> str:
    """Derive a UT department slug from the subdomain (www. is ignored)."""
    host = (urlparse(url).hostname or "").lower()
    labels = [l for l in host.split(".") if l and l != "www"]
    if labels:
        return _UT_SUBDOMAIN_DEPT.get(labels[0], labels[0])
    return "unknown"


# Map of Rice "School" / department name patterns → short slug. Kept narrow
# on purpose; anything not matched falls through to a slug derived from the
# raw department string.
_RICE_DEPT_SLUGS = {
    "bioengineering": "bioengineering",
    "chemical and biomolecular engineering": "chemical",
    "civil and environmental engineering": "civil",
    "computational applied mathematics": "cmor",
    "computer science": "cse",
    "electrical and computer engineering": "electrical",
    "materials science": "materials",
    "mechanical engineering": "mechanical",
    "statistics": "statistics",
}


def slugify_rice_dept(department_text: str) -> str:
    if not department_text:
        return "unknown"
    lower = department_text.lower().strip()
    for needle, slug in _RICE_DEPT_SLUGS.items():
        if needle in lower:
            return slug
    # Fallback: kebab-case first 2 words
    words = re.findall(r"[a-z0-9]+", lower)
    return "-".join(words[:2]) if words else "unknown"


# ---------------------------------------------------------------------------
# Page fetching (Playwright + cache + retry)
# ---------------------------------------------------------------------------

async def fetch_html(page, url: str, retries: int = MAX_RETRIES) -> Optional[str]:
    """Return rendered HTML for *url*, using cache when available.

    Rice's CDN times out under `networkidle` because of background analytics
    scripts. For Rice we use `domcontentloaded` plus a short settle delay so
    JS-rendered content has a chance to populate.
    """
    cached = _load_cache(url)
    if cached is not None:
        return cached

    rice = is_rice_url(url)
    wait_until = "domcontentloaded" if rice else "networkidle"

    for attempt in range(retries):
        try:
            await page.goto(url, wait_until=wait_until, timeout=PAGE_TIMEOUT_MS)
            if rice:
                # Settle delay for Rice CMS to inject server-rendered fragments.
                await page.wait_for_timeout(1500)
            html = await page.content()
            # Reject obvious bot-block placeholders so we don't cache empty pages.
            if rice and len(html) < 1000:
                raise RuntimeError(f"suspiciously small response ({len(html)} bytes) — likely bot-blocked")
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


_RICE_PROFILE_RE = re.compile(
    r'href=["\'](/faculty/[a-z0-9][a-z0-9\-]+)/?["\']',
    re.IGNORECASE,
)

# UT (Cockrell) person pages live under /people/faculty/<slug> or
# /people/faculty-directory/<slug>. Capture the path and the trailing slug so
# we can drop category landing pages that share the prefix.
_UT_PROFILE_RE = re.compile(
    # Three UT person-page shapes across the different dept site themes:
    #   ECE (Drupal Kit):   /people/faculty/<slug>
    #   ME (legacy):        /people/faculty-directory/<slug>
    #   Cockrell WordPress: /person/<slug>   (ae, bme, che, caee, …)
    r'(?:/people/faculty(?:-directory|-researchers)?|/person|/faculty-and-staff'
    r'|/directory)/(?P<slug>[a-z0-9][a-z0-9\-]+)/?',
    re.IGNORECASE,
)

# Slugs that sit under /people/faculty/ but are listing/category pages, not
# people. (UT groups faculty by appointment type on these landing pages.)
_UT_NON_PROFILE_SLUGS = {
    "adjunct", "affiliate", "affiliated", "emeritus", "emeriti", "emeritas",
    "lecturer", "lecturers", "joint", "courtesy", "visiting", "research",
    "adjoint", "staff", "leadership", "faculty", "all", "tenured",
    "tenure-track", "professors-of-practice",
}


def extract_profile_links(html: str, base_url: str) -> list[str]:
    """
    Return sorted, deduplicated absolute profile URLs found in *html*.
    Handles TAMU engineering (/profiles/*.html), TAMU arts & sciences,
    and Rice profiles.rice.edu (/faculty/<slug>).
    """
    found: set[str] = set()

    if is_rice_url(base_url):
        # Rice profile pattern is /faculty/<slug> (no .html, no trailing path)
        for m in _RICE_PROFILE_RE.finditer(html):
            href = m.group(1).rstrip("/")
            # Skip the listing itself (/faculty with no slug after it)
            if href == "/faculty":
                continue
            full = urljoin(base_url, href).split("#")[0].split("?")[0]
            found.add(full)
        return sorted(found)

    if is_ut_url(base_url):
        # UT (Cockrell) profile pattern: /people/faculty/<person-slug> or
        # /people/faculty-directory/<person-slug>. The same path also hosts
        # category landing pages (adjunct, affiliate, emeritus, …) we skip.
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            m = _UT_PROFILE_RE.search(a["href"])
            if not m:
                continue
            slug = m.group("slug").lower()
            if slug in _UT_NON_PROFILE_SLUGS:
                continue
            full = urljoin(base_url, m.group(0)).split("#")[0].split("?")[0].rstrip("/")
            found.add(full)
        return sorted(found)

    # Strategy 1: regex for /profiles/*.html links (works for both TAMU domains)
    for m in _PROFILE_RE.finditer(html):
        href = m.group(1)
        full = urljoin(base_url, href).split("#")[0].split("?")[0]
        if full.endswith("index.html"):
            continue
        found.add(full)

    # Strategy 2: BeautifulSoup parsing for Arts & Sciences pages
    if is_artsci_url(base_url):
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "/profiles/" in href and href.endswith(".html") and not href.endswith("index.html"):
                full = urljoin(base_url, href).split("#")[0].split("?")[0]
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
    r"visit\s*(my|our|the)?\s*(lab|group|website)|our\s*lab|"
    r"website|home\s*page|personal)",
    re.IGNORECASE,
)


def _collect_section_text(heading_tag, soup) -> str:
    """Gather text after *heading_tag* until the next heading.

    Walks the document in order (not just direct siblings) so it still captures
    a section whose body lives in a different wrapper than the heading — a
    common TAMU layout where the "Research Interests" prose isn't a sibling of
    the <h2>. Descendants of an already-collected block are skipped to avoid
    double-counting the same text.
    """
    parts: list[str] = []
    taken: set[int] = set()
    for el in heading_tag.find_all_next():
        if el.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            break
        if el.name not in ("p", "li", "div", "span", "td", "blockquote"):
            continue
        if any(id(anc) in taken for anc in el.parents):
            continue  # parent already captured this text
        t = el.get_text(" ", strip=True)
        if t:
            parts.append(t)
            taken.add(id(el))
        if sum(len(p) for p in parts) > 1200:
            break
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def _extract_research_summary(soup) -> str:
    """Extract research summary from a faculty profile page (shared logic)."""
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

    return re.sub(r"\s+", " ", research_summary).strip()


def extract_profile_fields(html: str, profile_url: str = "") -> dict:
    """
    Parse a faculty profile page and return a dict with:
    name, title, email, research_summary, lab_website, google_scholar,
    photo_url, phone, office. The Rice extractor additionally returns
    `department` (already slugified) which overrides the URL-derived slug
    in the calling code.
    """
    if is_rice_url(profile_url):
        return _extract_rice_profile(html, profile_url)
    if is_ut_url(profile_url):
        return _extract_ut_profile(html, profile_url)
    if is_artsci_url(profile_url):
        return _extract_artsci_profile(html, profile_url)
    return _extract_engineering_profile(html, profile_url)


# ---------------------------------------------------------------------------
# Rice profile parser
# ---------------------------------------------------------------------------

_SOCIAL_BLOCKLIST = ("linkedin.com", "facebook.com", "youtube.com",
                     "twitter.com", "instagram.com", "tiktok.com",
                     "news.rice.edu")


def _extract_rice_profile(html: str, profile_url: str) -> dict:
    """Parse a profiles.rice.edu faculty page.

    Rice's CMS wraps fields in .article__* classes inside an .article--bio
    container. Department is read from the first internal rice.edu link
    in .article__author-contact (e.g. "Civil and Environmental Engineering"
    → cee.rice.edu) and slugified via slugify_rice_dept().
    """
    soup = BeautifulSoup(html, "html.parser")

    base = "https://profiles.rice.edu"

    # ---- Name ---------------------------------------------------------------
    name = ""
    name_el = soup.find(class_="article__author-name")
    if name_el:
        name = name_el.get_text(" ", strip=True)

    # ---- Contact container (used for department + contact info) -------------
    contact = soup.find(class_="article__author-contact")

    # ---- Title --------------------------------------------------------------
    title = ""
    for role in soup.find_all(class_="article__author-role"):
        # Skip role nodes nested inside the contact box — those are dept links.
        if contact and contact in role.parents:
            continue
        # The first non-nested role is the academic title (may have <br/> for
        # additional roles; collapse to a single line).
        title = re.sub(r"\s+", " ", role.get_text(" ", strip=True)).strip()
        break

    # ---- Department ---------------------------------------------------------
    department_text = ""
    if contact:
        for a in contact.find_all("a", href=True):
            href = a["href"]
            if href.startswith("mailto:"):
                continue
            if "rice.edu" in href:
                department_text = a.get_text(" ", strip=True)
                break
    department = slugify_rice_dept(department_text)

    # ---- Email / phone / office --------------------------------------------
    email = ""
    phone = ""
    office = ""

    address_el = soup.find(class_="article__author-address")
    if address_el:
        # Email is the only mailto link in this block.
        mailto = address_el.find("a", href=re.compile(r"^mailto:", re.I))
        if mailto:
            email = mailto["href"].replace("mailto:", "").strip()
        # Phone may appear as 713-348-5903 or (713) 348-4286. Office is whatever is
        # left after stripping the contact header, phone, and email.
        text = address_el.get_text(" ", strip=True)
        text = re.sub(r"^\s*CONTACT\s*\|?\s*", "", text)
        phone_match = re.search(r"(?:\(\d{3}\)\s*|\b\d{3}-)\d{3}[-\s]?\d{4}", text)
        if phone_match:
            phone = phone_match.group().strip()
        # Office = everything before the phone (or before the email if no phone)
        cut_token = phone or email
        if cut_token and cut_token in text:
            office = text.split(cut_token, 1)[0].strip(" |")
        else:
            office = text.strip(" |")
        # Strip dangling pipe/whitespace
        office = re.sub(r"\s*\|\s*$", "", office).strip()

    # Fallback: any mailto on the page
    if not email:
        mailto = soup.find("a", href=re.compile(r"^mailto:", re.I))
        if mailto:
            email = mailto["href"].replace("mailto:", "").strip()

    # ---- Photo --------------------------------------------------------------
    photo_url = ""
    photo_container = soup.find(class_="article__image")
    if photo_container:
        img = photo_container.find("img")
        if img and img.get("src"):
            photo_url = urljoin(base, img["src"])

    # ---- Websites: lab + Google Scholar ------------------------------------
    lab_website = ""
    google_scholar = ""
    websites_el = soup.find(class_="article__website")
    if websites_el:
        for a in websites_el.find_all("a", href=True):
            href = a["href"]
            if not href.startswith("http"):
                continue
            if "scholar.google" in href and not google_scholar:
                google_scholar = href
                continue
            if any(domain in href.lower() for domain in _SOCIAL_BLOCKLIST):
                continue
            # First non-Scholar, non-social external link → treat as lab/personal site
            if not lab_website:
                lab_website = href

    # ---- Research summary / bio --------------------------------------------
    research_summary = ""
    body_el = soup.find(class_="profileBody")
    if body_el:
        research_summary = re.sub(r"\s+", " ", body_el.get_text(" ", strip=True)).strip()
        research_summary = research_summary[:1500]

    return {
        "name":             name,
        "title":            title,
        "department":       department,
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           office,
    }


def _extract_ut_profile(html: str, profile_url: str) -> dict:
    """Dispatch a UT profile to the right theme parser by subdomain.

    UT departments run three different site themes (no shared structure):
      - ece.utexas.edu          → UT Drupal Kit   (`field--name-field-*`)
      - me.utexas.edu           → ME legacy theme (`.facphoto`, `.endowtitle`)
      - everything else Cockrell → modern WordPress (`.page-header__*`,
        `.contact__*`), e.g. ae/bme/che/caee/pge
    All three return the same field shape plus `department` (from the host).
    """
    host = (urlparse(profile_url).hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if host.startswith(_UT_CNS_HOSTS):
        return _extract_ut_cns_profile(html, profile_url)
    if host.startswith("cs."):
        return _extract_ut_cs_profile(html, profile_url)
    if host.startswith("ece."):
        return _extract_ut_drupalkit_profile(html, profile_url)
    if host.startswith("me."):
        return _extract_ut_me_profile(html, profile_url)
    return _extract_ut_cockrell_profile(html, profile_url)


def _extract_ut_drupalkit_profile(html: str, profile_url: str) -> dict:
    """Parse the UT Drupal Kit theme (ece.utexas.edu).

    The theme exposes stable `field--name-field-*` / `views-field-field-*`
    wrappers; the name lives in `<title>`, not an `<h1>`.
    """
    soup = BeautifulSoup(html, "html.parser")

    def field(name):
        return soup.find(class_=lambda c: c and f"field--name-{name}" in c)

    def views_field(name):
        return soup.find(class_=lambda c: c and f"views-field-field-{name}" in c)

    # Name: the UT Drupal Kit doesn't render an <h1>; the <title> is
    # "<Name> | <Dept> at UT Austin". Fall back to the URL slug.
    name = ""
    if soup.title:
        name = soup.title.get_text(strip=True).split("|")[0].strip()
    if not name:
        slug = profile_url.rstrip("/").rsplit("/", 1)[-1]
        name = slug.replace("-", " ").title()

    # Title: department position + any endowed/special chair line.
    title_parts = []
    pos = field("field-faculty-position")
    if pos:
        title_parts.append(pos.get_text(" ", strip=True))
    special = field("field-special-position-title")
    if special:
        title_parts.append(special.get_text(" ", strip=True))
    title = " | ".join(p for p in title_parts if p)

    # Email via mailto:
    email = ""
    em = views_field("email") or soup
    a = em.find("a", href=lambda h: h and h.startswith("mailto:"))
    if a:
        email = a["href"].replace("mailto:", "").split("?")[0].strip()

    phone = ""
    ph = views_field("phone")
    if ph:
        phone = re.sub(r"\s+", " ", ph.get_text(" ", strip=True)).strip()

    office = ""
    of = views_field("office")
    if of:
        office = re.sub(r"^\s*Office:?\s*", "", of.get_text(" ", strip=True)).strip()

    # Portrait image (relative to the dept host).
    photo_url = ""
    po = views_field("portrait")
    img = po.find("img") if po else None
    if img and img.get("src"):
        photo_url = urljoin(profile_url, img["src"])

    # Google Scholar + lab/personal website.
    google_scholar = ""
    gs = field("field-google-scholar-profile")
    a = gs.find("a", href=True) if gs else None
    if a:
        google_scholar = a["href"]

    lab_website = ""
    ws = field("field-website-group") or field("field-personal-website")
    a = ws.find("a", href=True) if ws else None
    if a and a["href"].startswith("http"):
        lab_website = a["href"]

    # Research summary: prefer the body bio; append research-areas terms so the
    # search tokenizer still matches when the bio is thin or empty.
    research_summary = ""
    body = field("body")
    if body:
        research_summary = re.sub(r"\s+", " ", body.get_text(" ", strip=True)).strip()
    areas = field("field-research-areas")
    if areas:
        areas_txt = re.sub(r"^\s*Research Areas?\s*\|?\s*", "",
                           areas.get_text(" | ", strip=True)).strip(" |")
        if areas_txt:
            research_summary = (f"{research_summary} | {areas_txt}"
                                if research_summary else areas_txt)
    if not research_summary:
        research_summary = _extract_research_summary(soup)
    research_summary = research_summary[:1500]

    return {
        "name":             name,
        "title":            title,
        "department":       ut_dept_from_host(profile_url),
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           office,
    }


_UT_EXT_LINK_SKIP = ("utexas.edu", "scholar.google", "facebook.com", "twitter.com",
                     "x.com", "linkedin.com", "youtube.com", "instagram.com",
                     "qualtrics.com", "give.", "giving", "pantheonsite.io",
                     # admin/form/aggregator domains that aren't a lab site
                     "compliancebridge.com", "secure4.", "researchgate.net",
                     "orcid.org", "wikipedia.org", "doi.org", "github.com/login",
                     "maps.google", "goo.gl", "bit.ly")


def _extract_ut_cockrell_profile(html: str, profile_url: str) -> dict:
    """Parse the modern Cockrell WordPress theme (ae/bme/che/caee/pge …).

    Stable block classes: `.page-header__name`, `.position__title`/
    `.position__description`, `.contact__email|phone_number|building_number`,
    `.research_interests__content`, plus the portrait in `og:image`.
    """
    soup = BeautifulSoup(html, "html.parser")

    def text(sel):
        el = soup.select_one(sel)
        return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).strip() if el else ""

    name = text(".page-header__name")
    if not name and soup.title:
        name = soup.title.get_text(strip=True).split("|")[0].split(" - ")[0].strip()
    if not name:
        name = profile_url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()

    title = " | ".join(p for p in (text(".position__title"),
                                   text(".position__description")) if p)

    email = ""
    a = soup.select_one(".contact__email a[href^='mailto:']") or \
        soup.find("a", href=lambda h: h and h.startswith("mailto:"))
    if a:
        email = a["href"].replace("mailto:", "").split("?")[0].strip()

    phone = text(".contact__phone_number")
    office = text(".contact__building_number")

    # Portrait: the WordPress theme reliably sets og:image.
    photo_url = ""
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        photo_url = og["content"].strip()

    # Research summary: research-interests block + any taxonomy research areas.
    parts = [text(".research_interests__content") or text(".page-header__research-interests")]
    tax = soup.select_one(".person-taxonomy-listing__listing")
    if tax:
        parts.append(re.sub(r"\s+", " ", tax.get_text(" | ", strip=True)).strip(" |"))
    research_summary = " | ".join(p for p in parts if p)[:1500]

    # External links: first scholar.google → google_scholar; first other
    # non-UT, non-social link → lab_website.
    google_scholar = ""
    lab_website = ""
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.startswith("http"):
            continue
        if "scholar.google" in href and not google_scholar:
            google_scholar = href
        elif not lab_website and not any(s in href for s in _UT_EXT_LINK_SKIP):
            lab_website = href

    return {
        "name":             name,
        "title":            title,
        "department":       ut_dept_from_host(profile_url),
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           office,
    }


def _extract_ut_me_profile(html: str, profile_url: str) -> dict:
    """Parse the ME (Walker Dept.) legacy theme (me.utexas.edu).

    Uses `.facphoto` / `.endowtitle` / `.contact` markers with generic
    fallbacks (h1 name, mailto, og:image, research-heading section text).
    """
    soup = BeautifulSoup(html, "html.parser")

    name = ""
    h1 = soup.find("h1")
    if h1:
        name = h1.get_text(" ", strip=True)
    if not name and soup.title:
        name = soup.title.get_text(strip=True).split("|")[0].split(" - ")[0].strip()
    if not name:
        name = profile_url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()

    endow = soup.select_one(".endowtitle")
    title = endow.get_text(" ", strip=True) if endow else ""
    if not title:
        m = _TITLE_RE.search(soup.get_text(" ", strip=True))
        title = m.group(0).title() if m else ""

    email = ""
    a = soup.find("a", href=lambda h: h and h.startswith("mailto:"))
    if a:
        email = a["href"].replace("mailto:", "").split("?")[0].strip()

    contact = soup.select_one(".contact")
    phone = ""
    if contact:
        pm = re.search(r"\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}", contact.get_text(" ", strip=True))
        phone = pm.group(0) if pm else ""

    photo_url = ""
    fp = soup.select_one(".facphoto img") or soup.select_one("img.facphoto")
    if fp and fp.get("src"):
        photo_url = urljoin(profile_url, fp["src"])
    if not photo_url:
        og = soup.find("meta", property="og:image")
        if og and og.get("content"):
            photo_url = og["content"].strip()

    research_summary = _extract_research_summary(soup)[:1500]

    google_scholar = ""
    lab_website = ""
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.startswith("http"):
            continue
        if "scholar.google" in href and not google_scholar:
            google_scholar = href
        elif not lab_website and not any(s in href for s in _UT_EXT_LINK_SKIP):
            lab_website = href

    return {
        "name":             name,
        "title":            title,
        "department":       ut_dept_from_host(profile_url),
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           "",
    }


def _dedup_text(s: str) -> str:
    """CNS pages render desktop+mobile copies of each section, so the text is
    doubled. Collapse exact consecutive duplicate phrases and a fully-doubled
    string back to a single copy."""
    s = re.sub(r"\s+", " ", s or "").strip()
    if not s:
        return s
    half = len(s) // 2
    if s[:half].strip() == s[half:].strip():   # exactly doubled
        return s[:half].strip()
    # otherwise drop immediately-repeated " | "-joined or sentence chunks
    seen, out = set(), []
    for part in re.split(r"(?<=[.!?])\s+|\s\|\s", s):
        p = part.strip()
        if p and p.lower() not in seen:
            seen.add(p.lower())
            out.append(p)
    return " ".join(out)


def _cns_section(soup, names) -> str:
    """Return the text under the first <h2>/<h3>/<h4> whose label is in *names*,
    gathered until the next heading."""
    for h in soup.find_all(["h2", "h3", "h4"]):
        if h.get_text(" ", strip=True).strip() in names:
            parts = []
            for sib in h.find_all_next():
                if sib.name in ("h1", "h2", "h3", "h4"):
                    break
                t = sib.get_text(" ", strip=True)
                if t:
                    parts.append(t)
                if sum(len(p) for p in parts) > 1500:
                    break
            return _dedup_text(" ".join(parts))
    return ""


def _extract_ut_cns_profile(html: str, profile_url: str) -> dict:
    """Parse the shared CNS central-directory theme (math/physics/chemistry/
    molbio/…, served at <dept>.utexas.edu/directory/<slug>).

    Content is organized under headings (Contact Information / Research /
    Research Areas / Fields of Interest), with the portrait hosted on
    directory.cns.utexas.edu. No semantic field classes, so we extract by
    heading and dedup the doubled desktop+mobile markup.
    """
    soup = BeautifulSoup(html, "html.parser")

    name = ""
    h1 = soup.find("h1")
    if h1:
        name = h1.get_text(" ", strip=True)
    if not name:
        name = profile_url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()

    # Title: the first non-empty text node after the name heading.
    title = ""
    if h1:
        for sib in h1.find_all_next():
            t = sib.get_text(" ", strip=True)
            if t:
                title = t[:160]
                break

    contact = _cns_section(soup, {"Contact Information"})

    email = ""
    a = soup.find("a", href=lambda h: h and h.startswith("mailto:"))
    if a:
        email = a["href"].replace("mailto:", "").split("?")[0].strip()
    elif contact:
        m = _EMAIL_RE.search(contact)
        email = m.group(0) if m else ""

    phone = ""
    if contact:
        pm = re.search(r"\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}", contact)
        phone = pm.group(0) if pm else ""

    office = ""
    if contact:
        om = re.search(r"([A-Z]{2,4})\s*Room Number:\s*([\w.\-]+)", contact)
        if om:
            office = f"{om.group(1)} {om.group(2)}"

    # Portrait from the central CNS directory.
    photo_url = ""
    for img in soup.find_all("img"):
        src = img.get("src") or ""
        if "directory.cns.utexas.edu" in src or "/files/" in src and "logo" not in src.lower():
            photo_url = urljoin(profile_url, src)
            break

    # Research summary: the Research bio plus the area/interest tag sections.
    bio = _cns_section(soup, {"Research", "Research Summary", "Research Statement"})
    tags = _cns_section(soup, {"Research Areas", "Fields of Interest",
                               "Research Interests", "Areas of Interest"})
    research_summary = " | ".join(p for p in (bio, tags) if p)[:1500]

    google_scholar = ""
    lab_website = ""
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.startswith("http"):
            continue
        if "scholar.google" in href and not google_scholar:
            google_scholar = href
        elif not lab_website and not any(s in href for s in _UT_EXT_LINK_SKIP):
            lab_website = href

    return {
        "name":             name,
        "title":            title,
        "department":       ut_dept_from_host(profile_url),
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           office,
    }


def _extract_ut_cs_profile(html: str, profile_url: str) -> dict:
    """Parse the UTCS theme (cs.utexas.edu/people/faculty-researchers/<slug>).

    Drupal-based: h1 name, position text right after the name, portrait under
    the `faculty_photo` image style, bio in `field--name-body`.
    """
    soup = BeautifulSoup(html, "html.parser")

    name = ""
    h1 = soup.find("h1")
    if h1:
        name = h1.get_text(" ", strip=True)
    if not name:
        name = profile_url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()

    title = ""
    if h1:
        for sib in h1.find_all_next():
            t = sib.get_text(" ", strip=True)
            if t:
                title = t[:160]
                break

    email = ""
    a = soup.find("a", href=lambda h: h and h.startswith("mailto:"))
    if a:
        email = a["href"].replace("mailto:", "").split("?")[0].strip()

    photo_url = ""
    for img in soup.find_all("img"):
        src = img.get("src") or ""
        if "faculty_photo" in src or "/styles/" in src:
            photo_url = urljoin(profile_url, src.split("?")[0])
            break

    body = soup.find(class_=lambda c: c and "field--name-body" in c)
    research_summary = ""
    if body:
        research_summary = re.sub(r"\s+", " ", body.get_text(" ", strip=True)).strip()
    if not research_summary:
        research_summary = _extract_research_summary(soup)
    research_summary = research_summary[:1500]

    google_scholar = ""
    lab_website = ""
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.startswith("http"):
            continue
        if "scholar.google" in href and not google_scholar:
            google_scholar = href
        elif not lab_website and not any(s in href for s in _UT_EXT_LINK_SKIP):
            lab_website = href

    return {
        "name":             name,
        "title":            title,
        "department":       "cse",
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            "",
        "office":           "",
    }


# Most arts-&-sciences departments render "Alan Pepper", but some (atmospheric
# sciences, geology) render "Pepper, Alan". Left alone, the reversed form shows
# up on cards and in prerendered page titles.
_SURNAME_FIRST_RE = re.compile(
    r"^([A-Z][\w'’\-.]+(?: [A-Z][\w'’\-.]+){0,2}), ([A-Z][\w'’\-.]+(?: .+)?)$")


def _flip_surname_first(name: str) -> str:
    """Turn 'Pepper, Alan' into 'Alan Pepper'; leave anything else alone."""
    m = _SURNAME_FIRST_RE.match((name or "").strip())
    return f"{m.group(2)} {m.group(1)}" if m else (name or "").strip()


def _extract_artsci_profile(html: str, profile_url: str) -> dict:
    """Parse an Arts & Sciences faculty profile page."""
    soup = BeautifulSoup(html, "html.parser")

    # ---- Name ---------------------------------------------------------------
    name = ""
    h1 = soup.find("h1")
    if h1:
        name = _flip_surname_first(h1.get_text(" ", strip=True))

    # ---- Title / rank -------------------------------------------------------
    title = ""
    titles_el = soup.select_one(".profile__titles li")
    if titles_el:
        title = titles_el.get_text(" ", strip=True)

    # ---- Contact info (email, phone, office, website) -----------------------
    email = ""
    phone = ""
    office = ""
    lab_website = ""

    for li in soup.select(".profile__contact li"):
        label_el = li.select_one(".profile__contact-label")
        label_text = label_el.get_text(strip=True).lower() if label_el else ""

        if "email" in label_text:
            mailto = li.find("a", href=re.compile(r"^mailto:", re.I))
            if mailto:
                email = mailto["href"].replace("mailto:", "").strip()
            elif not email:
                # fallback to text
                value = li.get_text(strip=True)
                if label_el:
                    value = value.replace(label_el.get_text(strip=True), "").strip()
                m = _EMAIL_RE.search(value)
                if m:
                    email = m.group()
        elif "phone" in label_text:
            value = li.get_text(strip=True)
            if label_el:
                value = value.replace(label_el.get_text(strip=True), "").strip()
            phone = value
        elif "office" in label_text:
            value = li.get_text(strip=True)
            if label_el:
                value = value.replace(label_el.get_text(strip=True), "").strip()
            office = value
        elif not label_text:
            # No label — check for external website link
            a = li.find("a", href=re.compile(r"^http", re.I))
            if a:
                href = a["href"]
                if "tamu.edu" not in href and "scholar.google" not in href:
                    lab_website = href

    # ---- Google Scholar -----------------------------------------------------
    google_scholar = ""
    scholar_a = soup.find("a", href=re.compile(r"scholar\.google\.com"))
    if scholar_a:
        google_scholar = scholar_a["href"]

    # ---- Photo --------------------------------------------------------------
    photo_url = ""
    for sel in (".profile__image img", ".profile img"):
        img = soup.select_one(sel)
        if img and img.get("src"):
            photo_url = urljoin(profile_url, img["src"])
            break

    # ---- Research summary ---------------------------------------------------
    research_summary = _extract_research_summary(soup)

    # ---- Lab website fallback (same blocklist logic) ------------------------
    _SOCIAL_BLOCKLIST = ("linkedin.com", "facebook.com", "youtube.com",
                         "twitter.com", "instagram.com", "tiktok.com")
    if not lab_website:
        for a in soup.find_all("a", href=True):
            link_text = a.get_text(strip=True)
            href = a["href"]
            if not href or href.startswith("mailto:") or href.startswith("#"):
                continue
            if any(domain in href.lower() for domain in _SOCIAL_BLOCKLIST):
                continue
            if _LAB_LINK_RE.search(link_text):
                lab_website = href if href.startswith("http") else urljoin(profile_url, href)
                break

    return {
        "name":             name,
        "title":            title,
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           office,
    }


def _extract_engineering_profile(html: str, profile_url: str) -> dict:
    """Parse an Engineering faculty profile page."""
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
    # TAMU engineering profiles use .profile__titles (same as artsci)
    title = ""
    titles_el = soup.select_one(".profile__titles li")
    if not titles_el:
        titles_el = soup.select_one(".profile__titles")
    if titles_el:
        title = titles_el.get_text(" ", strip=True)
    # Fallback: old-style selectors
    if not title:
        for sel in (".main-profile-info .title", ".main-profile-info h2",
                    ".profile-header .title", ".field-name-field-title"):
            el = soup.select_one(sel)
            if el:
                candidate = el.get_text(" ", strip=True)
                if _TITLE_RE.search(candidate) and len(candidate) < 200:
                    title = candidate
                    break
    if not title:
        for cls in ("faculty-title", "profile-title", "title", "position", "rank"):
            el = soup.find(class_=cls)
            if el:
                candidate = el.get_text(" ", strip=True)
                if _TITLE_RE.search(candidate) and len(candidate) < 200:
                    title = candidate
                    break

    # ---- Contact info via .profile__contact (TAMU unified template) ---------
    email = ""
    phone = ""
    office = ""
    lab_website_from_contact = ""

    for li in soup.select(".profile__contact li"):
        label_el = li.select_one(".profile__contact-label")
        label_text = label_el.get_text(strip=True).lower() if label_el else ""

        if "email" in label_text:
            mailto = li.find("a", href=re.compile(r"^mailto:", re.I))
            if mailto:
                email = mailto["href"].replace("mailto:", "").strip()
            elif not email:
                value = li.get_text(strip=True)
                if label_el:
                    value = value.replace(label_el.get_text(strip=True), "").strip()
                m = _EMAIL_RE.search(value)
                if m:
                    email = m.group()
        elif "phone" in label_text:
            value = li.get_text(strip=True)
            if label_el:
                value = value.replace(label_el.get_text(strip=True), "").strip()
            phone = value
        elif "office" in label_text:
            value = li.get_text(strip=True)
            if label_el:
                value = value.replace(label_el.get_text(strip=True), "").strip()
            office = value
        elif "website" in label_text or not label_text:
            a = li.find("a", href=re.compile(r"^http", re.I))
            if a:
                href = a["href"]
                if "tamu.edu" not in href and "scholar.google" not in href:
                    lab_website_from_contact = href

    # Fallback email extraction
    if not email:
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

    # Fallback phone extraction
    if not phone:
        tel_a = soup.find("a", href=re.compile(r"^tel:", re.I))
        if tel_a:
            phone = tel_a["href"].replace("tel:", "").strip()

    # Fallback office extraction
    if not office:
        for sel in (".office", ".location", ".field-name-field-office"):
            el = soup.select_one(sel)
            if el:
                office = el.get_text(" ", strip=True)
                break
        if not office:
            for el in soup.find_all(["dt", "strong", "b"]):
                if re.search(r"(office|location)", el.get_text(strip=True), re.I):
                    nxt = el.find_next_sibling()
                    if nxt:
                        office = nxt.get_text(" ", strip=True)
                        break

    # ---- Research summary ---------------------------------------------------
    research_summary = _extract_research_summary(soup)

    # ---- Lab website --------------------------------------------------------
    _SOCIAL_BLOCKLIST = ("linkedin.com", "facebook.com", "youtube.com",
                         "twitter.com", "instagram.com", "tiktok.com")
    lab_website = lab_website_from_contact
    if not lab_website:
        for a in soup.find_all("a", href=True):
            link_text = a.get_text(strip=True)
            href = a["href"]
            if not href or href.startswith("mailto:") or href.startswith("#"):
                continue
            if any(domain in href.lower() for domain in _SOCIAL_BLOCKLIST):
                continue
            if _LAB_LINK_RE.search(link_text):
                lab_website = href if href.startswith("http") else urljoin(profile_url or "https://engineering.tamu.edu", href)
                break
            # External links near research keywords
            if href.startswith("http") and "tamu.edu" not in href:
                if any(kw in link_text.lower() for kw in ("lab", "group", "research")):
                    lab_website = href
                    break

    # ---- Google Scholar -----------------------------------------------------
    google_scholar = ""
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "scholar.google.com" in href:
            google_scholar = href
            break

    # ---- Photo --------------------------------------------------------------
    photo_url = ""
    for sel in (".profile__image img", ".main-profile-info img", ".profile-photo img",
                ".field-name-field-image img", ".profile-image img",
                ".photo img", "img.profile"):
        img = soup.select_one(sel)
        if img and img.get("src"):
            src = img["src"]
            # Skip tracking pixels and SVG logos
            if "facebook.com" in src or src.endswith(".svg"):
                continue
            photo_url = urljoin(profile_url or "https://engineering.tamu.edu", src)
            break

    return {
        "name":             name,
        "title":            title,
        "email":            email,
        "research_summary": research_summary,
        "lab_website":      lab_website,
        "google_scholar":   google_scholar,
        "photo_url":        photo_url,
        "phone":            phone,
        "office":           office,
    }


# ---------------------------------------------------------------------------
# Main crawl routine
# ---------------------------------------------------------------------------

async def _collect_ut_directory_links(page, seed_url: str, max_pages: int = 30) -> list[str]:
    """Collect every faculty profile link from a UT directory, clicking through
    the client-side "Next" pagination (no URL change) that the Cockrell sites
    use. ECE/ME directories have no pagination, so the loop returns after one
    pass. Also gives lazy-loaded lists (e.g. pge) time to populate.

    Runs in a dedicated clean context: the main crawl context forces
    `Sec-Fetch-Site: none` on every request, which breaks the same-origin XHR
    that CNS directory pages use to lazy-load their faculty cards (the browser
    must set Sec-Fetch per-request). A plain context lets it do that.
    """
    ctx = await page.context.browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0",
    )
    dpage = await ctx.new_page()
    try:
        return await _collect_ut_directory_links_inner(dpage, seed_url, max_pages)
    finally:
        await ctx.close()


async def _collect_ut_directory_links_inner(page, seed_url, max_pages) -> list[str]:
    # `domcontentloaded` (not networkidle): CNS sites keep background
    # connections open, so networkidle never fires and the goto would throw.
    try:
        await page.goto(seed_url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
    except Exception as exc:
        print(f"  [error] directory load failed: {exc}")
        return []
    # Wait for actual profile-card anchors to materialize — directories
    # lazy-load their lists well after the document is ready.
    link_sel = ("a[href*='/person/'], a[href*='/people/faculty'], "
                "a[href*='/faculty-and-staff/'], a[href*='/directory/']")
    try:
        await page.wait_for_selector(link_sel, timeout=20_000)
    except PlaywrightTimeout:
        await page.wait_for_timeout(2500)  # last-ditch settle before giving up
    await page.wait_for_timeout(800)  # let the rest of the list settle

    all_links: set[str] = set()
    for _ in range(max_pages):
        before = len(all_links)
        for link in extract_profile_links(await page.content(), seed_url):
            all_links.add(link)
        # Click an enabled "Next" control if one exists.
        clicked = await page.evaluate(
            """() => {
                const cands = [...document.querySelectorAll(
                    'a[rel=next], button, a')];
                const nxt = cands.find(e => {
                    const t = (e.textContent || '').trim();
                    const al = (e.getAttribute('aria-label') || '');
                    const isNext = /^next\\b/i.test(t) || /next/i.test(al) ||
                                   e.getAttribute('rel') === 'next';
                    const disabled = e.disabled ||
                        e.getAttribute('aria-disabled') === 'true' ||
                        /disabled/i.test(e.className);
                    return isNext && !disabled && e.offsetParent !== null;
                });
                if (nxt) { nxt.click(); return true; }
                return false;
            }"""
        )
        if not clicked:
            break
        await page.wait_for_timeout(1200)
        for link in extract_profile_links(await page.content(), seed_url):
            all_links.add(link)
        if len(all_links) == before:   # pagination didn't yield anything new
            break
    return sorted(all_links)


async def crawl(seed_urls: list[str], university: str = "tamu", limit: int = 0) -> list[dict]:
    all_records: list[dict] = []
    seen_profile_urls: set[str] = set()

    async with async_playwright() as pw:
        # `--disable-blink-features=AutomationControlled` plus realistic
        # Sec-Fetch headers are required for Rice's CDN to return profile
        # HTML instead of a 406. The user-agent keeps the bot identifier as
        # a suffix so curious admins can still see who's hitting them.
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
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
            },
        )
        page = await context.new_page()

        for seed_url in seed_urls:
            print(f"\n[directory] {seed_url}")

            # UT directories paginate client-side ("Next" button, no URL change)
            # and lazy-load cards, so collect links by walking the live DOM
            # across pages rather than from a single fetch_html() snapshot.
            if is_ut_url(seed_url):
                profile_links = await _collect_ut_directory_links(page, seed_url)
            else:
                html = await fetch_html(page, seed_url)
                if html is None:
                    print("  Skipping — could not load directory page.")
                    continue

                # Arts & Sciences pages may load profiles dynamically
                if is_artsci_url(seed_url) and _load_cache(seed_url) is None:
                    # Wait for profile links to appear
                    for sel in ('a[href*="/profiles/"]', '.directory', '.profile'):
                        try:
                            await page.wait_for_selector(sel, timeout=10_000)
                            break
                        except PlaywrightTimeout:
                            continue
                    await asyncio.sleep(3)  # Extra render time
                    html = await page.content()
                    _save_cache(seed_url, html)

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

                fields = extract_profile_fields(phtml, profile_url)

                # CNS directories list everyone; keep only faculty.
                if is_ut_cns_url(profile_url) and not _UT_CNS_FACULTY_RE.search(
                        fields.get("title", "")):
                    print(f"    [skip non-faculty] {fields.get('name')!r} "
                          f"({fields.get('title','')[:30]!r})")
                    continue

                # For Rice, the profile-derived department overrides the URL
                # placeholder. Use the effective slug for the AI review prompt
                # so it isn't told "rice-unknown".
                effective_dept = fields.get("department") or dept_slug

                # Generate AI review
                ai_review = generate_ai_review(
                    fields["name"], effective_dept, fields["research_summary"]
                )

                record = {
                    "id":          hashlib.md5(profile_url.encode()).hexdigest()[:12],
                    "university":  university,
                    "profile_url": profile_url,
                    "department":  dept_slug,
                    **fields,
                    "ai_review":         ai_review,
                    "scholar_interests": [],
                    "publications":      [],
                }
                all_records.append(record)
                print(f"    name={record['name']!r}  dept={record.get('department')!r}")

                if limit and len(all_records) >= limit:
                    print(f"\nReached limit of {limit} record(s) — stopping early.")
                    save_outputs(all_records)
                    await browser.close()
                    return all_records

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
    parser.add_argument(
        "--university",
        default="tamu",
        help="University code stamped on every emitted record (default: tamu). "
             "Use lowercase short codes like 'tamu', 'rice', 'utaustin'.",
    )
    parser.add_argument(
        "--seeds",
        default="seeds.txt",
        help="Path to a seeds file (one URL per line, # for comments). "
             "Default: seeds.txt. For Rice, pass seeds-rice.txt.",
    )
    parser.add_argument(
        "--output",
        default="faculty",
        help="Output filename stem (default: 'faculty'). Writes <stem>.json + "
             "<stem>.csv. For Rice, use --output faculty-rice to avoid "
             "overwriting the TAMU dataset.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Stop after this many faculty records (0 = no limit). Useful "
             "for validating a new parser on a small sample.",
    )
    args = parser.parse_args()

    # Override module-level paths from CLI args
    global SEEDS_FILE, OUTPUT_JSON, OUTPUT_CSV
    SEEDS_FILE  = Path(args.seeds)
    OUTPUT_JSON = Path(f"{args.output}.json")
    OUTPUT_CSV  = Path(f"{args.output}.csv")

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

    print(f"Crawling {len(unique_seeds)} seed URL(s) for university={args.university} "
          f"(output: {OUTPUT_JSON.name}, limit: {args.limit or 'none'}) …")
    records = asyncio.run(crawl(unique_seeds, university=args.university, limit=args.limit))

    if records:
        save_outputs(records)
    else:
        print("No records collected.")


if __name__ == "__main__":
    main()
