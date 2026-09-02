#!/usr/bin/env python3
"""
UT Austin schools that live outside the Cockrell/CNS subdomains crawl.py knows:
the Jackson School of Geosciences and Dell Medical School.

Both are separate sites with their own themes and their own URL shapes
(/researcher/<slug>/ and /directory/<slug>), neither of which _UT_PROFILE_RE
matches, so they follow the crawl_rice.py / crawl_ut_education.py pattern of a
self-contained crawler rather than risking the shared UT dispatcher.

Plain requests is enough for both — the Jackson School's expert list is
server-rendered despite the main /people page being client-rendered, and Dell
Med paginates with ?page=N.

Both rosters are mixed. The Jackson School's 200 "researchers" include lab
managers, part-time engineers and research staff; Dell Med's directory is
largely clinicians. We keep only people with an academic title AND actual
research text, because a record with no research is a blank card that matching
excludes anyway.

Usage:
  python crawl_ut_extra.py --limit 5          # smoke test first
  python crawl_ut_extra.py
  python crawl_ut_extra.py --source jsg
"""
import argparse, hashlib, html, json, re, sys, time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 "
                   "Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
}

DELAY = 0.4
TIMEOUT = 30

SOURCES = {
    "jsg": {
        # /people is client-rendered, but /people/experts/ is not.
        "listing": ["https://www.jsg.utexas.edu/people/experts/"],
        "link_re": r"/researcher/[a-z0-9._-]{4,}/?",
        "base": "https://www.jsg.utexas.edu",
        "department": "earth-atmospheric",
    },
    "dellmed": {
        "listing": [f"https://dellmed.utexas.edu/directory"
                    + ("" if p == 1 else f"?page={p}") for p in range(1, 12)],
        "link_re": r"/directory/[a-z0-9-]{4,}",
        "base": "https://dellmed.utexas.edu",
        "department": "medicine",
    },
}

# Keep research and teaching faculty; drop lab managers, engineers and staff.
FACULTY_TITLE_RE = re.compile(
    r"\b(professor|lecturer|instructor|clinical (associate|assistant)?\s*prof)",
    re.I)
EMERITUS_RE = re.compile(r"emerit", re.I)

# Each site names its research section differently. The Jackson School uses
# "Areas of Expertise" and "Current Research Programs & Projects"; Dell Med
# leads with a biography.
RESEARCH_HEADINGS = [
    r"research interest|research area|research focus|research statement",
    r"areas? of expertise|current research|research programs?|select past research",
    r"biography|about|overview",
]


def clean(t):
    return " ".join(html.unescape(t or "").split())


def fetch(session, url):
    r = session.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r


def section_text(soup, pattern):
    """Text under a heading matching `pattern`, walking the document in order."""
    for hd in soup.find_all(["h2", "h3", "h4"]):
        if not re.search(pattern, hd.get_text(" ", strip=True), re.I):
            continue
        out = []
        for el in hd.find_all_next():
            if el.name in ("h1", "h2", "h3", "h4"):
                break
            if el.name in ("p", "li"):
                t = clean(el.get_text(" ", strip=True))
                if t and t not in out:
                    out.append(t)
        if out:
            return " | ".join(out)
    return ""


