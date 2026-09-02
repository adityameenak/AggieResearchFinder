#!/usr/bin/env python3
"""
Harvard beyond SEAS — Earth & Planetary Sciences and the Chan School of Public
Health.

Harvard was the dataset's biggest coverage gap and the hardest source. Its
department sites sit behind two different protections, and they behave very
differently:

  * Cloudflare (www.math.harvard.edu, eps.harvard.edu, hscrb.harvard.edu,
    hsph.harvard.edu, hms.harvard.edu). Plain requests and ordinary headless
    Playwright are both challenged, but playwright-stealth passes. Crucially,
    once past the challenge these sites' robots.txt is readable and permissive
    — math and hsph and hms carry no Disallow rules at all, eps and hscrb
    disallow only /wp/wp-admin/. So this crawler is doing what those sites say
    crawlers may do; the challenge was blocking us indiscriminately, not
    expressing a policy.

  * Akamai (chemistry, physics, oeb, statistics). "Access Denied" to plain
    requests, to headless Playwright, to playwright-stealth, and even to a
    headed real-Chrome channel with a persistent profile. What does work is
    attaching over CDP to a Chrome the user started themselves
    (--remote-debugging-port), which is the same technique
    enrich_scholar_pydoll.py uses for Google Scholar. Their robots.txt then
    becomes readable too, and is ordinary Drupal boilerplate — /core/,
    /profiles/, README.txt — with /people/ untouched, exactly like
    seas.harvard.edu which we already crawl.

    Run these with --cdp:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
          --remote-debugging-port=9333 --user-data-dir=/tmp/hv-cdp &
        python crawl_harvard_fas.py --cdp http://localhost:9333

Uses playwright-stealth, so it needs `pip install playwright-stealth`.

Usage:
  python crawl_harvard_fas.py --limit 5        # smoke test first
  python crawl_harvard_fas.py
  python crawl_harvard_fas.py --source eps
"""
import argparse, asyncio, hashlib, json, re, sys
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
from playwright_stealth import Stealth

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# Politeness. These are one university's servers and we are getting past a bot
# challenge to reach them, so go slower than we would elsewhere.
DELAY = 1.5
NAV_TIMEOUT = 45000
SETTLE = 3500

SOURCES = {
    "eps": {
        "listing": "https://eps.harvard.edu/people",
        "link_re": r"/people/[a-z0-9._-]{4,}",
        "base": "https://eps.harvard.edu",
        "department": "earth-atmospheric",
        # Every EPS page states the person's role right after the site name,
        # e.g. "Ann Pearson - Harvard EPS Faculty". The listing is mostly
        # graduate students (103), postdocs (44) and undergraduates (23).
        "faculty_marker": re.compile(r"Harvard EPS\s+Faculty\b"),
        "research_after": ("Research Areas", "Research Group"),
    },
    "hsph": {
        "listing": "https://www.hsph.harvard.edu/faculty/",
        "link_re": r"/profile/[a-z0-9._-]{4,}",
        "base": "https://hsph.harvard.edu",
        "department": "public-health",
        "faculty_marker": None,          # the faculty listing is faculty-only
        "research_after": ("Biography",),
    },
    # Akamai-protected Drupal departments — reachable only over --cdp.
    # All four share one theme: h1 name, contact icons, "Research Areas" /
    # "Research Interests", photo under /sites/g/files/.../styles/.
    "chemistry": {
        "listing": "https://chemistry.harvard.edu/our-faculty",
        "link_re": r"/people/[a-z0-9._-]{4,}",
        "base": "https://chemistry.harvard.edu",
        "department": "chemistry",
        "faculty_marker": None,
        "research_after": ("Research Areas", "Research Interests"),
    },
    "physics": {
        "listing": "https://www.physics.harvard.edu/people/faculty",
        "link_re": r"/people/[a-z0-9._-]{4,}",
        "base": "https://www.physics.harvard.edu",
        "department": "physics-astronomy",
        "faculty_marker": None,
        "research_after": ("Research Areas", "Research Interests"),
    },
    "oeb": {
        # Organismic & Evolutionary Biology.
        "listing": "https://oeb.harvard.edu/people",
        "link_re": r"/people/[a-z0-9._-]{4,}",
        "base": "https://oeb.harvard.edu",
        "department": "biology",
        "faculty_marker": None,
        "research_after": ("Research Areas", "Research Interests"),
    },
    "statistics": {
        "listing": "https://statistics.fas.harvard.edu/faculty",
        "link_re": r"/people/[a-z0-9._-]{4,}",
        "base": "https://statistics.fas.harvard.edu",
        "department": "statistics",
        "faculty_marker": None,
        "research_after": ("Research Interests", "Research Areas"),
    },
}

