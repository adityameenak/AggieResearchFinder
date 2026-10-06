#!/usr/bin/env python3
"""
University of Michigan (Ann Arbor) STEM faculty crawler.

Michigan is the Harvard problem again, with a way around part of it.

  * Every department website — College of Engineering (*.engin.umich.edu),
    LSA (lsa.umich.edu/*), Public Health (sph.umich.edu) and Michigan Medicine
    (medicine.umich.edu) — sits behind a Cloudflare challenge. Plain requests
    get a 403 "Just a moment..." page; a real browser passes.

  * Michigan Experts (experts.umich.edu) is a Symplectic Elements "Discovery"
    portal with an open JSON API that plain `requests` reaches with no
    challenge at all. It is the source for --stage api:
        POST /api/users                       search; empty text pages through
                                              every profile (perPage caps at 100)
        GET  /api/users/<objectId>            the full profile: email, positions,
                                              About bio, grants, degrees
        POST /api/publications/linkedTo       a person's publications, with
                                              title, year and keyword labels
        GET  /<discoveryUrlId>/thumbnail      portrait (when hasThumbnail)
    Experts covers the College of Engineering (all 13 departments) and the
    Medical School's basic-science departments well, but LSA barely at all and
    Public Health not at all — see --stage browser.

Selection is crawl_rice.py's curate-don't-dump rule: a person is kept only if
one of their positions is a professor rank (crawl_mit2's FACULTY_TITLE_RE,
minus emeriti and the clinical series) in an Ann Arbor department listed in
STEM_UNITS. Dearborn and Flint campuses share the portal and are excluded, as
are Michigan Medicine's clinical departments (the agreed scope is research
faculty; see the plan for this school).

--stage browser covers what Experts lacks, from the department sites
themselves, through a headless Chromium patched with playwright-stealth (the
same technique as crawl_harvard_fas.py — here it passes Cloudflare without
needing a user-started Chrome):
  * LSA: every STEM department's faculty listing (an AEM fragment,
    `…/jcr:content/par/people_list.results.html?page=N`) and profile pages.
  * College of Engineering rosters. Experts holds only the faculty who opted
    in (18 of ~40 in Aerospace), so each department's own roster is the
    authority for *who* is faculty; Experts then supplies the richer fields.
  * School of Public Health's A–Z directory.
Pages are cached under crawler/.cache/umich so a re-run does not re-fetch.

--stage all (the default) runs both and merges on normalised name: an Experts
record keeps its email, publications and interests, and gains the department
site's photo, prose research summary and lab website where it lacked them.

Usage:
  python crawl_umich.py                                  # both stages, merged
  python crawl_umich.py --stage api --limit 20           # Experts smoke test
  python crawl_umich.py --stage browser --units chem,cse --limit 5
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import html as htmllib
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests

import taxonomy
from crawl_mit2 import EMERITUS_RE, FACULTY_TITLE_RE, clean_text, write_outputs

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

EXPERTS = "https://experts.umich.edu"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "application/json",
    "Content-Type": "application/json",
}
PAGE = 100          # the API silently caps perPage at 100
DELAY = 0.25

# Experts department string -> crawler department slug (taxonomy.py
# canonicalises). Matched as a prefix, longest first, so "College of
# Engineering Electrical Engineering and Computer Science - Computer Science
# and Engineering" lands on cse and not on electrical.
STEM_UNITS = {
    "College of Engineering Aerospace Engineering": "aerospace",
    "College of Engineering Biomedical Engineering": "biomedical",
    "MM Biomedical Engineering - Medical School": "biomedical",
    "College of Engineering Chemical Engineering": "chemical",
    "College of Engineering Civil and Environmental Engineering": "civil",
    "College of Engineering Climate and Space Sciences Engineering": "climate-space",
    "College of Engineering Electrical Engineering and Computer Science - Computer Science and Engineering": "cse",
    "College of Engineering Electrical Engineering and Computer Science - Electrical and Computer Engineering": "electrical",
    "College of Engineering Industrial and Operations Engineering": "industrial",
    "College of Engineering Materials Science and Engineering": "materials",
    "College of Engineering Mechanical Engineering": "mechanical",
    "College of Engineering Naval Architecture and Marine Engineering": "naval-marine",
    "College of Engineering Nuclear Engineering and Radiological Sciences": "nuclear",
    "College of Engineering Robotics": "robotics",
    # LSA (Experts holds only a handful; --stage browser covers the rest)
    "LSA Molecular, Cellular and Developmental Biology": "biology",
    "LSA Ecology and Evolutionary Biology": "biology",
    "LSA Chemistry": "chemistry",
    "LSA Physics": "physics-astronomy",
    "LSA Astronomy": "physics-astronomy",
    "LSA Mathematics": "mathematics",
    "LSA Statistics": "statistics",
    "LSA Earth and Environmental Sciences": "earth-atmospheric",
    "LSA Psychology": "psychological-brain-sciences",
    "LSA Biophysics": "biophysics",
    # Michigan Medicine — basic-science departments only
    "MM Cell and Developmental Biology": "biology",
    "MM Computational Medicine and Bioinformatics": "computational-medicine",
    "MM Microbiology and Immunology": "microbiology-immunology",
    "MM Molecular and Integrative Physiology": "physiology",
    "MM Pharmacology": "pharmacology",
    "MM Biological Chemistry": "biological-chemistry",
    "MM Human Genetics": "human-genetics",
    # Units Experts names without a school prefix. Matched exactly (or as
    # "<name> - <sub-unit>"), never as a bare prefix: "Chemistry" must not
    # swallow "Medicinal Chemistry", which is the College of Pharmacy.
    "=Biological Chemistry": "biological-chemistry",
    "=Human Genetics": "human-genetics",
    "=Macromolecular Science and Engineering": "materials",
    "=Psychology": "psychological-brain-sciences",
    "=Chemistry": "chemistry",
    "=Mathematics": "mathematics",
    "=Ecology and Evolutionary Biology": "biology",
    "=Biophysics": "biophysics",
    "=Physics": "physics-astronomy",
    "=Astronomy": "physics-astronomy",
    "=Statistics": "statistics",
    "=Earth and Environmental Sciences": "earth-atmospheric",
    # School of Public Health — Experts lists its departments unprefixed
    "=Biostatistics": "public-health",
    "=Epidemiology": "public-health",
    "=Environmental Health Sciences": "public-health",
    "=Health Behavior and Health Education": "public-health",
    "=Health Behavior and Health Equity": "public-health",
    "=Health Management and Policy": "public-health",
    "=Nutritional Sciences": "public-health",
    "School of Public Health": "public-health",
}
UNIT_KEYS = sorted(STEM_UNITS, key=len, reverse=True)

CLINICAL_RE = re.compile(r"\bclinical\b", re.I)


def unit_slug(department: str) -> str:
    d = clean_text(department or "")
    for key in UNIT_KEYS:
        if key.startswith("="):
            name = key[1:]
            if d == name or d.startswith(name + " -"):
                return STEM_UNITS[key]
        elif d.startswith(key):
            return STEM_UNITS[key]
    return ""


def is_faculty(position: str) -> bool:
    p = position or ""
    return (bool(FACULTY_TITLE_RE.search(p)) and not EMERITUS_RE.search(p)
            and not CLINICAL_RE.search(p))


def strip_html(s: str) -> str:
    s = re.sub(r"<(br|/p|/li|/h\d)\s*/?>", "\n", s or "", flags=re.I)
    s = re.sub(r"<[^>]+>", " ", s)
    return clean_text(htmllib.unescape(s))


class Experts:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update(HEADERS)

    def _req(self, method, path, **kw):
        for attempt in range(4):
            try:
                r = self.s.request(method, f"{EXPERTS}/api/{path}", timeout=60, **kw)
                if r.status_code in (429, 502, 503, 504):
                    time.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                return r.json()
            except requests.RequestException as exc:
                if attempt == 3:
                    print(f"    {method} {path} failed: {exc}")
                    return None
                time.sleep(2 ** attempt)
        return None

    def all_people(self):
        start, out = 0, []
        while True:
            d = self._req("POST", "users", json={
                "params": {"by": "text", "category": "user", "text": ""},
                "pagination": {"startFrom": start, "perPage": PAGE}})
            if not d:
                break
            out += d.get("resource") or []
            total = d["pagination"]["total"]
            start += PAGE
            if start >= total:
                break
            time.sleep(DELAY)
        return out

    def person(self, object_id):
        return self._req("GET", f"users/{object_id}")

    def publications(self, object_id, n=8):
        d = self._req("POST", "publications/linkedTo", json={
            "objectId": str(object_id), "category": "user",
            "pagination": {"perPage": n, "startFrom": 0},
            "sort": "date", "favouritesFirst": True})
        return (d or {}).get("resource") or []


# Top-level Fields-of-Research divisions: true of half the faculty, so they say
# nothing about a person. Their sub-fields ("Materials Engineering") do.
BROAD_FOR = {
    "engineering", "chemical sciences", "physical sciences", "biological sciences",
    "health sciences", "biomedical and clinical sciences", "information and computing sciences",
    "mathematical sciences", "earth sciences", "environmental sciences", "psychology",
    "agricultural, veterinary and food sciences", "technology", "medical and health sciences",
    "built environment and design", "economics", "commerce, management, tourism and services",
    "human society", "education", "law and legal studies", "studies in human society",
    "language, communication and culture", "philosophy and religious studies",
    "history, heritage and archaeology", "creative arts and writing",
}


def interests_from(pubs_raw) -> list[str]:
    """Rank a person's research keywords across their recent papers.

    Fields of Research (2020) sub-fields are clean, controlled terms. Author
    keywords (labels with no scheme) are specific but sometimes split mid-word
    ("Lithium-ion bat" / "tery separator"), so one is kept only when it recurs
    across papers. MeSH and SDG labels are ignored — "Animals" and "13 Climate
    Action" are not research interests.
    """
    score: dict[str, list] = {}
    for p in pubs_raw:
        seen_here = set()
        for lab in p.get("labels") or []:
            if not isinstance(lab, dict):
                continue
            v = clean_text(lab.get("value") or "")
            scheme = lab.get("schemeDisplayName") or ""
            key = v.lower()
            if not v or key in seen_here or len(v) > 60:
                continue
            if scheme.startswith("Fields of Research (2020)"):
                if key in BROAD_FOR:
                    continue
                kind = "for"
            elif not scheme:
                kind = "kw"
            else:
                continue
            seen_here.add(key)
            entry = score.setdefault(key, [v, 0, kind])
            entry[1] += 1
    ranked = sorted(score.values(), key=lambda e: (-e[1], e[2] != "for"))
    return [v for v, n, kind in ranked if kind == "for" or n >= 2][:6]


def pick_position(positions):
    """The first in-scope professor position, plus any other in-scope units."""
    primary, also = None, []
    for p in positions or []:
        slug = unit_slug(p.get("department", ""))
        if not slug or not is_faculty(p.get("position", "")):
            continue
        if primary is None:
            primary = (p, slug)
        elif slug != primary[1] and slug not in also:
            also.append(slug)
    return primary, also


def build_record(api: Experts, summary: dict) -> dict | None:
    picked, also = pick_position(summary.get("positions"))
    if not picked:
        return None
    pos, slug = picked
    full = api.person(summary["objectId"]) or {}
    url_id = summary.get("discoveryUrlId") or full.get("discoveryUrlId")
    profile_url = f"{EXPERTS}/{url_id}"

    about = strip_html(((full.get("tabSummaryAbout") or summary.get("tabSummaryAbout") or {}).get("value")))
    grants = strip_html(((full.get("tabSummaryGrants") or {}).get("value")))

    pubs_raw = api.publications(summary["objectId"]) if full.get("linkedObjectIds", {}).get("publications") else []
    pubs = []
    for p in pubs_raw:
        title = clean_text(p.get("title") or "")
        if not title:
            continue
        year = ((p.get("publicationDate") or {}).get("year")) or ""
        pubs.append({"title": title, "year": str(year) if year else ""})
    labels = interests_from(pubs_raw)

    # Research text: the person's own words first, then what they are funded
    # to do, then what they publish. A bare list of paper titles is still a
    # far better match signal than an empty card.
    research = about or ""
    if len(research) < 80 and grants:
        research = (research + " Funded research: " + grants).strip()
    if len(research) < 80 and pubs:
        research = (research + " Recent publications: " + "; ".join(p["title"] for p in pubs[:5])).strip()

    email = ((full.get("emailAddress") or {}).get("address") or "").strip()
    phone = ""
    for ph in full.get("phoneNumbers") or []:
        if ph.get("number"):
            phone = ph["number"]
            break

    rec = {
        "id":               hashlib.md5(profile_url.encode()).hexdigest()[:12],
        "university":       "umich",
        "name":             clean_text(summary.get("firstNameLastName") or full.get("firstNameLastName") or ""),
        "title":            clean_text(pos.get("position", "")),
        "department":       slug,
        "email":            email,
        "profile_url":      profile_url,
        "research_summary": research[:1200],
        "lab_website":      "",
        "google_scholar":   "",
        "ai_review":        "",
        "photo_url":        f"{EXPERTS}/{url_id}/thumbnail" if summary.get("hasThumbnail") else "",
        "phone":            phone,
        "office":           "",
        "scholar_interests": labels,
        "publications":      pubs,
    }
    if also:
        rec["also_departments"] = also
    return rec


def stage_api(limit: int) -> list[dict]:
    api = Experts()
    print("Listing every Michigan Experts profile…")
    people = api.all_people()
    print(f"  {len(people)} profiles")
    candidates = [p for p in people if pick_position(p.get("positions"))[0]]
    print(f"  {len(candidates)} hold an Ann Arbor STEM professor position")
    out = []
    for i, p in enumerate(candidates, 1):
        if limit and len(out) >= limit:
            break
        rec = build_record(api, p)
        if rec:
            out.append(rec)
            print(f"  [{i}/{len(candidates)}] + {rec['name']} — {rec['title']} ({rec['department']})")
        time.sleep(DELAY)
    return out


# ---------------------------------------------------------------------------
# Stage B — department sites through a stealth browser
# ---------------------------------------------------------------------------

CACHE = Path(__file__).parent / ".cache" / "umich"


class _Resp:
    def __init__(self, url, text, status):
        self.url, self.text, self.status_code = url, text, status


class BrowserSession:
    """A requests-shaped `.get()` over a stealth headless Chromium.

    Lets crawl_ucla's card collector and profile parser run unchanged against
    Cloudflare-protected sites. Responses are cached on disk by URL.
    """

    # Once a context has passed the challenge, later pages need well under a
    # second; the first run's 2.5s settle + 1s delay made a full crawl ~9 hours.
    def __init__(self, settle_ms=600, delay=0.3):
        from playwright.sync_api import sync_playwright
        from playwright_stealth import Stealth
        self._cm = Stealth().use_sync(sync_playwright())
        self._pw = self._cm.__enter__()
        self._browser = self._pw.chromium.launch(headless=True)
        self._page = self._browser.new_context().new_page()
        self.settle_ms, self.delay = settle_ms, delay
        CACHE.mkdir(parents=True, exist_ok=True)

    def get(self, url, timeout=30, **_):
        key = CACHE / (hashlib.md5(url.encode()).hexdigest() + ".html")
        if key.exists():
            return _Resp(url, key.read_text(encoding="utf-8"), 200)
        try:
            r = self._page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1500)
            self._page.wait_for_timeout(self.settle_ms)
            html = self._page.content()
        except Exception as exc:
            raise requests.RequestException(str(exc))
        status = r.status if r else 0
        if "Just a moment" in html[:5000]:
            self._page.wait_for_timeout(8000)          # challenge still solving
            html = self._page.content()
            if "Just a moment" in html[:5000]:
                return _Resp(url, html, 403)
        if status == 200:
            key.write_text(html, encoding="utf-8")
        time.sleep(self.delay)
        return _Resp(self._page.url, html, status)

    def close(self):
        self._browser.close()
        self._cm.__exit__(None, None, None)


def lsa(dept: str, slug: str, pages: int = 12):
    import crawl_ucla as U
    frag = f"https://lsa.umich.edu/content/michigan-lsa/{dept}/en/people/faculty/jcr:content/par/people_list.results.html?page="
    return U.Dept(
        slug=slug,
        listings=[f"https://lsa.umich.edu/{dept}/people/faculty.html"] + [frag + str(n) for n in range(2, pages + 1)],
        link=rf"lsa\.umich\.edu/{dept}/people/faculty/[A-Za-z0-9._-]+\.html$",
        title_in_card=True)


def coe(host: str, slug: str, role: str = "role/faculty/", link: str = r"/people/[a-z0-9-]+/?$"):
    import crawl_ucla as U
    return U.Dept(
        slug=slug,
        listings=[f"https://{host}/{role}"],
        link=rf"https://{re.escape(host)}{link}",
        paginate=r"(\?|&)query-\d+-page=\d+$|/page/\d+/?$",
        title_in_card=False)


def collect_eecs(listing_url: str):
    """EECS's "All Faculty" pages carry every field inline, one
    `.eecs_person_copy` block per person — no profile fetch needed."""
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin

    def collect(s, d):
        import crawl_ucla as U
        r = U.get(s, listing_url)
        if not r:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        out = []
        for block in soup.select(".eecs_person_copy"):
            name_el = block.select_one(".eecs_person_name")
            if not name_el:
                continue
            titles = [clean_text(t.get_text(" ", strip=True)) for t in block.select(".person_title_section")]
            # Lead with the title held in this department, so a courtesy
            # appointment ("Professor, School of Information") never wins.
            here = [t for t in titles if "EECS" in t]
            title = (here or titles or [""])[0]
            fields = {}
            for sec in block.select(".person_copy_section"):
                txt = clean_text(sec.get_text(" ", strip=True))
                if txt.lower().startswith("research interests:"):
                    fields["research_summary"] = txt.split(":", 1)[1].strip()
                elif txt.lower().startswith("office:"):
                    fields["office"] = txt.split(":", 1)[1].strip()
                elif txt.lower().startswith("phone:"):
                    fields["phone"] = txt.split(":", 1)[1].strip()
            mail = block.select_one("a.person_email[href^=mailto]")
            web = block.select_one("a.person_web[href]")
            card = block.parent
            img = card.find("img") if card else None
            name = clean_text(name_el.get_text(" ", strip=True))
            slug_ = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
            out.append({
                "name": name, "title": title, "complete": True,
                "profile_url": f"{listing_url}#{slug_}",
                "email": mail["href"].split(":", 1)[1] if mail else "",
                "lab_website": web["href"] if web else "",
                "photo_url": urljoin(listing_url, img["src"]) if img and img.get("src") else "",
                **fields,
            })
        return out
    return collect


def stage_b_units():
    import crawl_ucla as U
    units = {
        # LSA
        "chem":    lsa("chem", "chemistry"),
        "physics": lsa("physics", "physics-astronomy"),
        # Astronomy and Biophysics have no people/faculty.html; their
        # faculty sit under category folders listed on people.html.
        "astro":   U.Dept(slug="physics-astronomy",
                          listings=["https://lsa.umich.edu/astro/people.html"],
                          link=r"lsa\.umich\.edu/astro/people/(core-faculty|jointly-appointed-faculty)/[A-Za-z0-9._-]+\.html$"),
        "math":    lsa("math", "mathematics", pages=20),
        "stats":   lsa("stats", "statistics"),
        "eeb":     lsa("eeb", "biology"),
        "mcdb":    lsa("mcdb", "biology"),
        "earth":   lsa("earth", "earth-atmospheric"),
        "psych":   lsa("psych", "psychological-brain-sciences", pages=15),
        "biophysics": U.Dept(slug="biophysics",
                             listings=["https://lsa.umich.edu/biophysics/people/core-faculty.html",
                                       "https://lsa.umich.edu/biophysics/people.html"],
                             link=r"lsa\.umich\.edu/biophysics/people/core-faculty/[A-Za-z0-9._-]+\.html$"),
        # College of Engineering
        "aero":    coe("aero.engin.umich.edu", "aerospace"),
        "bme":     coe("bme.umich.edu", "biomedical"),
        "che":     coe("che.engin.umich.edu", "chemical", role="role/core-faculty/"),
        "cee":     coe("cee.engin.umich.edu", "civil"),
        "clasp":   coe("clasp.engin.umich.edu", "climate-space"),
        "ioe":     coe("ioe.engin.umich.edu", "industrial"),
        "name":    coe("name.engin.umich.edu", "naval-marine"),
        "ners":    coe("ners.engin.umich.edu", "nuclear"),
        "mse":     coe("mse.engin.umich.edu", "materials", role="people/faculty/"),
        "me":      coe("me.engin.umich.edu", "mechanical", role="people/faculty/",
                       link=r"/people/faculty/[a-z0-9-]+/?$"),
        "robotics": coe("robotics.umich.edu", "robotics", role="people/faculty/",
                        link=r"/people/faculty/[a-z0-9-]+/?$"),
        "cse": U.Dept(slug="cse", listings=[], link="",
                      collect=collect_eecs("https://cse.engin.umich.edu/people/faculty/")),
        "ece": U.Dept(slug="electrical", listings=[], link="",
                      collect=collect_eecs("https://ece.engin.umich.edu/people/directory/faculty/")),
        # School of Public Health
        "sph": U.Dept(
            slug="public-health",
            listings=[f"https://sph.umich.edu/faculty-profiles/?startswith={c}" for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
            link=r"sph\.umich\.edu/faculty-profiles/[a-z0-9-]+\.html$",
            title_in_card=True),
    }
    return units


def stage_browser(keys, limit: int) -> list[dict]:
    import crawl_ucla as U
    units = stage_b_units()
    keys = keys or list(units)
    s = BrowserSession()
    out = []
    try:
        for key in keys:
            d = units[key]
            U.DEPTS[f"umich-{key}"] = d          # crawl_department reads DEPTS
            try:
                recs = U.crawl_department(s, f"umich-{key}", limit)
            except Exception as exc:
                print(f"  [{key}] failed: {exc!r}")
                continue
            for r in recs:
                r["university"] = "umich"
            out.extend(recs)
    finally:
        s.close()
    return out


# ---------------------------------------------------------------------------
# Merge
# ---------------------------------------------------------------------------

def name_key(name: str) -> str:
    n = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    n = re.sub(r"\b(dr|prof|professor|phd|md|mph)\b\.?", " ", n)
    parts = re.findall(r"[a-z]+", n)
    parts = [p for p in parts if len(p) > 1]       # drop middle initials
    return f"{parts[0]} {parts[-1]}" if len(parts) >= 2 else " ".join(parts)


def is_pub_list(text: str) -> bool:
    return (text or "").startswith(("Recent publications:", "Funded research:"))


NICKNAMES = {
    "alex": "alexander", "greg": "gregory", "cindy": "cynthia", "tim": "timothy",
    "jim": "james", "bob": "robert", "rob": "robert", "bill": "william", "will": "william",
    "mike": "michael", "dave": "david", "dan": "daniel", "tom": "thomas", "joe": "joseph",
    "chris": "christopher", "matt": "matthew", "nick": "nicholas", "steve": "steven",
    "andy": "andrew", "ben": "benjamin", "sam": "samuel", "kate": "katherine",
    "katie": "katherine", "liz": "elizabeth", "beth": "elizabeth", "jen": "jennifer",
    "jenny": "jennifer", "sue": "susan", "pat": "patrick", "ed": "edward", "rick": "richard",
    "rich": "richard", "jeff": "jeffrey", "ted": "edward", "tony": "anthony", "larry": "lawrence",
}


def _first_last(name: str) -> tuple[str, str, list]:
    n = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    parts = re.findall(r"[a-z]+", n)
    return (parts[0] if parts else "", parts[-1] if parts else "", parts)


def first_compatible(a: str, b: str) -> bool:
    """'Greg'~'Gregory', 'Cindy'~'Cynthia', 'J. Tim'~'Joseph' (initial)."""
    fa, la, pa = _first_last(a)
    fb, lb, pb = _first_last(b)
    if not fa or not fb:
        return False
    fa, fb = NICKNAMES.get(fa, fa), NICKNAMES.get(fb, fb)
    return fa == fb or fa.startswith(fb) or fb.startswith(fa) or (
        (len(fa) == 1 or len(fb) == 1) and fa[0] == fb[0])


def merge(api_recs: list[dict], site_recs: list[dict]) -> list[dict]:
    by_name = {name_key(r["name"]): r for r in api_recs}
    # Personal addresses only: an address held by two records is a shared
    # mailbox (CLAUDE.md: never merge on those).
    email_n = collections.Counter((r.get("email") or "").lower() for r in api_recs + site_recs)
    by_email = {r["email"].lower(): r for r in api_recs
                if r.get("email") and email_n[r["email"].lower()] <= 2}
    by_last_dept = collections.defaultdict(list)
    for r in api_recs:
        by_last_dept[(_first_last(r["name"])[1], taxonomy.canonical_slug(r["department"]))].append(r)
    out = list(api_recs)
    added = enriched = 0
    for sr in site_recs:
        k = name_key(sr["name"])
        ar = by_email.get((sr.get("email") or "").lower()) or by_name.get(k)
        if not ar:
            cands = [r for r in by_last_dept.get((_first_last(sr["name"])[1],
                                                   taxonomy.canonical_slug(sr["department"])), [])
                     if first_compatible(r["name"], sr["name"])]
            ar = cands[0] if len(cands) == 1 else None
        if not ar:
            by_name[k] = sr
            out.append(sr)
            added += 1
            continue
        changed = False
        if not ar.get("photo_url") and sr.get("photo_url"):
            ar["photo_url"] = sr["photo_url"]; changed = True
        site_text = sr.get("research_summary") or ""
        if len(site_text) >= 80 and (is_pub_list(ar.get("research_summary")) or not ar.get("research_summary")):
            ar["research_summary"] = site_text[:1200]; changed = True
        for f in ("lab_website", "office", "google_scholar"):
            if not ar.get(f) and sr.get(f):
                ar[f] = sr[f]; changed = True
        if not ar.get("email") and sr.get("email"):
            ar["email"] = sr["email"]; changed = True
        if sr["department"] != ar["department"]:
            also = ar.setdefault("also_departments", [])
            if sr["department"] not in also:
                also.append(sr["department"])
        enriched += changed
    print(f"\nmerge: {len(api_recs)} from Experts, {added} added from department sites, "
          f"{enriched} Experts records enriched")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=["all", "api", "browser"], default="all")
    ap.add_argument("--units", default="", help="Stage B subset (comma-separated)")
    ap.add_argument("--output", default="faculty-umich")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--api-json", help="reuse a previous --stage api output instead of re-querying Experts")
    ap.add_argument("--site-json", default="",
                    help="comma-separated --stage browser outputs to merge instead of crawling "
                         "(lets the browser stage run as several parallel processes)")
    args = ap.parse_args()
    keys = [k.strip() for k in args.units.split(",") if k.strip()]

    if args.api_json:
        api_recs = json.loads(Path(args.api_json).read_text(encoding="utf-8"))
    else:
        api_recs = stage_api(args.limit) if args.stage in ("all", "api") else []
    if args.site_json:
        site_recs = [r for f in args.site_json.split(",") if f
                     for r in json.loads(Path(f).read_text(encoding="utf-8"))]
    else:
        site_recs = stage_browser(keys, args.limit) if args.stage in ("all", "browser") else []
    records = merge(api_recs, site_recs) if api_recs and site_recs else (api_recs or site_recs)
    if not records:
        sys.exit("No records collected.")
    write_outputs(records, args.output)


if __name__ == "__main__":
    main()