def parse_profile(session, url, cfg):
    try:
        r = fetch(session, url)
    except Exception as exc:
        return {"error": str(exc)}
    soup = BeautifulSoup(r.text, "html.parser")
    for t in soup(["script", "style", "nav", "footer", "header"]):
        t.decompose()

    h1 = soup.find("h1")
    if not h1:
        return None
    name = clean(h1.get_text(" ", strip=True))
    if not name or len(name) > 80:
        return None

    text = clean(soup.get_text(" ", strip=True))

    # The role line follows the name and runs up to the contact block.
    title = ""
    m = re.search(re.escape(name) + r"\s+(.{0,180}?)\s+(?:Email|Contact|Office|Phone)\b",
                  text)
    if m:
        # The name is repeated immediately before the role on these pages.
        title = clean(re.sub(r"^" + re.escape(name) + r"\s*", "", m.group(1)))
    if not title:
        for el in h1.find_all_next(limit=25):
            if el.name in ("p", "div", "span"):
                t = clean(el.get_text(" ", strip=True))
                if t and t != name and len(t) < 200 and FACULTY_TITLE_RE.search(t):
                    title = t
                    break

    if not FACULTY_TITLE_RE.search(title) or EMERITUS_RE.search(title):
        return None

    research = ""
    for pattern in RESEARCH_HEADINGS:
        research = section_text(soup, pattern)
        if len(research) >= 40:
            break
    # A record with no research is a blank card the matcher skips — drop it
    # rather than pad the dataset.
    if len(research) < 40:
        return None

    emails = re.findall(r"[\w.+-]+@[\w.-]*utexas\.edu", r.text)
    photo = ""
    for img in soup.find_all("img", src=True):
        src = img["src"]
        if re.search(r"upload|people|profile|headshot|researcher", src, re.I):
            photo = src if src.startswith("http") else cfg["base"] + src
            break

    lab, scholar = "", ""
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "scholar.google" in href and not scholar:
            scholar = href
        elif (href.startswith("http") and "utexas.edu" not in href
              and re.search(r"\blab\b|laboratory|group", href, re.I) and not lab):
            lab = href

    return {
        "id": hashlib.md5(url.encode()).hexdigest()[:12],
        "university": "ut",
        "name": name,
        "title": title[:300],
        "department": cfg["department"],
        "email": emails[0] if emails else "",
        "profile_url": url,
        "research_summary": research[:1500],
        "lab_website": lab,
        "google_scholar": scholar,
        "ai_review": "",
        "photo_url": photo,
        "phone": "",
        "office": "",
        "scholar_interests": [],
        "publications": [],
    }


def collect(session, cfg):
    links = set()
    for url in cfg["listing"]:
        try:
            html_text = fetch(session, url).text
        except Exception:
            continue
        found = set(re.findall(r'href="([^"#?]*' + cfg["link_re"] + r')"', html_text))
        if not found:
            break                       # ran past the last page
        links |= found
    return sorted(l if l.startswith("http") else cfg["base"] + l for l in links)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=sorted(SOURCES))
    ap.add_argument("--limit", type=int)
    ap.add_argument("--output", default="faculty-ut-extra")
    args = ap.parse_args()

    session = requests.Session()
    records, skipped = [], 0
    for key in ([args.source] if args.source else list(SOURCES)):
        cfg = SOURCES[key]
        links = collect(session, cfg)
        print(f"\n{key}: {len(links)} candidate profiles")
        if args.limit:
            links = links[:args.limit]
        kept = 0
        for i, url in enumerate(links, 1):
            rec = parse_profile(session, url, cfg)
            time.sleep(DELAY)
            if rec is None or "error" in (rec or {}):
                skipped += 1
                continue
            records.append(rec)
            kept += 1
            if i % 25 == 0:
                print(f"  [{i}/{len(links)}] kept {kept}")
        print(f"  {key}: kept {kept}")

    if not records:
        sys.exit("No records collected.")

    out = Path(f"{args.output}.json")
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2))

    import collections
    def pct(fn):
        return 100.0 * sum(1 for r in records if fn(r)) / len(records)

    print(f"\nWrote {out} — {len(records)} records "
          f"({skipped} skipped: no academic title or no research text)")
    print(" ", dict(collections.Counter(r["department"] for r in records)))
    print(f"  photo    {pct(lambda r: bool(r['photo_url'])):.0f}%")
    print(f"  email    {pct(lambda r: bool(r['email'])):.0f}%")
    print(f"  research {pct(lambda r: len(r['research_summary']) >= 40):.0f}%")


if __name__ == "__main__":
    main()
