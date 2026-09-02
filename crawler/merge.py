#!/usr/bin/env python3
"""
Merge the per-school crawler outputs into the files the app reads.

Replaces the copy-paste snippet that used to live in README.md, which carried a
hard-coded SOURCES map that had drifted — it silently dropped faculty-mit.json,
faculty-mit2.json and faculty-harvard.json (1,004 records). This globs instead,
so a new school's output can never go missing.

What it does, in order:
  1. loads every faculty*.json in this directory and tags `university`
  2. canonicalizes department slugs through taxonomy.py, so all schools share
     one vocabulary
  3. merges joint-appointment duplicates (one person, two department
     directories, two profile URLs, two ids) into a single record
  4. writes ui/public/faculty.json          — combined, still read by the
                                               backend importer and
                                               find_lab_scholar.py
     and   ui/public/faculty-<code>.json    — per school, what the UI fetches
  5. prints the counts to paste into SCHOOL_SEO in ui/src/lib/seo.js

Usage:
  python merge.py
  python merge.py --dry-run          report only, write nothing
"""
import argparse, collections, json, re, unicodedata
from pathlib import Path

import taxonomy

HERE = Path(__file__).parent
OUT_DIR = HERE.parent / "ui" / "public"

# Which crawler output belongs to which school. Filenames are matched by stem,
# so faculty-mit.json and faculty-mit2.json both land under "mit".
SOURCE_SCHOOL = {
    "faculty":         "tamu",     # crawl.py's default output stem
    "faculty-rice":    "rice",
    "faculty-ut":      "ut",
    "faculty-utd":     "utd",
    "faculty-mit":     "mit",
    "faculty-mit2":    "mit",
    "faculty-harvard": "harvard",
    "faculty-tamu-health": "tamu",
    "faculty-ut-neuro":    "ut",     # neuroscience + integrative biology
    "faculty-tamu-earth":  "tamu",   # atmospheric sci, geology, geography
}

# Enrichment fields. These are produced after a crawl (enrich_ollama.py writes
# ai_review, enrich_scholar_pydoll.py writes scholar_interests/publications), so
# a fresh crawl always emits them empty. Carried forward from the previous
# merged dataset rather than lost — otherwise re-crawling one school silently
# wipes hours of enrichment, which is exactly what happened when Rice and UTD
# were re-crawled and their ai_review coverage went 85%/65% -> 0%.
ENRICHED_FIELDS = ("ai_review", "scholar_interests", "publications")


# Fields where "longer is better" when merging two records for one person.
LONGEST_WINS = ("research_summary", "ai_review", "title", "office")
# Fields where any non-empty value beats an empty one.
FIRST_NONEMPTY = ("email", "phone", "photo_url", "lab_website", "google_scholar")


def norm_name(name):
    """Normalize a name for duplicate detection.

    Strips accents, punctuation and case so "José Álvarez" and "Jose Alvarez"
    collide, which is what we want — these are the same person listed by two
    departments with inconsistent typography.
    """
    n = unicodedata.normalize("NFKD", name or "")
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = re.sub(r"[^a-z\s]", " ", n.lower())
    return " ".join(n.split())


def load_previous(path):
    """Index the last merged dataset by record id, for enrichment carry-forward.

    Ids are md5(profile_url), so they are stable across re-crawls as long as the
    university does not move the page.
    """
    if not path.exists():
        return {}
    try:
        return {r["id"]: r for r in json.loads(path.read_text()) if r.get("id")}
    except Exception as exc:
        print(f"  ! could not read {path.name} for carry-forward ({exc})")
        return {}


def carry_forward(records, previous):
    """Refill enrichment fields that a fresh crawl left empty."""
    if not previous:
        return 0
    restored = 0
    for r in records:
        old = previous.get(r.get("id"))
        if not old:
            continue
        for field in ENRICHED_FIELDS:
            if not r.get(field) and old.get(field):
                r[field] = old[field]
                restored += 1
    return restored


def load_sources():
    """Read every faculty*.json in this directory, tagged with its school."""
    records, seen_files = [], []
    for path in sorted(HERE.glob("faculty*.json")):
        school = SOURCE_SCHOOL.get(path.stem)
        if school is None:
            print(f"  ! {path.name}: no entry in SOURCE_SCHOOL — skipped")
            continue
        rows = json.loads(path.read_text())
        for r in rows:
            r.setdefault("university", school)
            r["department"] = taxonomy.canonical_slug(r.get("department"))
        records.extend(rows)
        seen_files.append((path.name, school, len(rows)))
    return records, seen_files


def richness(r):
    """How much usable content a record carries — decides which one survives."""
    return (
        len((r.get("ai_review") or "").strip())
        + len((r.get("research_summary") or "").strip())
        + 200 * bool(r.get("google_scholar"))
        + 100 * bool(r.get("lab_website"))
        + 50 * bool(r.get("photo_url"))
        + 10 * len(r.get("scholar_interests") or [])
    )


