#!/usr/bin/env python3
"""Fill research content for THIN profiles from Google Scholar, scraping each
profile BY URL with pydoll (a real Chrome via CDP) — which, unlike plain
requests, doesn't trip Scholar's CAPTCHA on profile pages.

Scholar's author *search* is still CAPTCHA-walled in headless, so links must be
either already on the record (`google_scholar`) or supplied manually via
--map (the tools/scholar-links.html export: { "<id>": "<scholar_url>" }).

Run with the python3.12 venv (pydoll needs 3.10+):
  ./venv312/bin/python enrich_scholar_pydoll.py --file faculty-ut.json
  ./venv312/bin/python enrich_scholar_pydoll.py --file faculty.json --map /tmp/links.json
"""
import argparse, asyncio, json, re
from pathlib import Path
from bs4 import BeautifulSoup
from pydoll.browser import Chrome
from pydoll.browser.options import ChromiumOptions

DELAY = 4  # seconds between profiles


def thin(r):
    return len((r.get("research_summary") or "").strip()) < 40


def parse(html):
    s = BeautifulSoup(html, "html.parser")
    if any(x in html.lower() for x in ("unusual traffic", "not a robot")) and not s.select_one("#gsc_prf_in"):
        return None  # blocked
    interests = [a.get_text(strip=True) for a in s.select("#gsc_prf_int a")]
    pubs = [t.get_text(strip=True) for t in s.select(".gsc_a_at")][:5]
    return {"interests": interests, "pubs": pubs}


async def run(path, supplied):
    d = json.loads(path.read_text(encoding="utf-8"))
    targets = []
    for r in d:
        url = supplied.get(r["id"]) or (r.get("google_scholar") or "").strip()
        if url and thin(r):
            targets.append((r, url))
    print(f"{path.name}: {len(targets)} thin profiles to enrich from Scholar")
    if not targets:
        return 0

    o = ChromiumOptions()
    o.add_argument("--headless=new"); o.add_argument("--no-sandbox")
    o.add_argument("--window-size=1280,900")
    filled = 0
    async with Chrome(options=o) as br:
        tab = await br.start()
        for i, (r, url) in enumerate(targets, 1):
            try:
                await tab.go_to(url)
                await asyncio.sleep(DELAY)
                try:
                    html = await tab.page_source
                except Exception:
                    html = str(await tab.execute_script("return document.documentElement.outerHTML"))
            except Exception as exc:
                print(f"  [{i}/{len(targets)}] {r['name']}: fetch error {exc}")
                continue
            data = parse(html)
            if data is None:
                print(f"  [{i}/{len(targets)}] {r['name']}: blocked — stopping, re-run later")
                break
            interests, pubs = data["interests"], data["pubs"]
            if interests:
                r["scholar_interests"] = interests
            if not (r.get("google_scholar") or "").strip():
                r["google_scholar"] = url
            bits = []
            if interests:
                bits.append("Research interests: " + ", ".join(interests) + ".")
            if pubs:
                bits.append("Selected work: " + "; ".join(pubs) + ".")
            if bits and thin(r):
                r["research_summary"] = " ".join(bits)[:1500]
            filled += 1
            print(f"  [{i}/{len(targets)}] {r['name']}: {interests[:3]} (+{len(pubs)} pubs)")
            if filled % 10 == 0:
                path.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")

    path.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Done: enriched {filled} → {path.name}")
    return filled


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True)
    ap.add_argument("--map")
    args = ap.parse_args()
    supplied = json.loads(Path(args.map).read_text()) if args.map else {}
    asyncio.run(run(Path(args.file), supplied))


if __name__ == "__main__":
    main()
