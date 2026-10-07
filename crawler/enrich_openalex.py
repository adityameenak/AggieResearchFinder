#!/usr/bin/env python3
"""
Fill thin faculty profiles from OpenAlex — the open bibliographic database.

Some department sites publish nothing about a person's research: UCLA EPSS
profile pages list only contact details and awards, UCLA Physics prints a
one-word field ("Plasma"), and some medical-school pages are a name and a
title. Matching has nothing to work with, so those professors never surface.

For each record whose research text is thin (or that has no
`scholar_interests`), this finds the person in OpenAlex — restricted to their
institution, and accepted only when the surname matches and the first initial
agrees — and fills, without ever overwriting real content:

  * scholar_interests  <- the author's top OpenAlex research topics
  * publications       <- their most recent works (title, year, cited_by)
  * research_summary   <- "Recent publications: …" when the page gave none

It is the same shape as enrich_scholar_pydoll.py's output, so merge.py's
carry-forward and quality.py treat it identically. Runs in place, re-runnable,
and only touches records that need it.

OpenAlex meters its API: without a key, author search allows roughly 100
calls a day (each costs 10 of 1,000 daily credits). A free key from
openalex.org raises that; export it as OPENALEX_API_KEY. When the budget runs
out the run stops, saves what it has, and says when it resets — re-running
later picks up where it left off, because filled records no longer qualify.

Usage:
  python enrich_openalex.py --file faculty-ucla.json
  python enrich_openalex.py --file faculty-umich.json --all-interests
  python enrich_openalex.py --file faculty-ucla.json --limit 10 --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path

import requests

import taxonomy

API = "https://api.openalex.org"
HEADERS = {"User-Agent": "ResearchFinderBot/1.0 (+https://stemresearchfinder.tech)"}

# OpenAlex institution IDs. Add a school here to enrich it.
INSTITUTIONS = {
    "ucla":    "I161318765",   # University of California, Los Angeles
    "umich":   "I27837315",    # University of Michigan–Ann Arbor
    "mit":     "I63966007",
    "harvard": "I136199984",
    "tamu":    "I91045830",
    "rice":    "I74775410",
    "ut":      "I86519309",
    "utd":     "I162577319",
}

THIN = 80          # research_summary shorter than this counts as thin

# Guards against a confident-looking wrong match, both seen in testing:
#   * a 32,621-work "author" — OpenAlex had merged many people into one profile;
#   * a 2-work namesake whose topics were Cuban history, for a mathematician.
MIN_WORKS, MAX_WORKS = 5, 2500

PHYS, LIFE, HEALTH, SOCIAL = "Physical Sciences", "Life Sciences", "Health Sciences", "Social Sciences"
# OpenAlex topic domains a department's faculty plausibly publish in.
DOMAINS = {
    "life":   {LIFE, HEALTH},
    "health": {HEALTH, LIFE, SOCIAL},
    "psych":  {SOCIAL, LIFE, HEALTH},
    "phys":   {PHYS},
    "eng-bio": {PHYS, LIFE, HEALTH},
}
DEPT_DOMAIN = {
    "biology": "life", "genetics": "life", "immunology": "life", "neuroscience": "life",
    "medicine": "life", "pharmacy": "life", "nutrition": "health",
    "public-health": "health", "nursing": "health", "kinesiology": "health",
    "psychological-brain-sciences": "psych", "speech-hearing": "psych",
    "biomedical": "eng-bio", "bioengineering": "eng-bio", "chemistry": "eng-bio",
    "chemical": "eng-bio",
}


def plausible(author: dict, dept: str) -> bool:
    """Most of the author's top topics sit in a domain the department works in."""
    allowed = DOMAINS[DEPT_DOMAIN.get(dept, "phys")]
    doms = [((t.get("domain") or {}).get("display_name")) for t in (author.get("topics") or [])[:5]]
    doms = [d for d in doms if d]
    if not doms:
        return False
    return sum(d in allowed for d in doms) * 2 >= len(doms)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]+", " ", s).strip()


def name_parts(name: str) -> tuple[str, str]:
    toks = [t for t in norm(name).split() if len(t) > 1 or t.isalpha()]
    toks = [t for t in toks if t not in ("dr", "prof", "phd", "md", "jr", "sr", "ii", "iii")]
    return (toks[0] if toks else "", toks[-1] if toks else "")


def same_person(record_name: str, author_name: str) -> bool:
    f1, l1 = name_parts(record_name)
    f2, l2 = name_parts(author_name)
    if not l1 or l1 != l2:
        # Hyphenated/compound surnames: accept if either side's last token
        # appears in the other's full name.
        if not (l1 and l1 in norm(author_name).split()) and not (l2 and l2 in norm(record_name).split()):
            return False
    return bool(f1 and f2 and f1[0] == f2[0])


class BudgetExhausted(Exception):
    pass