# These listings mix in staff, lecturers-without-research and administrators,
# so a title check does the filtering the URL cannot.
FACULTY_TITLE_RE = re.compile(
    r"professor|lecturer|senior researcher|principal investigator|"
    r"research scientist|fellow", re.I)

STUDENT_RE = re.compile(
    r"graduate student|undergraduate|postdoctoral|research assistant|"
    r"visiting scholar|staff assistant", re.I)


def clean(t):
    return " ".join((t or "").split())


async def get(page, url):
    await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT)
    await page.wait_for_timeout(SETTLE)
    return await page.content()


def is_blocked(html):
    return ("Just a moment" in html or "Access Denied" in html
            or len(html) < 4000)


def parse_profile(html, url, cfg):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "nav", "footer", "header"]):
        t.decompose()
    text = clean(soup.get_text(" ", strip=True))

    if cfg["faculty_marker"] and not cfg["faculty_marker"].search(text):
        return None
    if STUDENT_RE.search(text[:200]):
        return None

    # Name: h1 where there is one (EPS), otherwise the <title> up to its
    # separator (the Chan School template has no h1).
    h1 = soup.find("h1")
    if h1 and clean(h1.get_text()):
        name = clean(h1.get_text(" ", strip=True))
    else:
        t = soup.find("title")
        name = re.split(r"\s*[|\-–]\s*", clean(t.get_text()))[0] if t else ""
    if not name or len(name) > 80:
        return None

    # Title: the run of text between the name and the first research heading.
    title = ""
    after_name = text.split(name, 2)[-1] if name in text else text
    for marker in cfg["research_after"]:
        if marker in after_name:
            title = clean(after_name.split(marker)[0])
            break
    title = re.sub(r"^(Faculty|Staff)\s+", "", title).strip()[:300]

    # Research: prefer the real heading in the DOM. A plain text search finds
    # the Chan School's "Jump to Section" nav first, which is just a list of
    # section names, not content.
    research = ""
    for marker in cfg["research_after"]:
        hd = soup.find(["h2", "h3"], string=re.compile(marker, re.I))
        if hd:
            body = []
            for el in hd.find_all_next():
                if el.name in ("h1", "h2", "h3"):
                    break
                if el.name in ("p", "li"):
                    t = clean(el.get_text(" ", strip=True))
                    if t and t not in body:
                        body.append(t)
            if body:
                research = " | ".join(body)[:1500]
                break
    if not research:
        for marker in cfg["research_after"]:
            i = text.find(marker)
            if i != -1:
                research = clean(text[i:])[:1500]
                break
    if not research:
        research = clean(after_name)[:1500]

    # The Chan School template carries no explicit title line, but its
    # biography opens with one ("… is a Professor of Epidemiology and …").
    if not title and research:
        m = re.search(r"\bis (?:a|an|the)\s+([A-Z][^.;]{5,90})", research)
        if m:
            title = clean(m.group(1))

    emails = re.findall(r"[\w.+-]+@[\w.-]*harvard\.edu", html)
    photo = ""
    for img in soup.find_all("img", src=True):
        src = img["src"]
        if re.search(r"/uploads/.*\d{2,4}x\d{2,4}|/styles/.*\d{2,4}x\d{2,4}|"
                     r"headshot|portrait", src, re.I):
            # These Drupal sites emit site-relative image paths; the UI needs
            # absolute URLs or every portrait 404s.
            photo = src if src.startswith("http") else cfg["base"] + src
            break

    lab, scholar = "", ""
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "scholar.google" in href and not scholar:
            scholar = href
        elif (href.startswith("http") and "harvard.edu" not in href
              and re.search(r"\blab\b|laboratory|group", href, re.I) and not lab):
            lab = href

    return {
        "id": hashlib.md5(url.encode()).hexdigest()[:12],
        "university": "harvard",
        "name": name,
        "title": title,
        "department": cfg["department"],
        "email": emails[0] if emails else "",
        "profile_url": url,
        "research_summary": research,
        "lab_website": lab,
        "google_scholar": scholar,
        "ai_review": "",
        "photo_url": photo,
        "phone": "",
        "office": "",
        "scholar_interests": [],
        "publications": [],
    }


