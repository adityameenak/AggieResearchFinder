#!/usr/bin/env python3
"""
Re-fetch selected profile pages and repair only what is missing or bad.

A full re-crawl is the wrong tool for a parser fix: it rewrites every record,
and some parsers that are right in general are wrong for a few pages (see the
Jack Waas note in HANDOFF.md — a full artsci re-crawl would drop his summary).
This re-extracts only the records you select, and only fills a field whose
current value is blank or filler by quality.py's definition. A good value is
never overwritten.

It also reports profile pages that no longer exist. A 404 on a faculty
profile usually means the person has left; those are written to
stale_profiles.json for a human decision rather than deleted.

Plain `requests`, so it only suits server-rendered sites (TAMU engineering,
UT Cockrell, most department WordPress sites). Pages that need a browser come
back with nothing extracted and are counted as such.

Usage:
  python reextract.py --host engineering.tamu.edu --blank research_summary
  python reextract.py --host me.utexas.edu --bad title
  python reextract.py --host me.utexas.edu --bad title --dry-run
Then: python merge.py --sync-sources && python census.py --audit --quality
"""
import argparse, collections, json, re, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import requests

import quality
from crawl import extract_profile_fields
from merge import SOURCE_SCHOOL
import crawl_utd

HERE = Path(__file__).parent
STALE = HERE / "stale_profiles.json"
HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 ResearchFinderBot/1.0"),
    "Accept": "text/html,application/xhtml+xml",
}


def is_bad(field, value, counts):
    """True when `value` is missing or filler, so re-extraction may replace it."""
    v = (value or "").strip() if isinstance(value, str) else value
    if not v:
        return True
    if field == "research_summary":
        return quality.is_menu_text(v) or len(v) < 40
    if field == "title":
        return quality.is_non_title(v)
    if field == "photo_url":
        return quality.is_placeholder_photo(v, counts)
    if field == "email":
        return quality.is_shared_email(v, counts)
    if field == "lab_website":
        return quality.is_junk_link(v, counts)
    return False


def extract(html, url):
    """The right parser for the host. Schools with their own crawler entry
    point (UTD) have their own profile parser; everything else goes through
    crawl.py's dispatcher."""
    if "utdallas.edu" in (urlparse(url).hostname or ""):
        return crawl_utd.parse_profile(html, url, stem_only=False) or {}
    return extract_profile_fields(html, url)


def personal_email(html, name, counts):
    """The professor's own address among a page's mailto: links, or "".

    For parsers that took the first mailto: and got an office box (MIT
    biology's bexec@ on 72 records, with the real tabaker@ two links later).
    Conservative on purpose: an address is taken only when its local part
    contains the surname, so an assistant's or a colleague's is never
    guessed. Assistants' boxes ("tabaker_admin") are skipped outright.
    """
    parts = quality.split_name(name)[0].lower().split()
    surname = re.sub(r"[^a-z]", "", parts[-1]) if parts else ""
    if len(surname) < 3:
        return ""
    for addr in dict.fromkeys(re.findall(r"mailto:([\w.+-]+@[\w.-]+)", html)):
        local = addr.split("@")[0].lower()
        if quality.is_shared_email(addr, counts) or re.search(r"_?(admin|asst|assistant)\b", local):
            continue
        if surname[:6] in re.sub(r"[^a-z]", "", local):
            return addr
    return ""


REPAIRABLE = ("research_summary", "title", "photo_url", "email", "phone", "office",
              "google_scholar", "lab_website")


def fetch(url):
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
    except requests.RequestException as exc:
        return None, str(exc)
    # Decode as UTF-8 explicitly: requests falls back to Latin-1 when a server
    # omits the charset, which is where TAMU's "â€" mojibake came from.
    return r.status_code, r.content.decode("utf-8", "replace") if r.ok else ""


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", required=True, help="only records whose profile_url host contains this")
    ap.add_argument("--blank", choices=REPAIRABLE, action="append", default=[],
                    help="select records where this field is missing or filler")
    ap.add_argument("--bad", choices=REPAIRABLE, action="append", default=[],
                    help="alias of --blank, reads better for titles")
    ap.add_argument("--all", action="store_true", help="select every record on the host")
    ap.add_argument("--workers", type=int, default=4, help="concurrent requests (be polite)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    select = args.blank + args.bad
    if not select and not args.all:
        ap.error("give --blank/--bad FIELD, or --all")

    files = {p: json.loads(p.read_text()) for p in sorted(HERE.glob("faculty*.json"))}
    counts = quality.value_counts([r for rows in files.values() for r in rows])
    targets = [(p, r) for p, rows in files.items() for r in rows
               if args.host in (urlparse(r.get("profile_url") or "").hostname or "")
               and (args.all or any(is_bad(f, r.get(f), counts) for f in select))]
    print(f"{len(targets)} records selected on {args.host}")
    if not targets:
        return

    def work(item):
        path, rec = item
        status, html = fetch(rec["profile_url"])
        time.sleep(0.25)
        return path, rec, status, html

    changed = collections.Counter()
    stale, empty = [], 0
    with ThreadPoolExecutor(args.workers) as ex:
        for i, (path, rec, status, html) in enumerate(ex.map(work, targets), 1):
            if status in (404, 410):
                # Crawler output often has no `university`; merge.py fills it in.
                school = rec.get("university") or SOURCE_SCHOOL.get(path.stem, "?")
                stale.append({"id": rec["id"], "name": rec.get("name") or "", "university": school,
                              "department": rec.get("department"), "profile_url": rec["profile_url"],
                              "status": status})
                continue
            if not html:
                continue
            fields = extract(html, rec["profile_url"])
            if "email" in select and is_bad("email", fields.get("email"), counts):
                fields["email"] = personal_email(html, rec.get("name"), counts)
            got = 0
            for f in REPAIRABLE:
                new = (fields.get(f) or "").strip()
                if new and is_bad(f, rec.get(f), counts) and not is_bad(f, new, counts):
                    rec[f] = new
                    changed[f] += 1
                    got += 1
            empty += not got
            if i % 25 == 0:
                print(f"  {i}/{len(targets)}  " + ", ".join(f"{k} {v}" for k, v in changed.items()))

    print(f"\nRepaired: " + (", ".join(f"{k} {v}" for k, v in changed.most_common()) or "nothing"))
    print(f"Pages with nothing better to offer: {empty}")
    print(f"Profiles gone (404/410): {len(stale)}")
    for s in stale[:10]:
        print(f"    {s['university']:<5} {s['name'][:30]:<30} {s['profile_url']}")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return
    for path, rows in files.items():
        path.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    if stale:
        prev = json.loads(STALE.read_text()) if STALE.exists() else []
        seen = {s["id"] for s in prev}
        prev.extend(s for s in stale if s["id"] not in seen)
        STALE.write_text(json.dumps(prev, ensure_ascii=False, indent=2))
        print(f"Recorded in {STALE.name} ({len(prev)} total) — review before removing anyone.")
    print("Next: python merge.py --sync-sources && python census.py --audit --quality")


if __name__ == "__main__":
    sys.exit(main())