class OpenAlex:
    def __init__(self, delay=0.15):
        self.s = requests.Session()
        self.s.headers.update(HEADERS)
        self.delay = delay
        self.key = os.environ.get("OPENALEX_API_KEY", "")

    def get(self, path, **params):
        if self.key:
            params["api_key"] = self.key
        for attempt in range(4):
            try:
                r = self.s.get(f"{API}/{path}", params=params, timeout=30)
                if r.status_code == 429:
                    # A daily-budget 429 carries a reset many hours out; waiting
                    # it out in-process would just spin. Short ones are bursts.
                    wait = int(r.headers.get("retry-after") or 0)
                    if wait > 120:
                        raise BudgetExhausted(f"OpenAlex daily budget used up; resets in ~{wait // 3600}h")
                    time.sleep(max(wait, 2 ** attempt + 1))
                    continue
                r.raise_for_status()
                time.sleep(self.delay)
                return r.json()
            except requests.RequestException:
                if attempt == 3:
                    return None
                time.sleep(2 ** attempt)
        return None

    def find_author(self, name: str, inst: str, dept: str = ""):
        def ok(a):
            return (same_person(name, a.get("display_name", ""))
                    and MIN_WORKS <= a.get("works_count", 0) <= MAX_WORKS
                    and plausible(a, taxonomy.canonical_slug(dept)))
        d = self.get("authors", search=name, filter=f"last_known_institutions.id:{inst}", **{"per-page": 10})
        cands = [a for a in (d or {}).get("results", []) if ok(a)]
        if not cands:
            # Some people are filed under an affiliated institution (a hospital,
            # an institute) — fall back to any past affiliation with the school.
            d = self.get("authors", search=name, filter=f"affiliations.institution.id:{inst}", **{"per-page": 10})
            cands = [a for a in (d or {}).get("results", []) if ok(a)]
        if not cands:
            return None
        # OpenAlex splits prolific people into a main profile plus fragments;
        # the main one has by far the most works.
        return max(cands, key=lambda a: a.get("works_count", 0))

    def recent_works(self, author_id: str, n=8):
        aid = author_id.rsplit("/", 1)[-1]
        d = self.get("works", filter=f"author.id:{aid},type:article|review|preprint|book-chapter",
                     sort="publication_date:desc", **{"per-page": n})
        out = []
        for w in (d or {}).get("results", []):
            title = re.sub(r"<[^>]+>", "", w.get("display_name") or w.get("title") or "").strip()
            if title and len(title) > 10:
                out.append({"title": title, "year": str(w.get("publication_year") or ""),
                            "cited_by": w.get("cited_by_count", 0)})
        return out


# Records a human found matched to the wrong person (a namesake whose topics
# still fit the department, so plausible() let it through). id -> reason.
# Listed ids are never enriched again; revert their fields from git by hand.
REJECTS_PATH = Path(__file__).parent / "openalex_rejects.json"
REJECTS = json.loads(REJECTS_PATH.read_text()) if REJECTS_PATH.exists() else {}


def needs(rec: dict, all_interests: bool) -> bool:
    if rec.get("id") in REJECTS:
        return False
    thin = len((rec.get("research_summary") or "").strip()) < THIN
    return thin or (all_interests and not rec.get("scholar_interests"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--all-interests", action="store_true",
                    help="also fill scholar_interests for records whose research text is fine")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = Path(args.file)
    recs = json.loads(path.read_text(encoding="utf-8"))
    todo = [r for r in recs if needs(r, args.all_interests)]
    print(f"{len(todo)} of {len(recs)} records need enrichment")
    oa = OpenAlex()
    hit = miss = 0
    def save():
        if not args.dry_run:
            path.write_text(json.dumps(recs, indent=2, ensure_ascii=False), encoding="utf-8")

    for i, r in enumerate(todo, 1):
        if args.limit and i > args.limit:
            break
        inst = INSTITUTIONS.get(r.get("university"))
        if not inst:
            continue
        try:
            author = oa.find_author(r["name"], inst, r.get("department", ""))
        except BudgetExhausted as exc:
            print(f"\n{exc}. Saving progress ({hit} matched so far); re-run later to continue.")
            save()
            return 2
        if not author:
            miss += 1
            print(f"  [{i}/{len(todo)}] - {r['name']}: no confident OpenAlex match")
            continue
        topics = [t["display_name"] for t in (author.get("topics") or [])[:6]]
        works = oa.recent_works(author["id"])
        if not r.get("scholar_interests") and topics:
            r["scholar_interests"] = topics
        if not r.get("publications") and works:
            r["publications"] = works
        if len((r.get("research_summary") or "").strip()) < THIN and works:
            lead = (r.get("research_summary") or "").strip()
            pubs = "Recent publications: " + "; ".join(w["title"] for w in works[:5]) + "."
            r["research_summary"] = (f"{lead}. {pubs}" if lead else pubs)[:1200]
        r["openalex_id"] = author["id"]
        hit += 1
        print(f"  [{i}/{len(todo)}] + {r['name']} ← {author['display_name']} "
              f"({author.get('works_count', 0)} works) {topics[:2]}")
    print(f"\nmatched {hit}, unmatched {miss}")
    save()
    if not args.dry_run:
        print(f"wrote {path}")


if __name__ == "__main__":
    sys.exit(main())
