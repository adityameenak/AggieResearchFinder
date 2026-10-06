#!/usr/bin/env python3
"""
UCLA STEM faculty crawler — Samueli engineering, the physical and life
sciences, psychology, public health and the medical school's basic-science
departments.

Like MIT, UCLA has no institution-wide faculty directory: every department
runs its own site. Unlike Michigan and Harvard, none of them sit behind a bot
challenge, so this is plain `requests` throughout.

  * Samueli Engineering is the exception to "every site is different": one
    WordPress AJAX feed (`load_seas_search_results`) serves all seven
    departments' rosters, split by appointment category. Only the categories
    that are research faculty (chair, vice-chair, ieo, core, in-residence,
    joint) are requested — adjunct, affiliate, emeriti and lecturer are not.
  * Everything else is a listing page plus profile pages. Each department is a
    `Dept` spec (listing URLs, the profile-link pattern, where name/title
    live) run through the shared card collector and profile parser below,
    which reuses crawl_mit2.py's WordPress-family helpers.

Faculty-rank filtering is crawl_mit2's: the title must contain "professor" and
must not say emeritus — the same curate-don't-dump bar as every other school.

`statistics.ucla.edu` serves an incomplete certificate chain that macOS
repairs and Python's bundled CA file does not, so `truststore` is injected to
verify against the OS trust store rather than turning verification off.

Usage:
  python crawl_ucla.py                         # every department
  python crawl_ucla.py --dept cs,chemistry     # just these
  python crawl_ucla.py --limit 5 --dept math   # smoke test
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:  # pragma: no cover - only statistics.ucla.edu needs it
    print("note: `pip install truststore` or statistics.ucla.edu will fail TLS")

from bs4 import BeautifulSoup

import crawl_mit2 as common
import requests

from crawl_mit2 import clean_text, session, write_outputs

DELAY = 0.4

RANK_RE = re.compile(r"\b(professor|lecturer|chair|scientist|researcher)\b", re.I)
CHAIR_RE = re.compile(r"\b(department |interim |vice[- ])?chair\b", re.I)
# "Office of the Chair" (Michigan MCDB's card label) and "Assistant to the
# Chair" are an office and a staff role, not someone holding the chair.
NOT_A_CHAIR_RE = re.compile(r"office of the chair|(assistant|aide|coordinator|manager) to the chair|chair'?s office", re.I)


# Clinical-series appointments (genetic counsellors, "Health Sciences Clinical
# Professor") sit in the basic-science departments too. The agreed scope is
# research faculty, so they are dropped like emeriti.
# "(courtesy)" marks someone whose home department is elsewhere — at Michigan
# EECS, usually another school entirely. They are listed under their home unit.
COURTESY_RE = re.compile(r"\(courtesy\)|courtesy (appointment|professor)", re.I)
CLINICAL_RE = re.compile(r"\bclinical\b(\s+\w+){0,2}\s+(professor|instructor)|health sciences clinical", re.I)


def is_faculty_title(title: str) -> bool:
    """crawl_mit2's rule, plus department chairs, minus the clinical series.

    A card that only says "Interim Chair" (Pharmacology) is still the
    professor running the department; the rank just isn't printed.
    """
    if CLINICAL_RE.search(title or "") or COURTESY_RE.search(title or ""):
        return False
    if common.is_faculty_title(title):
        return True
    return (bool(CHAIR_RE.search(title or "")) and not NOT_A_CHAIR_RE.search(title or "")
            and not common.EMERITUS_RE.search(title or ""))


def looks_like_title(t: str) -> bool:
    return bool(t) and len(t) < 200 and bool(RANK_RE.search(t)) and not NOT_A_CHAIR_RE.search(t)

def get(s, url: str, **kw):
    """crawl_mit2.get with retries.

    A run once lost DNS for a few minutes and every department after the
    first went to zero candidates. A transient network failure should cost a
    retry, not a department; a real 404 still returns None at once.
    """
    for attempt in range(4):
        try:
            r = s.get(url, timeout=30, **kw)
            if r.status_code == 200:
                return r
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(5 * (attempt + 1))
                continue
            print(f"    HTTP {r.status_code}: {url}")
            return None
        except requests.RequestException as exc:
            if attempt == 3:
                print(f"    error fetching {url}: {exc}")
                return None
            time.sleep(10 * (attempt + 1))
    return None


# ---------------------------------------------------------------------------
# Record + text helpers
# ---------------------------------------------------------------------------

CREDENTIALS = (r"ph\.?\s?d|d\.?\s?phil|m\.?\s?d|m\.?p\.?h|dr\.?p\.?h|sc\.?d|m\.?h\.?s|m\.?s\.?c?|"
               r"m\.?a|b\.?a|b\.?s|r\.?d|r\.?n|m\.?s\.?w|m\.?p\.?p|m\.?b\.?a|d\.?v\.?m|"
               r"pharm\.?\s?d|d\.?d\.?s|j\.?d|faha|facc|facs|facp|fasa")
CREDENTIAL_TAIL_RE = re.compile(rf",?\s*\b({CREDENTIALS})\.?\s*$", re.IGNORECASE)
CREDENTIAL_ONLY_RE = re.compile(rf"^(\s*\b({CREDENTIALS})\.?\s*,?)+$", re.IGNORECASE)


def tidy_name(name: str) -> str:
    """'Alber, Frank' / 'Frank Alber, PhD' / 'Sara Adar, ScD, MHS' -> 'First Last'.

    Trailing degrees are stripped first, so a comma that only introduced
    credentials is never mistaken for "Last, First".
    """
    n = clean_text(name)
    for _ in range(6):
        stripped = CREDENTIAL_TAIL_RE.sub("", n).strip(" ,")
        if stripped == n:
            break
        n = stripped
    if n.count(",") == 1:                   # "Last, First M."
        last, first = [p.strip() for p in n.split(",")]
        if first and last and not CREDENTIAL_ONLY_RE.match(first):
            n = f"{first} {last}"
    return n


TITLE_STOP_RE = re.compile(
    r"\s+(?:Contact Info|Office:|Phone:|E-?mail:|Email|MORE INFO|Read Faculty|Room\b)|"
    r"\s+\S*@\S*|\s+ude\.\S+", re.I)


PRONOUNS_RE = re.compile(r"\s*\(?\b(she|he|they|ze)\s*/\s*(her|him|them|they|hers|his|theirs|she|he|zir)\b\)?", re.I)


def clean_title(title: str) -> str:
    """Cut a card-derived title at the first contact detail that follows it,
    and drop pronouns, which LSA prints on the title line ("…Psychology she/her")."""
    t = PRONOUNS_RE.sub("", clean_text(title)).strip()
    # Samueli labels a core professor's *second* department "(Joint
    # Appointment)". quality.rank_type reads "joint" as adjunct-like, which is
    # wrong for these people; merge.py records the second department anyway.
    t = re.sub(r"\s*\(joint appointment\)", "", t, flags=re.I).strip()
    m = TITLE_STOP_RE.search(t)
    return t[:m.start()].strip(" ,;|-") if m else t


PLACEHOLDER_EMAIL_RE = re.compile(r"^(uniquename|email|name|user|username|someone)@", re.I)


def make_record(name: str, title: str, dept: str, profile_url: str, **extra) -> dict:
    rec = {
        "id":               hashlib.md5(profile_url.encode()).hexdigest()[:12],
        "university":       "ucla",
        "name":             tidy_name(name),
        "title":            clean_title(title),
        "department":       dept,
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
    rec.update({k: v for k, v in extra.items() if v})
    if PLACEHOLDER_EMAIL_RE.match(rec["email"]):      # Michigan Aero's template text
        rec["email"] = ""
    # EEB cards print the email's local part right after the title.
    user = rec["email"].split("@")[0] if rec["email"] else ""
    if user and len(user) > 3 and f" {user}" in rec["title"]:
        rec["title"] = rec["title"].split(f" {user}")[0].strip()
    return rec


def soup_of(html: str) -> BeautifulSoup:
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "svg", "noscript"]):
        t.decompose()
    return soup


def unreverse_email(text: str) -> str:
    """math.ucla.edu prints addresses backwards ('ude.alcu.htam@oat')."""
    text = re.sub(r"\s*@\s*", "@", text or "")     # Statistics: "ude.alcu.tats @ marka"
    m = re.search(r"((?:ude|gro|moc)\.[a-z0-9.-]+@[a-z0-9._+-]+)", text, re.I)
    if not m:
        return ""
    cand = m.group(1)[::-1]
    return cand if re.fullmatch(r"[a-z0-9._+-]+@[a-z0-9.-]+\.(edu|org|com|net)", cand, re.I) else ""


def label_values(soup: BeautifulSoup) -> dict[str, object]:
    """Collect "Label | value" pairs from 2-column tables and <dl>s.

    Returns label (lower-cased, colon stripped) -> the value element. Several
    UCLA sites (Chemistry's `item-person__table-box`) lay a profile out this
    way, which beats guessing from prose.
    """
    out: dict[str, object] = {}
    for tr in soup.find_all("tr"):
        cells = tr.find_all(["td", "th"], recursive=False)
        if len(cells) == 2:
            label = clean_text(cells[0].get_text(" ", strip=True)).rstrip(":").lower()
            if label and len(label) < 40:
                out.setdefault(label, cells[1])
    for dt in soup.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            label = clean_text(dt.get_text(" ", strip=True)).rstrip(":").lower()
            if label and len(label) < 40:
                out.setdefault(label, dd)
    return out


# Not a bare "default": Drupal serves every upload from /sites/default/files/.
# /Uxd_ and /Bxd_ are UCLA's departmental wordmark files; (minus|plus)Sign are
# UCLA Profiles' expand/collapse icons.
LOGO_RE = re.compile(r"logo|wordmark|banner|icon|placeholder|default[-_.](avatar|image|profile|user)|"
                     r"no[-_]?photo|silhouette|seal|[UB]xd_[A-Z]|(minus|plus)sign|\.svg", re.I)
# An og:image that isn't an image at all — Fielding's is "https://ph.ucla.edu/1".
IMAGE_URL_RE = re.compile(r"\.(jpe?g|png|webp|gif)(\?|$)|/(files|uploads|images?|photos?|media)/", re.I)


def usable_photo(url: str) -> bool:
    return bool(url) and not LOGO_RE.search(url) and bool(IMAGE_URL_RE.search(url))


def content_photo(soup: BeautifulSoup, base: str) -> str:
    """First real portrait inside the main content (og:image first)."""
    og = soup.find("meta", property="og:image")
    if og and og.get("content") and usable_photo(og["content"]):
        return urljoin(base, og["content"].strip())
    scope = soup.find("main") or soup.find(id=re.compile(r"main|content", re.I)) or soup
    for img in scope.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if src and usable_photo(src) and not src.startswith("data:"):
            return urljoin(base, src)
    return ""


# ---------------------------------------------------------------------------
# Department spec + shared collector / profile parser
# ---------------------------------------------------------------------------

@dataclass
class Dept:
    slug: str                          # crawler slug (taxonomy.py canonicalises)
    listings: list[str]                # listing pages to scan
    link: str                          # regex a profile URL must match
    title_in_card: bool = True         # card text after the name is the title
    paginate: Optional[str] = None     # regex for "next page" listing links
    collect: Optional[Callable] = None     # custom collector (overrides above)
    parse: Optional[Callable] = None       # custom profile parser (merged over generic)
    link_text_is_name: bool = True
    name_re: Optional[str] = None      # pull the name out of the card text
    card_must: Optional[str] = None    # card text must match (filters nav links)
    assume_faculty: bool = False       # faculty-only roster that prints no rank
    notes: str = ""


def card_of(a, link_re: re.Pattern, base: str):
    """Smallest ancestor of `a` that is one person's card.

    Climb while the parent still contains only this one profile link, so a
    grid of cards never collapses into one giant "card".
    """
    card = a
    while card.parent is not None and card.parent.name not in ("body", "html", "main"):
        hrefs = {urljoin(base, x["href"]).split("#")[0] for x in card.parent.find_all("a", href=True)
                 if link_re.search(urljoin(base, x["href"]))}
        if len(hrefs) > 1:
            break
        card = card.parent
    return card


def card_collect(s, d: Dept) -> list[dict]:
    link_re = re.compile(d.link)
    queue, done = list(d.listings), set()
    out, seen = [], {}
    while queue:
        url = queue.pop(0)
        if url in done:
            continue
        done.add(url)
        r = get(s, url)
        if not r:
            continue
        soup = soup_of(r.text)
        for a in soup.find_all("a", href=True):
            href = urljoin(r.url, a["href"]).split("#")[0]
            if d.paginate and re.search(d.paginate, href) and href not in done:
                queue.append(href)
                continue
            if not link_re.search(href):
                continue
            if href in seen:
                # A photo link usually comes first with no text; take the name
                # from the next link to the same person.
                prev = seen[href]
                if not prev["name"] and d.link_text_is_name:
                    prev["name"] = clean_text(a.get_text(" ", strip=True))
                continue
            card = card_of(a, link_re, r.url)
            text = clean_text(card.get_text(" ", strip=True))
            if d.card_must and not re.search(d.card_must, text, re.I):
                continue
            name = clean_text(a.get_text(" ", strip=True))
            if not d.link_text_is_name or not name or name.lower() in ("learn more", "website", "read more", "view profile", "more"):
                name = ""
            if not name and d.name_re:
                m = re.search(d.name_re, text)
                name = clean_text(m.group(1)) if m else ""
            lines = [clean_text(x) for x in card.get_text("\n", strip=True).split("\n") if clean_text(x)]
            title = ""
            if d.name_re and re.search(r"Title:\s*", text):
                title = re.split(r"Title:\s*", text, 1)[1].split(" Office:")[0].strip()
            elif d.title_in_card and name and name in lines:
                # The line after the name, not the rest of the card: cards
                # often list several appointments one per line.
                after = lines[lines.index(name) + 1:]
                title = after[0] if after else ""
            elif d.title_in_card and name and name in text:
                title = text.split(name, 1)[1].strip(" ,|-")
            entry = {"name": name, "title": title, "profile_url": href,
                     "email": unreverse_email(text) or ""}
            seen[href] = entry
            out.append(entry)
        time.sleep(DELAY)
    return out


TITLE_LINE_RE = re.compile(
    r"((?:distinguished |associate |assistant |adjunct |visiting |research |full |clinical )*"
    r"professor(?: emerit(?:us|a))?(?: of [A-Z][\w&,\- ]{2,60})?(?: in [A-Z][\w&,\- ]{2,60})?)",
    re.IGNORECASE,
)


SHARED_MAILBOX_RE = re.compile(r"^(uclaprofiles|webmaster|info|contact|help)@", re.I)


def parse_ucla_profiles(soup: BeautifulSoup) -> dict:
    """Pages that embed UCLA Profiles (the medical school's research database).

    No prose bio — but the funded projects and PubMed publications it lists
    are a real description of the lab's work, so they become the summary.
    """
    text = clean_text(soup.get_text(" ", strip=True))
    out = {}
    m = re.search(r"research activities and funding (.+?) Bibliographic", text, re.I)
    grants = []
    if m:
        for g in re.split(r"\s(?:NIH|NSF|DOD|NCI|AHA|VA|CIRM|NIA|NIMH)\b\s?\S*\s.*?Role:\s*[A-Za-z -]+?(?=\s[A-Z]|$)", m.group(1)):
            g = re.sub(r"^(?:(?:Co-)?(?:Principal )?Investigator|PI|Mentor)\s+", "", clean_text(g))
            if 15 < len(g) < 250 and g not in grants:
                grants.append(g)
    pubs = []
    for a in soup.find_all("a", href=re.compile(r"ncbi\.nlm\.nih\.gov/pubmed/\d+")):
        li = a.find_parent("li") or a.find_parent("div")
        t = clean_text(li.get_text(" ", strip=True)) if li else ""
        # "Authors. Title. Journal. Year..." — the title is the second sentence.
        parts = [x.strip() for x in t.split(". ") if x.strip()]
        if len(parts) >= 2 and 20 < len(parts[1]) < 300 and parts[1] not in pubs:
            pubs.append(parts[1])
        if len(pubs) >= 5:
            break
    bits = []
    if grants:
        bits.append("Funded research: " + "; ".join(grants[:4]) + ".")
    if pubs:
        bits.append("Recent publications: " + "; ".join(pubs) + ".")
    if bits:
        out["research_summary"] = " ".join(bits)[:1200]
    return out


def generic_profile(html: str, url: str) -> dict:
    soup = soup_of(html)
    fields = common.parse_generic_profile(html, url)
    # crawl_mit2 takes any title-classed element after the <h1>; on MCDB that
    # is the person's name again. Only keep it if it reads like a rank.
    if not looks_like_title(fields.get("title", "")):
        fields["title"] = ""
    lv = label_values(soup)

    # Title: explicit label first, then a title-ish class, then the first
    # "…Professor…" line anywhere near the top of the content.
    if "title" in lv:
        el = lv["title"]
        items = [clean_text(li.get_text(" ", strip=True)) for li in el.find_all("li")] or \
                [clean_text(el.get_text(" ", strip=True))]
        items = [i for i in items if i.lower() not in ("faculty", "staff")]
        fields["title"] = "; ".join(items)
    if not fields.get("title"):
        # The line right under the name heading. Michigan IOE pages carry a
        # bare "Professor" in some other title-classed element, which let
        # emeriti through as "Professor" until this came first.
        h1 = soup.find("h1")
        if h1:
            for el in h1.find_all_next(["p", "div", "span", "h2", "h3", "li"], limit=12):
                t = clean_text(el.get_text(" ", strip=True))
                if t and t != clean_text(h1.get_text(" ", strip=True)) and len(t) < 160 and looks_like_title(t):
                    fields["title"] = t
                    break
    if not fields.get("title"):
        for el in soup.find_all(class_=re.compile(r"(^|[-_ ])(title|position|job|rank)([-_ ]|$)", re.I)):
            t = clean_text(el.get_text(" ", strip=True))
            if 3 < len(t) < 160 and looks_like_title(t):
                fields["title"] = t
                break
    if not fields.get("title"):
        scope = soup.find("main") or soup
        # Drop base64/CSS blobs first — Psychology inlines one at the top of
        # <main> that otherwise fills the whole search window.
        text = re.sub(r"\S{60,}", " ", scope.get_text(" ", strip=True))
        m = TITLE_LINE_RE.search(clean_text(text)[:3000])
        if m:
            fields["title"] = clean_text(m.group(1))

    # Email: mailto, then labelled value, then reversed text (math).
    if not fields.get("email"):
        for key in ("email", "e-mail"):
            if key in lv:
                t = clean_text(lv[key].get_text(" ", strip=True))
                if "@" in t:
                    fields["email"] = t
    if not fields.get("email"):
        fields["email"] = unreverse_email(soup.get_text(" ", strip=True))

    # Website label beats "first external link" (which on Chemistry was the
    # department feedback form).
    for key in ("website", "lab website", "home page", "homepage", "lab"):
        el = lv.get(key)
        a = el.find("a", href=True) if el is not None else None
        if a and a["href"].startswith("http"):
            fields["lab_website"] = a["href"].strip()
            break

    if not usable_photo(fields.get("photo_url", "")):
        fields["photo_url"] = content_photo(soup, url)
    if SHARED_MAILBOX_RE.match(fields.get("email") or ""):
        fields["email"] = ""
    if "UCLA Profiles" in soup.get_text(" ", strip=True)[:3000]:
        fields.update(parse_ucla_profiles(soup))
    if fields.get("name"):
        fields["name"] = tidy_name(fields["name"])
    return fields


# ---------------------------------------------------------------------------
# Samueli engineering (one AJAX feed for all seven departments)
# ---------------------------------------------------------------------------

SAMUELI_AJAX = "https://samueli.ucla.edu/wp-admin/admin-ajax.php"
SAMUELI_CATEGORIES = ("chair", "vice-chair", "ieo", "core", "in-residence", "joint")
SAMUELI_PROFILE_RE = re.compile(r"https://samueli\.ucla\.edu/people/[a-z0-9-]+/?$")


def samueli_collector(code: str) -> Callable:
    def collect(s, d: Dept) -> list[dict]:
        cats = ",".join(f"{c}-{code}" for c in SAMUELI_CATEGORIES)
        try:
            r = s.post(SAMUELI_AJAX, timeout=30, data={
                "action": "load_seas_search_results", "category": cats,
                "search_key": "", "department": code})
            r.raise_for_status()
        except Exception as exc:
            print(f"    samueli feed failed for {code}: {exc}")
            return []
        soup = soup_of(r.text)
        out, seen = [], set()
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not SAMUELI_PROFILE_RE.search(href) or href in seen:
                continue
            seen.add(href)
            card = card_of(a, SAMUELI_PROFILE_RE, SAMUELI_AJAX)
            name = clean_text(a.get_text(" ", strip=True))
            text = clean_text(card.get_text(" ", strip=True))
            title = text.split(name, 1)[1].strip() if name and name in text else ""
            out.append({"name": name, "title": title, "profile_url": href})
        return out
    return collect


def parse_samueli(html: str, url: str) -> dict:
    soup = soup_of(html)
    out = {}
    h = soup.find(class_=re.compile(r"seas-profile")) or soup
    name_el = soup.find(["h1", "h2"], class_=re.compile(r"name|title", re.I))
    if name_el:
        out["name"] = clean_text(name_el.get_text(" ", strip=True))
    for lab in soup.find_all(class_="seas-profile-accordion-label"):
        if re.search(r"research", lab.get_text(" ", strip=True), re.I):
            body = lab.find_next(class_="seas-profile-content")
            if body:
                out["research_summary"] = clean_text(body.get_text(" ", strip=True))[:1200]
            break
    t = h.find(string=re.compile(r"professor", re.I))
    if t and len(t.strip()) < 160:
        out["title"] = clean_text(t)
    return out


# ---------------------------------------------------------------------------
# Physics & Astronomy: everything is on the listing (no per-person pages)
# ---------------------------------------------------------------------------

PHYSICS_URL = "https://www.pa.ucla.edu/faculty.html"


def collect_physics(s, d: Dept) -> list[dict]:
    """One <td> per person: h5 name, then title / field / office / phone lines.

    The email is assembled by an inline document.write() from `name` and
    `domain` variables, so read those rather than the rendered text.
    """
    r = get(s, PHYSICS_URL)
    if not r:
        return []
    raw = BeautifulSoup(r.text, "html.parser")
    out = []
    for td in raw.find_all("td"):
        h5 = td.find("h5")
        if not h5:
            continue
        name = clean_text(h5.get_text(" ", strip=True))
        email = ""
        script = td.find("script")
        if script:
            n = re.search(r'name\s*=\s*"([^"]+)"', script.get_text())
            dom = re.search(r'domain\s*=\s*"([^"]+)"', script.get_text())
            if n and dom:
                email = f"{n.group(1)}@{dom.group(1)}"
        p = td.find("p")
        lines = []
        if p:
            for t in p.find_all("script"):
                t.decompose()
            lines = [clean_text(x) for x in p.get_text("\n").split("\n") if clean_text(x)]
        title = lines[0] if lines else ""
        area = lines[1] if len(lines) > 1 and not lines[1].startswith(("Office", "Phone", "Email")) else ""
        office = next((l.split(":", 1)[1].strip() for l in lines if l.startswith("Office:")), "")
        phone = next((l.split(":", 1)[1].strip() for l in lines if l.startswith("Phone:")), "")
        site = next((a["href"] for a in td.find_all("a", href=True)
                     if a.get_text(strip=True).lower() == "website"), "")
        img = td.find("img")
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        out.append({
            "name": name, "title": title, "complete": True,
            # The website is the person's own page when it lives under
            # /faculty-websites/; otherwise it is a lab/group site.
            "profile_url": site if "/faculty-websites/" in site else f"{PHYSICS_URL}#{slug}",
            "lab_website": "" if "/faculty-websites/" in site else site,
            "email": email, "office": office, "phone": phone,
            "photo_url": urljoin(PHYSICS_URL, img["src"]) if img and img.get("src") else "",
            "research_summary": area,
        })
    return out


def parse_statistics(html: str, url: str) -> dict:
    """Research areas are the line between the title and the (reversed) email."""
    soup = soup_of(html)
    text = clean_text((soup.find("main") or soup).get_text(" ", strip=True))
    m = re.search(r"(?:Professor|Lecturer)[^.]*?\s(.+?)\s(?:ude\.|[a-z0-9._]+@)", text)
    if not m:
        return {}
    areas = re.sub(r"^[&,/].*?\b(Chair|Director)\b\s*", "", m.group(1).strip())
    areas = re.sub(r"^Research interests:\s*", "", areas, flags=re.I)
    return {"research_summary": areas} if len(areas) > 15 else {}


def parse_math(html: str, url: str) -> dict:
    soup = soup_of(html)
    el = soup.select_one(".views-field-FacultyInterest .field-content")
    out = {}
    if el:
        out["research_summary"] = clean_text(el.get_text(" ", strip=True))
    home = soup.select_one(".views-field-nothing-3")
    if home:
        m = re.search(r"https?://\S+", home.get_text(" ", strip=True))
        if m:
            out["lab_website"] = m.group(0)
    return out


# ---------------------------------------------------------------------------
# Department table
# ---------------------------------------------------------------------------

def samueli(code: str, slug: str) -> Dept:
    return Dept(slug=slug, listings=[], link=SAMUELI_PROFILE_RE.pattern,
                collect=samueli_collector(code), parse=parse_samueli)


DEPTS: dict[str, Dept] = {
    # Samueli School of Engineering
    "be":   samueli("be", "bioengineering"),
    "cbe":  samueli("cbe", "chemical"),
    "cee":  samueli("cee", "civil"),
    "cs":   samueli("cs", "cse"),
    "ece":  samueli("ece", "electrical"),
    "mae":  samueli("mae", "mechanical"),
    "mse":  samueli("mse", "materials"),

    # Physical Sciences
    "chemistry": Dept(
        slug="chemistry",
        listings=["https://www.chemistry.ucla.edu/directory/faculty/"],
        link=r"chemistry\.ucla\.edu/directory/(?!faculty|department|page)[a-z0-9-]+/$",
        paginate=r"chemistry\.ucla\.edu/directory/faculty/page/\d+/$",
        title_in_card=False, link_text_is_name=False),
    "math": Dept(
        slug="mathematics",
        listings=["https://www.math.ucla.edu/people/ladder"],
        link=r"math\.ucla\.edu/people/ladder/[a-z0-9_-]+$",
        title_in_card=False, parse=parse_math),
    "physics": Dept(slug="physics-astronomy", listings=[], link="", collect=collect_physics),
    "statistics": Dept(
        slug="statistics",
        listings=["https://statistics.ucla.edu/index.php/people1/all-faculty/faculty/"],
        link=r"statistics\.ucla\.edu/index\.php/people1/all-faculty/7809-2\?smid=\d+$",
        link_text_is_name=False, name_re=r"^(.+?)\s+(?:Distinguished |Associate |Assistant |Adjunct |Senior |Continuing )*(?:Professor|Lecturer)",
        parse=parse_statistics),
    "epss": Dept(
        slug="geosciences",
        listings=["https://epss.ucla.edu/faculty/"],
        link=r"^https://epss\.ucla\.edu/[a-z0-9-]+/$",
        card_must=r"professor|chair"),
    "aos": Dept(
        slug="atmos-science",
        listings=["https://atmos.ucla.edu/directory/faculty/"],
        link=r"atmos\.ucla\.edu/author/[a-z0-9_-]+/$",
        link_text_is_name=False, name_re=r"^(.+?)\s+Title:"),

    # Life Sciences
    "mcdb": Dept(
        slug="biology",
        listings=["https://www.mcdb.ucla.edu/faculty/"],
        link=r"mcdb\.ucla\.edu/faculty-member/[a-z0-9-]+/$",
        title_in_card=False, assume_faculty=True),
    "eeb": Dept(
        slug="biology",
        listings=["https://www.eeb.ucla.edu/faculty/"],
        link=r"eeb\.ucla\.edu/indivfaculty/\?faculty=[A-Za-z-]+$"),
    "ibp": Dept(
        slug="biology",
        listings=["https://www.ibp.ucla.edu/faculty/"],
        link=r"ibp\.ucla\.edu/faculty/[a-z0-9-]+/$",
        title_in_card=False),
    "psych": Dept(
        slug="psychological-brain-sciences",
        listings=["https://www.psych.ucla.edu/faculty/"],
        link=r"psych\.ucla\.edu/faculty-page/[a-z0-9_-]+/$",
        title_in_card=False),
    "mimg": Dept(
        slug="immunology",
        listings=["https://mimg.ucla.edu/people/faculty"],
        link=r"mimg\.ucla\.edu/people/(?!faculty|staff|search)[a-z0-9-]+$"),

    # David Geffen School of Medicine — basic-science departments
    "biolchem": Dept(
        slug="medicine",
        listings=["https://biolchem.ucla.edu/people/faculty"],
        link=r"biolchem\.ucla\.edu/people/(?!faculty|research-personnel|postdoctoral|graduate|staff)[a-z0-9-]+$"),
    "pharmacology": Dept(
        slug="medicine",
        listings=["https://pharmacology.ucla.edu/people/faculty"],
        link=r"pharmacology\.ucla\.edu/people/(?!faculty|department|graduate|postdocs|staff|open)[a-z0-9-]+$"),
    "physiology": Dept(
        slug="medicine",
        listings=["https://medschool.ucla.edu/about/departments/basic-science/physiology/people/faculty"],
        link=r"medschool\.ucla\.edu/people/[a-z0-9-]+$"),
    "humgen": Dept(
        slug="genetics",
        listings=["https://medschool.ucla.edu/about/departments/basic-science/human-genetics/faculty-people"],
        link=r"medschool\.ucla\.edu/people/[a-z0-9-]+$"),
    "compmed": Dept(
        slug="medicine",
        listings=["https://compmed.ucla.edu/people/faculty"],
        link=r"compmed\.ucla\.edu/profile/[a-z0-9-]+$"),

    # Fielding School of Public Health
    "publichealth": Dept(
        slug="public-health",
        listings=["https://ph.ucla.edu/about/faculty-staff-directory?type=faculty&page=1"],
        link=r"ph\.ucla\.edu/about/faculty-staff-directory/[a-z0-9-]+$",
        paginate=r"faculty-staff-directory\?type=faculty&page=\d+$",
        link_text_is_name=False, title_in_card=False,
        name_re=r"^(.+?)\s+(?:Biostatistics|Community Health|Environmental Health|Epidemiology|Health Policy|Global Health|Read Faculty)"),

    "neurobio": Dept(
        slug="neuroscience",
        listings=["https://neurobio.ucla.edu/lab-members/faculty"],
        link=r"neurobio\.ucla\.edu/people/[a-z0-9-]+$"),
}


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def crawl_department(s, key: str, limit: int = 0) -> list[dict]:
    d = DEPTS[key]
    print(f"\n=== {key} ===")
    listing = (d.collect or card_collect)(s, d)
    print(f"  {len(listing)} candidates")
    records = []
    for i, entry in enumerate(listing, 1):
        if limit and len(records) >= limit:
            break
        url = entry["profile_url"]
        title = entry.get("title", "")
        if NOT_A_PERSON_RE.search(entry.get("name", "") + " " + url):
            continue
        # A card title that already rules the person out saves a fetch.
        if title and EMERITUS(title):
            continue
        if entry.get("complete"):
            if not is_faculty_title(title):
                continue
            keep = ("email", "photo_url", "research_summary", "lab_website", "office", "phone")
            rec = make_record(entry["name"], title, d.slug, url, **{k: entry.get(k, "") for k in keep})
            # A personal page on the department site is worth reading for prose.
            if "/faculty-websites/" in url:
                r = get(s, url)
                if r:
                    summary = common.generic_research_summary(soup_of(r.text))
                    if len(summary) > len(rec["research_summary"]):
                        rec["research_summary"] = summary[:1200]
                time.sleep(DELAY)
            records.append(rec)
            print(f"  [{i}/{len(listing)}] + {rec['name']} — {rec['title'][:50]}")
            continue
        r = get(s, url)
        if not r:
            continue
        fields = generic_profile(r.text, url)
        if d.parse:
            fields.update({k: v for k, v in d.parse(r.text, url).items() if v})
        name = entry.get("name") or fields.get("name", "")
        if not title or not is_faculty_title(title):
            title = fields.get("title") or title
        if not is_faculty_title(title) and not (d.assume_faculty and not title):
            print(f"  [{i}/{len(listing)}] skip (not faculty rank): {name} — {title[:60]!r}")
            time.sleep(DELAY)
            continue
        rec = make_record(name, title, d.slug, url,
                          email=entry.get("email") or fields.get("email", ""),
                          photo_url=fields.get("photo_url", ""),
                          research_summary=(fields.get("research_summary") or "")[:1200],
                          lab_website=fields.get("lab_website", ""),
                          google_scholar=fields.get("google_scholar", ""))
        records.append(rec)
        print(f"  [{i}/{len(listing)}] + {rec['name']} — {rec['title'][:50]}")
        time.sleep(DELAY)
    return records


NOT_A_PERSON_RE = re.compile(r"message[- ]from|welcome|greetings|chairs?[-' ]s? (corner|message)", re.I)


def EMERITUS(title: str) -> bool:
    return bool(common.EMERITUS_RE.search(title))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--output", default="faculty-ucla")
    ap.add_argument("--dept", default="", help="Comma-separated subset of: " + ",".join(DEPTS))
    ap.add_argument("--limit", type=int, default=0, help="Stop each department after N records.")
    args = ap.parse_args()

    keys = [k.strip() for k in args.dept.split(",") if k.strip()] or list(DEPTS)
    unknown = set(keys) - set(DEPTS)
    if unknown:
        sys.exit(f"Unknown department(s): {sorted(unknown)}")

    s = session()
    records: list[dict] = []
    for key in keys:
        try:
            records.extend(crawl_department(s, key, args.limit))
        except Exception as exc:
            print(f"  [{key}] crawl failed: {exc!r}")
    if not records:
        sys.exit("No records collected.")
    write_outputs(records, args.output)


if __name__ == "__main__":
    main()