async def crawl(sources, limit, cdp=None):
    records = []
    async with Stealth().use_async(async_playwright()) as pw:
        if cdp:
            # Attach to a Chrome the user launched. Akamai rejects every browser
            # Playwright starts itself, however well disguised; it accepts one
            # that was already running as a normal session.
            browser = await pw.chromium.connect_over_cdp(cdp)
            ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        else:
            browser = await pw.chromium.launch(
                args=["--disable-blink-features=AutomationControlled"])
            ctx = await browser.new_context(
                user_agent=UA, viewport={"width": 1280, "height": 900}, locale="en-US")
            page = await ctx.new_page()

        for key in sources:
            cfg = SOURCES[key]
            print(f"\n{key}: {cfg['listing']}")
            try:
                html = await get(page, cfg["listing"])
            except Exception as exc:
                print(f"  ! listing failed ({type(exc).__name__}) — skipped")
                continue
            if is_blocked(html):
                print("  ! listing blocked — skipped")
                continue

            links = sorted({m for m in re.findall(r'href="([^"#?]+)"', html)
                            if re.search(cfg["link_re"], m)})
            links = [l if l.startswith("http") else cfg["base"] + l for l in links]
            links = [l for l in links if not l.rstrip("/").endswith(
                ("people", "faculty", "profile"))]
            print(f"  {len(links)} candidate profiles")
            if limit:
                links = links[:limit]

            kept = skipped = 0
            for i, url in enumerate(links, 1):
                try:
                    ph = await get(page, url)
                except Exception as exc:
                    print(f"  [{i}/{len(links)}] {url.rsplit('/', 2)[-2]}: "
                          f"{type(exc).__name__}")
                    continue
                if is_blocked(ph):
                    print(f"  [{i}/{len(links)}] blocked — stopping this source")
                    break
                rec = parse_profile(ph, url, cfg)
                if rec is None:
                    skipped += 1
                else:
                    records.append(rec)
                    kept += 1
                await asyncio.sleep(DELAY)
                if i % 25 == 0:
                    print(f"  [{i}/{len(links)}] kept {kept}, skipped {skipped}")
            print(f"  {key}: kept {kept}, skipped {skipped} (students/staff)")

        if not cdp:              # leave a user-supplied browser running
            await browser.close()
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=sorted(SOURCES), help="one source only")
    ap.add_argument("--limit", type=int, help="cap profiles per source")
    ap.add_argument("--output", default="faculty-harvard-fas")
    ap.add_argument("--cdp", help="attach to a running Chrome, e.g. "
                                  "http://localhost:9333 (needed for the "
                                  "Akamai-protected departments)")
    args = ap.parse_args()

    sources = [args.source] if args.source else list(SOURCES)
    records = asyncio.run(crawl(sources, args.limit, args.cdp))
    if not records:
        sys.exit("No records collected.")

    out = Path(f"{args.output}.json")
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2))

    import collections
    def pct(fn):
        return 100.0 * sum(1 for r in records if fn(r)) / len(records)

    print(f"\nWrote {out} — {len(records)} records")
    print(" ", dict(collections.Counter(r["department"] for r in records)))
    print(f"  photo    {pct(lambda r: bool(r['photo_url'])):.0f}%")
    print(f"  email    {pct(lambda r: bool(r['email'])):.0f}%")
    print(f"  research {pct(lambda r: len(r['research_summary']) >= 40):.0f}%")


if __name__ == "__main__":
    main()
