#!/usr/bin/env python3
"""Fill research content for THIN profiles that already have a Google Scholar
URL, by scraping the Scholar profile (interests + top publications). Scholar
allows by-URL fetches (author *search* is CAPTCHA-walled, so we only use links
we already have, or ones supplied manually via tools/scholar-links.html).

Usage:
  python enrich_scholar_links.py --file faculty-ut.json
  python enrich_scholar_links.py --file faculty.json --map /tmp/links.json
    (map = { "<profile_id>": "<scholar_url>", ... } from the manual tool)
"""
import argparse, json, re, time, sys
from pathlib import Path
import requests
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
           "Accept": "text/html"}
DELAY = 5  # polite — Scholar throttles aggressively


def scrape_scholar(url, session):
    try:
        r = session.get(url, timeout=25)
    except Exception as exc:
        return None, f"fetch error: {exc}"
    if r.status_code != 200:
        return None, f"HTTP {r.status_code}"
    if re.search(r"captcha|unusual traffic", r.text, re.I):
        return None, "CAPTCHA — backing off"
    s = BeautifulSoup(r.text, "html.parser")
    interests = [a.get_text(strip=True) for a in s.select("#gsc_prf_int a")]
    pubs = [t.get_text(strip=True) for t in s.select(".gsc_a_at")][:5]
    return {"interests": interests, "pubs": pubs}, None


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True)
    ap.add_argument("--map", help="JSON {profile_id: scholar_url} from the manual tool")
    args = ap.parse_args()

    path = Path(args.file)
    d = json.loads(path.read_text(encoding="utf-8"))
    by_id = {r["id"]: r for r in d}
    supplied = json.loads(Path(args.map).read_text()) if args.map else {}

    # Candidates: thin profiles that (a) already have a scholar link, or (b) had
    # one supplied manually.
    def thin(r): return len((r.get("research_summary") or "").strip()) < 40
    targets = []
    for r in d:
        url = supplied.get(r["id"]) or (r.get("google_scholar") or "").strip()
        if url and thin(r):
            targets.append((r, url))
    print(f"{path.name}: {len(targets)} thin profiles with a Scholar link to scrape")

    s = requests.Session(); s.headers.update(HEADERS)
    filled = 0
    for i, (r, url) in enumerate(targets, 1):
        data, err = scrape_scholar(url, s)
        if err:
            print(f"  [{i}/{len(targets)}] {r['name']}: {err}")
            if "CAPTCHA" in err:
                print("  Stopping — Scholar is throttling. Re-run later or use fewer.")
                break
            time.sleep(DELAY)
            continue
        interests, pubs = data["interests"], data["pubs"]
        if interests:
            r["scholar_interests"] = interests
        if not (r.get("google_scholar") or "").strip():
            r["google_scholar"] = url
        # Build a searchable + previewable summary from interests + recent work.
        bits = []
        if interests:
            bits.append("Research interests: " + ", ".join(interests) + ".")
        if pubs:
            bits.append("Selected work: " + "; ".join(pubs) + ".")
        if bits and thin(r):
            r["research_summary"] = " ".join(bits)[:1500]
        filled += 1
        print(f"  [{i}/{len(targets)}] {r['name']}: interests={interests[:3]} (+{len(pubs)} pubs)")
        time.sleep(DELAY)

    path.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDone: enriched {filled} profiles from Google Scholar → {path.name}")


if __name__ == "__main__":
    main()