def merge_group(group):
    """Collapse several records for one person into one.

    Union rather than pick-a-winner: the duplicates are asymmetric — one
    department's page often has the long AI review while the other carries the
    Google Scholar link, so choosing either record wholesale loses data.

    `department` stays a scalar (the richest record's) because the UI treats it
    as one value — a filter equality check, a Set source for the dropdown, a
    badge key and a topic partition key. The other appointments go in
    `also_departments` so they can be surfaced without a data migration.
    """
    group = sorted(group, key=richness, reverse=True)
    primary, rest = dict(group[0]), group[1:]

    for field in LONGEST_WINS:
        best = max((r.get(field) or "" for r in group), key=len)
        if best:
            primary[field] = best
    for field in FIRST_NONEMPTY:
        if not primary.get(field):
            for r in rest:
                if r.get(field):
                    primary[field] = r[field]
                    break

    # Union list fields, preserving order and dropping repeats.
    for field in ("scholar_interests", "publications"):
        merged, seen = [], set()
        for r in group:
            for item in (r.get(field) or []):
                key = json.dumps(item, sort_keys=True) if isinstance(item, dict) else item
                if key not in seen:
                    seen.add(key)
                    merged.append(item)
        if merged:
            primary[field] = merged

    primary["also_departments"] = sorted(
        {r["department"] for r in rest if r.get("department")
         and r["department"] != primary.get("department")})
    primary["also_profile_urls"] = [r["profile_url"] for r in rest
                                    if r.get("profile_url")
                                    and r["profile_url"] != primary.get("profile_url")]
    # Retired ids. AppContext.isSaved() checks these so a bookmark saved against
    # the dropped record still resolves instead of silently un-saving itself.
    primary["alias_ids"] = [r["id"] for r in rest if r.get("id")]
    return primary


def dedupe(records):
    """Merge records that describe the same person at the same university.

    Keyed on (university, normalized name) — NOT email. Generic department
    addresses make email useless as a key: 539 UTD records share
    oris@utdallas.edu and 72 MIT records share bexec@mit.edu, so an email-keyed
    merge would collapse ~750 unrelated people into two.
    """
    groups = collections.defaultdict(list)
    for r in records:
        groups[(r.get("university"), norm_name(r.get("name")))].append(r)

    merged, collapsed = [], 0
    for (_, name), group in groups.items():
        if len(group) == 1 or not name:
            merged.extend(group)
        else:
            merged.append(merge_group(group))
            collapsed += len(group) - 1
    return merged, collapsed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would happen; write nothing")
    args = ap.parse_args()

    print("Loading crawler output:")
    records, files = load_sources()
    for name, school, n in files:
        print(f"  {name:<26} -> {school:<8} {n:>5}")
    print(f"  {'total':<26}    {'':<8} {len(records):>5}")

    previous = load_previous(OUT_DIR / "faculty.json")
    restored = carry_forward(records, previous)
    if restored:
        print(f"\nCarried forward {restored} enrichment values from the previous "
              f"dataset ({len(previous)} records indexed).")

    unknown = taxonomy.audit_slugs(r.get("department") for r in records)
    if unknown:
        print(f"\n! slugs with no taxonomy.CANONICAL entry: {', '.join(unknown)}")
        print("  add them there and to DEPT_DISPLAY, or they render as raw slugs.")

    merged, collapsed = dedupe(records)
    print(f"\nDeduped {collapsed} surplus records "
          f"({len(records)} -> {len(merged)}).")

    # Guard against a merge that silently eats records or reuses a live id.
    live = {r["id"] for r in merged}
    aliases = {a for r in merged for a in r.get("alias_ids", [])}
    assert not (live & aliases), "alias_ids collide with live ids"
    assert len(live) == len(merged), "duplicate ids in merged output"

    by_school = collections.defaultdict(list)
    for r in merged:
        by_school[r["university"]].append(r)

    if args.dry_run:
        print("\n--dry-run: no files written.")
    else:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        combined = OUT_DIR / "faculty.json"
        combined.write_text(json.dumps(merged, ensure_ascii=False, indent=2))
        print(f"\nWrote {combined.relative_to(HERE.parent)} "
              f"({combined.stat().st_size / 1e6:.1f} MB, {len(merged)} records)")
        for school, rows in sorted(by_school.items()):
            path = OUT_DIR / f"faculty-{school}.json"
            path.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
            print(f"      {path.name:<24} {path.stat().st_size / 1e6:>5.1f} MB  "
                  f"{len(rows):>5} records")

    print("\nPaste into SCHOOL_SEO / TOTAL_FACULTY in ui/src/lib/seo.js:")
    for school, rows in sorted(by_school.items(), key=lambda kv: -len(kv[1])):
        print(f"    {school:<9} count: {len(rows)},")
    print(f"    TOTAL_FACULTY = {len(merged)}")
    print("\nNext: python census.py --audit")


if __name__ == "__main__":
    main()
