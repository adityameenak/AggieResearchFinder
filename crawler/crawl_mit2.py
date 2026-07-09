#!/usr/bin/env python3
"""
MIT STEM faculty crawler — all departments beyond EECS (see crawl_mit.py).

Covers 12 more departments across MIT's School of Engineering and School of
Science, each on its own WordPress/Drupal/legacy site with different markup.
Per-department "collectors" find the faculty roster + profile URLs; a shared
generic profile parser (WordPress-family sites) extracts photo, email,
research summary, and lab/Scholar links. NSE ships a JSON API that needs no
profile fetch; Mechanical Engineering (Drupal), Math (legacy HTML), and BCS
(Drupal, client-rendered listing — needs Playwright) get dedicated parsers.

Usage:
  python crawl_mit2.py                        # all 12 departments
  python crawl_mit2.py --dept dmse,nse         # just these
  python crawl_mit2.py --limit 5 --dept cheme  # smoke test
  python crawl_mit2.py --output faculty-mit2
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

FACULTY_TITLE_RE = re.compile(r"\bprofessor\b", re.IGNORECASE)
EMERITUS_RE = re.compile(r"emerit", re.IGNORECASE)
RESEARCH_HEADING_RE = re.compile(r"research", re.IGNORECASE)

SKIP_LINK_HOST_RE = re.compile(
    r"(facebook|twitter|x\.com|linkedin|instagram|youtube|wikipedia|"
    r"doi\.org|orcid|whereis\.mit\.edu|web\.mit\.edu|vimeo|bsky\.app|"
    r"researchgate|maps\.google|giving\.mit\.edu|alum|mitalumni|news\.mit\.edu|"
    r"pubmed|ncbi\.nlm\.nih\.gov)",
    re.IGNORECASE,
)

# department slug -> ui/src/utils/search.js DEPT_DISPLAY key
DEPT_MAP = {
    "aeroastro":  "aerospace",
    "cheme":      "chemical",
    "cee":        "civil",
    "dmse":       "materials",
    "nse":        "nuclear",
    "be":         "bioengineering",
    "meche":      "mechanical",
    "biology":    "biology",
    "bcs":        "brain-cognitive-sciences",
    "chemistry":  "chemistry",
    "eaps":       "earth-atmospheric-planetary",
    "math":       "mathematics",
    "physics":    "physics-astronomy",
}


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def get(s: requests.Session, url: str, **kw) -> Optional[requests.Response]:
    try:
        r = s.get(url, timeout=30, **kw)
        if r.status_code != 200:
            print(f"    HTTP {r.status_code}: {url}")
            return None
        return r
    except Exception as exc:
        print(f"    error fetching {url}: {exc}")
        return None


def clean_text(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------------------
# Generic helpers shared by the WordPress-family department sites
# ---------------------------------------------------------------------------

def strip_chrome(soup: BeautifulSoup) -> BeautifulSoup:
    # Only strip navigation/scripts/site footer — some sites (e.g. ChemE) wrap
    # the actual profile content (photo, email, room) in a semantic <header>
    # for the <article>, so a blanket <header> removal would eat real data.
    for tag in soup.find_all(["nav", "script", "style"]):
        tag.decompose()
    for tag in soup.find_all("footer"):
        if not tag.find("a", href=re.compile(r"^mailto:")):
            tag.decompose()
    return soup


def collect_heading_section(heading_tag) -> str:
    parts: list[str] = []
    taken: set[int] = set()
    for el in heading_tag.find_all_next():
        if el.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            break
        if el.name not in ("p", "li", "div", "span", "td", "blockquote"):
            continue
        if any(id(anc) in taken for anc in el.parents):
            continue
        t = el.get_text(" ", strip=True)
        if t:
            parts.append(t)
            taken.add(id(el))
        if sum(len(p) for p in parts) > 1200:
            break
    return clean_text(" ".join(parts))


def generic_research_summary(soup: BeautifulSoup) -> str:
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "strong", "b"]):
        text = heading.get_text(strip=True)
        if RESEARCH_HEADING_RE.search(text) and "related" not in text.lower():
            summary = collect_heading_section(heading)
            if len(summary) > 40:
                return summary[:1200]

    for cls in ("profile-desc-content", "page-content", "profile-content",
                "cheme-profile-content", "gutenberg-body"):
        el = soup.find(class_=re.compile(re.escape(cls), re.I))
        if el:
            text = clean_text(el.get_text(" ", strip=True))
            if len(text) > 60:
                return text[:1200]

    candidates = [
        clean_text(p.get_text(" ", strip=True))
        for p in soup.find_all("p")
        if len(p.get_text(strip=True)) > 100
    ]
    if candidates:
        return max(candidates, key=len)[:1200]
    return ""


def generic_photo(soup: BeautifulSoup, base_url: str) -> str:
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        return og["content"].strip()

    def first_img_in(elements) -> str:
        for el in elements:
            img = el if el.name == "img" else el.find("img")
            if img and img.get("src") and "logo" not in img["src"].lower():
                src = img["src"]
                if src.startswith("//"):
                    return "https:" + src
                if src.startswith("/"):
                    parsed = urlparse(base_url)
                    return f"{parsed.scheme}://{parsed.netloc}{src}"
                return src
        return ""

    h1 = soup.find("h1")
    if h1:
        found = first_img_in(h1.find_all_previous(["picture", "figure", "img"], limit=10))
        if found:
            return found
        found = first_img_in(h1.find_all_next(["picture", "figure", "img"], limit=10))
        if found:
            return found
    return first_img_in(soup.find_all(["picture", "figure", "img"], limit=10))


def generic_name_title(soup: BeautifulSoup) -> tuple[str, str]:
    h1 = soup.find("h1")
    if not h1:
        return "", ""
    name = clean_text(h1.get_text(" ", strip=True))
    for el in h1.find_all_next(limit=15):
        if el.name not in ("div", "p", "h2", "span"):
            continue
        classes = " ".join(el.get("class", []) or [])
        if re.search(r"title", classes, re.I):
            t = clean_text(el.get_text(" ", strip=True))
            if t:
                return name, t
    return name, ""


def generic_email(soup: BeautifulSoup) -> str:
    a = soup.find("a", href=re.compile(r"^mailto:", re.I))
    if a:
        return a["href"].split(":", 1)[1].split("?")[0].strip()
    return ""


def generic_lab_scholar(soup: BeautifulSoup, own_host: str) -> tuple[str, str]:
    lab, scholar = "", ""
    lab_el = soup.find("a", class_=re.compile(r"lab-website", re.I))
    if lab_el and lab_el.get("href"):
        lab = lab_el["href"].strip()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith(("mailto:", "tel:", "#", "javascript:")):
            continue
        if "scholar.google" in href and not scholar:
            scholar = href
            continue
        if lab:
            continue
        host = urlparse(href).netloc
        if not host or host == own_host or SKIP_LINK_HOST_RE.search(host):
            continue
        lab = href
    return lab, scholar


def parse_generic_profile(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    own_host = urlparse(url).netloc
    strip_chrome(soup)
    name, title = generic_name_title(soup)
    lab, scholar = generic_lab_scholar(soup, own_host)
    return {
        "name":             name,
        "title":            title,
        "photo_url":        generic_photo(soup, url),
        "email":            generic_email(soup),
        "research_summary": generic_research_summary(soup),
        "lab_website":      lab,
        "google_scholar":   scholar,
    }


def make_record(name: str, title: str, dept: str, profile_url: str, **extra) -> dict:
    rec = {
        "id":               hashlib.md5(profile_url.encode()).hexdigest()[:12],
        "university":       "mit",
        "name":             name,
        "title":            title,
        "department":       DEPT_MAP[dept],
        "email":            "",
        "profile_url":      profile_url,
        "research_summary": "",
        "lab_website":      "",
        "google_scholar":   "",
        "ai_review":        "",
        "photo_url":        "",
        "phone":            "",
        "office":           "",
        "scholar_interests": [],
        "publications":      [],
    }
    rec.update(extra)
    return rec


def is_faculty_title(title: str) -> bool:
    return bool(FACULTY_TITLE_RE.search(title)) and not EMERITUS_RE.search(title)


# ---------------------------------------------------------------------------
# Per-department listing collectors -> list of dicts with at least
# name/title/profile_url (email/photo/research_summary optional; filled by
# enrich_from_profile() unless the collector marks the record "complete").
# ---------------------------------------------------------------------------

def collect_aeroastro(s: requests.Session) -> list[dict]:
    out = []
    seen = set()
    page = 1
    while page <= 30:
        url = "https://aeroastro.mit.edu/people/" if page == 1 else f"https://aeroastro.mit.edu/people/page/{page}/"
        r = get(s, url)
        if not r:
            break
        soup = BeautifulSoup(r.text, "html.parser")
        for tr in soup.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 3:
                continue
            a = tds[0].find("a", href=True)
            category = clean_text(tds[2].get_text(" ", strip=True))
            if not a or "Faculty" not in category or a["href"] in seen:
                continue
            title = clean_text(tds[1].get_text(" ", strip=True))
            if not is_faculty_title(title):
                continue
            seen.add(a["href"])
            out.append({"name": clean_text(a.get_text(" ", strip=True)),
                         "title": title, "profile_url": a["href"].strip()})
        has_next = soup.find("a", class_="next")
        if not has_next:
            break
        page += 1
        time.sleep(0.3)
    return out


def collect_cheme(s: requests.Session) -> list[dict]:
    r = get(s, "https://cheme.mit.edu/people/faculty/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for art in soup.find_all("article", class_=re.compile(r"\btype-profile\b")):
        classes = art.get("class", [])
        if "community-faculty" not in classes or "rank-emeriti" in classes:
            continue
        a = art.find("a", href=True)
        if not a:
            continue
        for svg in a.find_all("svg"):
            svg.decompose()
        title_div = art.find(class_="faculty-title")
        title = clean_text(title_div.get_text(" ", strip=True)) if title_div else ""
        out.append({"name": clean_text(a.get_text(" ", strip=True)),
                     "title": title, "profile_url": a["href"].strip()})
    return out


def collect_cee(s: requests.Session) -> list[dict]:
    r = get(s, "https://cee.mit.edu/people/directory/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        a = tds[0].find("a", href=True)
        if not a:
            continue
        title = clean_text(tds[1].get_text(" ", strip=True))
        email = clean_text(tds[2].get_text(" ", strip=True))
        if not is_faculty_title(title):
            continue
        out.append({"name": clean_text(a.get_text(" ", strip=True)), "title": title,
                     "email": email, "profile_url": a["href"].strip()})
    return out


def collect_dmse(s: requests.Session) -> list[dict]:
    r = get(s, "https://dmse.mit.edu/people/faculty/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for card in soup.find_all(class_="faculty-teaser"):
        a = card.find("a", href=True)
        if not a:
            continue
        name_el = card.find(class_="faculty-teaser__name")
        title_el = card.find(class_="faculty-teaser__title")
        name = clean_text(name_el.get_text(" ", strip=True)) if name_el else clean_text(a.get_text(" ", strip=True))
        title = clean_text(title_el.get_text(" ", strip=True)) if title_el else ""
        if title and not is_faculty_title(title):
            continue
        out.append({"name": name, "title": title, "profile_url": a["href"].strip()})
    return out


def collect_be(s: requests.Session) -> list[dict]:
    r = get(s, "https://be.mit.edu/directory/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    seen = set()
    for card in soup.find_all(class_="faculty-teaser"):
        a = card.find("a", class_="faculty-teaser__link", href=True) or card.find("a", href=True)
        if not a:
            continue
        url = a["href"].strip()
        if url in seen:
            continue
        seen.add(url)
        role_el = card.find(class_="faculty-teaser__roles")
        role = clean_text(role_el.get_text(" ", strip=True)) if role_el else ""
        if EMERITUS_RE.search(role):
            continue
        out.append({"name": clean_text(a.get_text(" ", strip=True)), "title": role,
                     "profile_url": url})
    return out


def collect_nse(s: requests.Session) -> list[dict]:
    r = get(s, "https://nse.mit.edu/wp-json/endpoints/v1/people/search/?people_type=faculty")
    if not r:
        return []
    try:
        data = r.json()
    except Exception:
        return []
    out = []
    for p in data.get("results", []):
        title_html = p.get("position") or ""
        title = clean_text(BeautifulSoup(re.sub(r"<br\s*/?>", "; ", title_html, flags=re.I),
                                          "html.parser").get_text(" ", strip=True))
        if EMERITUS_RE.search(title):
            continue
        ri_html = p.get("research_interests") or ""
        ri_text = clean_text(BeautifulSoup(ri_html, "html.parser").get_text(" ", strip=True))
        research_html = p.get("research") or ""
        research_text = clean_text(BeautifulSoup(research_html, "html.parser").get_text(" ", strip=True))
        interests = [clean_text(li.get_text(" ", strip=True))
                     for li in BeautifulSoup(ri_html, "html.parser").find_all("li")]
        scholar, lab = "", ""
        for link in p.get("external_links") or []:
            lu = (link.get("link") or {}).get("url", "")
            if not lu:
                continue
            if "scholar.google" in lu and not scholar:
                scholar = lu
            elif not lab:
                lab = lu
        photo = (p.get("thumbnails") or {}).get("full") or (p.get("thumbnails") or {}).get("large", "")
        summary = (research_text or ri_text)[:1200]
        out.append({
            "name": p.get("title") or p.get("wp_title", ""),
            "title": title,
            "email": p.get("email", "") or "",
            "phone": p.get("phone", "") or "",
            "office": p.get("office", "") or "",
            "profile_url": p.get("post_url", ""),
            "photo_url": photo or "",
            "research_summary": summary,
            "scholar_interests": interests,
            "lab_website": lab,
            "google_scholar": scholar,
            "complete": True,
        })
    return out


def collect_biology(s: requests.Session) -> list[dict]:
    r = get(s, "https://biology.mit.edu/people/faculty/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    seen = set()
    for card in soup.find_all(class_="profile-item"):
        a = card.find("h3")
        a = a.find("a", href=True) if a else None
        if not a:
            continue
        url = a["href"].strip()
        if url in seen:
            continue
        seen.add(url)
        img = card.find("img")
        photo = img["src"].strip() if img and img.get("src") else ""
        out.append({"name": clean_text(a.get_text(" ", strip=True)), "title": "",
                     "profile_url": url, "photo_url": photo})
    return out


def collect_chemistry(s: requests.Session) -> list[dict]:
    r = get(s, "https://chemistry.mit.edu/faculty/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    seen = set()
    for a in soup.find_all("a", href=re.compile(r"https://chemistry\.mit\.edu/profile/[a-z0-9\-]+/?$", re.I)):
        url = a["href"].strip()
        if url in seen or not a.get_text(strip=True):
            continue
        seen.add(url)
        out.append({"name": clean_text(a.get_text(" ", strip=True)), "title": "", "profile_url": url})
    return out


def collect_physics(s: requests.Session) -> list[dict]:
    r = get(s, "https://physics.mit.edu/faculty/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    seen = set()
    for card in soup.find_all(class_="faculty-card"):
        a = card.find("h3")
        a = a.find("a", href=True) if a else None
        if not a:
            continue
        url = a["href"].strip()
        if url in seen:
            continue
        seen.add(url)
        title_el = card.find(class_="faculty-card__job-title")
        title = clean_text(title_el.get_text(" ", strip=True)) if title_el else ""
        if title and not is_faculty_title(title):
            continue
        out.append({"name": clean_text(a.get_text(" ", strip=True)), "title": title, "profile_url": url})
    return out


def collect_eaps(s: requests.Session) -> list[dict]:
    r = get(s, "https://eaps.mit.edu/people/faculty/")
    if not r:
        return []
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    seen = set()
    for card in soup.find_all(class_="faculty-tease"):
        a = card.find("a", class_="faculty-tease__link", href=True)
        h3 = card.find("h3")
        if not a or not h3:
            continue
        url = a["href"].strip()
        if url in seen:
            continue
        seen.add(url)
        for svg in h3.find_all("svg"):
            svg.decompose()
        role_el = card.find(class_="faculty-tease__role")
        title = clean_text(role_el.get_text(" ", strip=True)) if role_el else ""
        if title and not is_faculty_title(title):
            continue
        out.append({"name": clean_text(h3.get_text(" ", strip=True)), "title": title, "profile_url": url})
    return out


def collect_meche(s: requests.Session) -> list[dict]:
    out = []
    seen = set()
    for rng in ("ad", "eh", "il", "mp", "qt", "uz"):
        r = get(s, f"https://meche.mit.edu/people/all/{rng}")
        if not r:
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.find_all("a", href=re.compile(r"^/people/faculty/")):
            url = "https://meche.mit.edu" + a["href"].strip()
            if url in seen:
                continue
            seen.add(url)
            name_span = a.find("span", class_="name")
            title_span = a.find("span", class_="title")
            name = clean_text(name_span.get_text(" ", strip=True)) if name_span else clean_text(a.get_text(" ", strip=True))
            if "," in name:
                last, _, first = name.partition(",")
                name = f"{clean_text(first)} {clean_text(last)}"
            title = clean_text(title_span.get_text(" ", strip=True)) if title_span else ""
            if not is_faculty_title(title):
                continue
            out.append({"name": name, "title": title, "profile_url": url})
        time.sleep(0.3)
    return out


def parse_meche_profile(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    strip_chrome(soup)
    email = generic_email(soup)
    img = soup.find("img", class_=re.compile(r"\bbg-img\b"))
    photo = img["src"].strip() if img and img.get("src") else ""
    interests = []
    interests_h = soup.find("h3", string=re.compile(r"^\s*Interests\s*$", re.I))
    if interests_h:
        ol = interests_h.find_next("ol")
        if ol:
            interests = [clean_text(li.get_text(" ", strip=True)) for li in ol.find_all("li")]
    summary = "Research interests: " + ", ".join(interests) if interests else generic_research_summary(soup)
    lab, scholar = generic_lab_scholar(soup, urlparse(url).netloc)
    return {"email": email, "photo_url": photo, "research_summary": summary[:1200],
            "scholar_interests": interests, "lab_website": lab, "google_scholar": scholar}


def collect_math(s: requests.Session) -> list[dict]:
    out = []
    for rank_page in ("professors.html", "associate.html", "assistant.html"):
        r = get(s, f"https://math.mit.edu/directory/faculty/{rank_page}")
        if not r:
            continue
        soup = BeautifulSoup(r.text, "html.parser")
        for person in soup.find_all(class_="person"):
            a = person.find("a", href=re.compile(r"profile\.html\?pid="))
            if not a:
                continue
            title_lines = [clean_text(p.get_text(" ", strip=True))
                            for p in person.select(".title p")]
            title = "; ".join(t for t in title_lines if t)
            name = clean_text(a.get_text(" ", strip=True))
            if "," in name:
                last, _, first = name.partition(",")
                name = f"{clean_text(first)} {clean_text(last)}"
            out.append({
                "name": name,
                "title": title,
                "profile_url": "https://math.mit.edu" + a["href"].strip(),
            })
        time.sleep(0.3)
    return out


def parse_math_profile(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    email = ""
    email_a = soup.find("a", class_="email-hidden")
    if email_a and email_a.get("data-email"):
        try:
            import base64
            email = base64.b64decode(email_a["data-email"]).decode("utf-8", "ignore").strip()
        except Exception:
            email = ""
    img = soup.find(class_="photo")
    img = img.find("img") if img else None
    photo = ""
    if img and img.get("src"):
        src = img["src"].strip()
        photo = src if src.startswith("http") else "https://math.mit.edu" + src

    interests = []
    research_div = soup.find(class_="research")
    summary = ""
    if research_div:
        blurb = research_div.find("p")
        summary = clean_text(blurb.get_text(" ", strip=True)) if blurb else ""
        interests = [clean_text(li.get_text(" ", strip=True)) for li in research_div.find_all("li")]

    bio_div = soup.find(class_="bio")
    if bio_div:
        bio_p = bio_div.find("p")
        if bio_p:
            bio_text = clean_text(bio_p.get_text(" ", strip=True))
            summary = (summary + " " + bio_text).strip() if summary else bio_text

    lab = ""
    links_div = soup.find(class_="links")
    if links_div:
        for a in links_div.find_all("a", href=True):
            if "Home Site" in a.get_text() or "home" in a.get_text(strip=True).lower():
                lab = a["href"].strip()
                break

    return {"email": email, "photo_url": photo, "research_summary": summary[:1200],
            "scholar_interests": interests, "lab_website": lab, "google_scholar": ""}


async def _fetch_bcs_listing_js() -> list[str]:
    from playwright.async_api import async_playwright
    urls: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(user_agent=HEADERS["User-Agent"])
        await page.goto("https://bcs.mit.edu/faculty", wait_until="networkidle", timeout=45000)
        hrefs = await page.eval_on_selector_all(
            "a[href^='/directory/']", "els => els.map(e => e.getAttribute('href'))"
        )
        seen = set()
        for h in hrefs:
            if h and h not in seen and "field_area_of_research" not in h:
                seen.add(h)
                urls.append("https://bcs.mit.edu" + h)
        await browser.close()
    return urls


def collect_bcs(s: requests.Session) -> list[dict]:
    try:
        urls = asyncio.run(_fetch_bcs_listing_js())
    except Exception as exc:
        print(f"    [bcs] Playwright listing fetch failed: {exc}")
        return []
    return [{"name": "", "title": "", "profile_url": u} for u in urls]


def parse_bcs_profile(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")

    def field_text(slug: str) -> str:
        el = soup.find(class_=re.compile(r"field--name-" + re.escape(slug) + r"\b"))
        if not el:
            return ""
        item = el.find(class_="field__item")
        return clean_text((item or el).get_text(" ", strip=True))

    first = field_text("field-first-name")
    last = field_text("field-last-name")
    name = clean_text(f"{first} {last}") if (first or last) else ""
    title = field_text("field-primary-job-title") or field_text("field-job-title")
    email_el = soup.find(class_=re.compile(r"field--name-field-email"))
    email = ""
    if email_el:
        a = email_el.find("a", href=re.compile(r"^mailto:"))
        if a:
            email = a["href"].split(":", 1)[1].strip()
    photo = ""
    photo_el = soup.find(class_=re.compile(r"field--name-field-photo"))
    if photo_el:
        img = photo_el.find("img")
        if img and img.get("src"):
            src = img["src"].strip()
            photo = src if src.startswith("http") else "https://bcs.mit.edu" + src
    summary = field_text("field-research") or field_text("field-about")
    lab, scholar = generic_lab_scholar(soup, "bcs.mit.edu")
    return {"name": name, "title": title, "email": email, "photo_url": photo,
            "research_summary": summary[:1200], "lab_website": lab, "google_scholar": scholar}


COLLECTORS = {
    "aeroastro": collect_aeroastro,
    "cheme":     collect_cheme,
    "cee":       collect_cee,
    "dmse":      collect_dmse,
    "be":        collect_be,
    "nse":       collect_nse,
    "biology":   collect_biology,
    "chemistry": collect_chemistry,
    "physics":   collect_physics,
    "eaps":      collect_eaps,
    "meche":     collect_meche,
    "math":      collect_math,
    "bcs":       collect_bcs,
}

# Departments needing a bespoke profile parser instead of parse_generic_profile
CUSTOM_PROFILE_PARSERS = {
    "meche": parse_meche_profile,
    "math":  parse_math_profile,
    "bcs":   parse_bcs_profile,
}


def crawl_department(s: requests.Session, dept: str, limit: int = 0) -> list[dict]:
    print(f"\n=== {dept} ===")
    listing = COLLECTORS[dept](s)
    print(f"  {len(listing)} candidate faculty")
    records = []
    for i, entry in enumerate(listing, 1):
        if limit and len(records) >= limit:
            break
        name = entry.get("name", "")
        title = entry.get("title", "")
        profile_url = entry["profile_url"]

        if entry.get("complete"):
            if title and not is_faculty_title(title):
                continue
            rec = make_record(name, title, dept, profile_url,
                               email=entry.get("email", ""),
                               phone=entry.get("phone", ""),
                               office=entry.get("office", ""),
                               photo_url=entry.get("photo_url", ""),
                               research_summary=entry.get("research_summary", ""),
                               scholar_interests=entry.get("scholar_interests", []),
                               lab_website=entry.get("lab_website", ""),
                               google_scholar=entry.get("google_scholar", ""))
            records.append(rec)
            print(f"  [{i}/{len(listing)}] + {name} -- {len(records)} kept")
            continue

        r = get(s, profile_url)
        if not r:
            continue
        parser = CUSTOM_PROFILE_PARSERS.get(dept, parse_generic_profile)
        fields = parser(r.text, profile_url)

        if not name:
            name = fields.get("name", "")
        if not title:
            title = fields.get("title", "")
        if not is_faculty_title(title):
            print(f"  [{i}/{len(listing)}] skip (not faculty rank): {name} — {title!r}")
            time.sleep(0.3)
            continue

        rec = make_record(name, title, dept, profile_url,
                           email=entry.get("email") or fields.get("email", ""),
                           photo_url=entry.get("photo_url") or fields.get("photo_url", ""),
                           research_summary=fields.get("research_summary", ""),
                           scholar_interests=fields.get("scholar_interests", []),
                           lab_website=fields.get("lab_website", ""),
                           google_scholar=fields.get("google_scholar", ""))
        records.append(rec)
        print(f"  [{i}/{len(listing)}] + {name} -- {len(records)} kept")
        time.sleep(0.3)
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
    print(f"\nWrote {len(records)} records -> {stem}.json / {stem}.csv")


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--output", default="faculty-mit2")
    ap.add_argument("--dept", default="",
                     help="Comma-separated subset of: " + ",".join(COLLECTORS))
    ap.add_argument("--limit", type=int, default=0,
                     help="Stop each department after N records (smoke test).")
    args = ap.parse_args()

    depts = [d.strip() for d in args.dept.split(",") if d.strip()] if args.dept else list(COLLECTORS)
    unknown = set(depts) - set(COLLECTORS)
    if unknown:
        print(f"Unknown department(s): {unknown}")
        sys.exit(1)

    s = session()
    all_records: list[dict] = []
    for dept in depts:
        try:
            all_records.extend(crawl_department(s, dept, limit=args.limit))
        except Exception as exc:
            print(f"  [{dept}] crawl failed: {exc}")

    if not all_records:
        print("No records collected.")
        sys.exit(1)
    write_outputs(all_records, args.output)


if __name__ == "__main__":
    main()
