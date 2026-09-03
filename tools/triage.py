#!/usr/bin/env python3
"""
Triage the feedback the site files as GitHub issues.

ui/api/feedback.js turns every in-app submission into an issue labelled
`feedback`, with the category, school and page path in a trailing block. This
reads those open issues and does the lookups a human would do first — is that
professor actually in the dataset, is that department slug one we know, what
does the record for that page currently say — so the fix work starts from
evidence instead of from the report.

It only reads. Nothing here edits the dataset or touches GitHub.

Usage:
  python triage.py                  # open feedback issues -> stdout
  python triage.py --out report.md  # ... and write the report
  python triage.py --state all      # include already-closed ones
  python triage.py --issue 12       # a single issue
"""
import argparse, json, re, subprocess, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).parent
CRAWLER = HERE.parent / "crawler"
PUBLIC = HERE.parent / "ui" / "public"
REPO = "adityameenak/AggieResearchFinder"

sys.path.insert(0, str(CRAWLER))
import taxonomy  # noqa: E402
import census    # noqa: E402  (module-level data only; no network at import)

SCHOOLS = ("tamu", "rice", "ut", "utd", "mit", "harvard")

# The trailing metadata block feedback.js appends to every issue body.
FIELD = re.compile(r"^\*\*(?P<key>[\w ]+):\*\*\s*`?(?P<val>[^`\n]*)`?\s*$", re.M)
PROF_PAGE = re.compile(r"/(?P<school>\w+)/prof/(?P<id>[0-9a-f]+)")

# "Dr. Jane Smith", "Professor Jane Smith", or a bare capitalised name pair.
NAME_HINT = re.compile(
    r"(?:(?:Dr|Prof|Professor)\.?\s+)?"
    r"\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z']{1,20}){1,2})\b")

# Words that match NAME_HINT but are never a person.
NOT_A_NAME = {
    "Texas A", "United States", "New York", "Computer Science", "Machine Learning",
    "Research Finder", "Aggie Research", "Electrical Engineering", "Civil Engineering",
    "Mechanical Engineering", "Biomedical Engineering", "Chemical Engineering",
    "Please Add", "Thank You", "The Site", "This Page", "Top Publications",
}


def norm_name(name):
    """Fold accents and punctuation so 'Peña' and 'Pena' compare equal."""
    n = unicodedata.normalize("NFKD", name or "")
    n = "".join(c for c in n if not unicodedata.combining(c))
    return re.sub(r"[^a-z ]", "", n.lower()).strip()


def load_dataset():
    """The merged dataset, which is what the site actually serves."""
    combined = PUBLIC / "faculty.json"
    if not combined.exists():
        sys.exit(f"No dataset at {combined} — run crawler/merge.py first.")
    return json.loads(combined.read_text(encoding="utf-8"))


def gh_issues(state, number=None):
    cmd = ["gh", "issue", "list", "--repo", REPO, "--label", "feedback",
           "--state", state, "--limit", "200",
           "--json", "number,title,body,createdAt,url,state"]
    if number:
        cmd = ["gh", "issue", "view", str(number), "--repo", REPO,
               "--json", "number,title,body,createdAt,url,state"]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    except FileNotFoundError:
        sys.exit("gh not found — install the GitHub CLI.")
    except subprocess.CalledProcessError as e:
        sys.exit(f"gh failed: {e.stderr.strip()[:300]}")
    data = json.loads(out)
    return [data] if isinstance(data, dict) else data


def parse(issue):
    """Split an issue into the user's words and the form's metadata."""
    body = issue.get("body") or ""
    meta = {m.group("key").strip().lower(): m.group("val").strip()
            for m in FIELD.finditer(body)}
    message = body.split("\n---\n", 1)[0].strip()
    return {
        "number":   issue["number"],
        "url":      issue["url"],
        "state":    issue.get("state", ""),
        "created":  (issue.get("createdAt") or "")[:10],
        "message":  message,
        "category": meta.get("category", "Other"),
        "school":   meta.get("school", ""),
        "page":     meta.get("page", ""),
        "email":    meta.get("reply to", ""),
    }


def candidate_names(message):
    seen, out = set(), []
    for m in NAME_HINT.finditer(message):
        name = m.group(1).strip()
        if name in NOT_A_NAME or norm_name(name) in seen:
            continue
        seen.add(norm_name(name))
        out.append(name)
    return out[:5]


def find_people(dataset, name, school=""):
    """Exact normalised match first, then surname, so near-misses still surface."""
    target = norm_name(name)
    if not target:
        return []
    pool = [r for r in dataset
            if not school or (r.get("university") or "").lower() == school]
    exact = [r for r in pool if norm_name(r.get("name")) == target]
    if exact:
        return exact
    surname = target.split()[-1]
    return [r for r in pool if surname and surname in norm_name(r.get("name")).split()][:6]


def check_department(message, dataset, school):
    """Departments the message names that the dataset has nothing for.

    Split into two answers, because they need opposite responses: a department
    the university does not have (census.NOT_OFFERED) is a reply to the
    reporter, while one it has and we failed to collect is crawler work.
    """
    known = {r.get("department") for r in dataset
             if not school or (r.get("university") or "").lower() == school}
    # Word n-grams, not a greedy character class: department names run one to
    # four words ("oceanography", "earth and atmospheric sciences") and a regex
    # loose enough to catch the long ones swallows the whole sentence.
    words = re.findall(r"[A-Za-z&]+", message.lower())
    hits = []
    for n in range(1, 5):
        for i in range(len(words) - n + 1):
            slug = re.sub(r"[^a-z0-9]+", "-", " ".join(words[i:i + n])).strip("-")
            slug = taxonomy.canonical_slug(slug)
            if slug and slug in taxonomy.CANONICAL and slug not in known:
                hits.append(slug)
    not_offered = census.NOT_OFFERED.get(school, set())
    gaps = sorted({h for h in hits if h not in not_offered})
    absent = sorted({h for h in hits if h in not_offered})
    return gaps, absent


def triage_one(item, dataset, by_id):
    """Everything a fix would need to know, gathered before anyone opens an editor."""
    findings, action = [], None
    school = item["school"].lower()
    cat = item["category"].lower()

    page = PROF_PAGE.search(item["page"] or "")
    if page:
        rec = by_id.get(page.group("id"))
        if rec:
            missing = [f for f in ("email", "photo_url", "research_summary",
                                   "ai_review", "scholar_interests")
                       if not rec.get(f)]
            findings.append(
                f"page is {rec['name']} ({rec.get('department', '?')}, "
                f"{rec.get('university', '?')}) — id {rec['id']}")
            if missing:
                findings.append(f"that record is missing: {', '.join(missing)}")
            action = f"edit the record for {rec['name']} in crawler/faculty*.json, then merge.py --sync-sources"
        else:
            findings.append(f"page references id {page.group('id')}, which is NOT in the dataset")
            action = "dead profile link — check whether merge.py collapsed this id into an alias"

    if "missing" in cat:
        names = candidate_names(item["message"])
        absent = []
        for name in names:
            hits = find_people(dataset, name, school)
            if not hits:
                absent.append(name)
                findings.append(f"'{name}' — no match in the dataset{' for ' + school if school else ''}")
            else:
                for h in hits[:3]:
                    findings.append(
                        f"'{name}' — already present as {h['name']} "
                        f"({h.get('department', '?')}, {h.get('university', '?')})")
        gaps, not_offered = check_department(item["message"], dataset, school)
        if not_offered:
            findings.append(
                f"{school or 'that school'} has no {', '.join(not_offered)} department "
                f"— recorded in census.NOT_OFFERED, not a collection failure")
            action = action or (f"no work: reply that {school} does not have a "
                                f"{not_offered[0]} department")
        if gaps:
            findings.append(f"department(s) named with no records here: {', '.join(gaps)}")
            action = action or f"crawl the {gaps[0]} listing for {school or 'that school'}; check census.py --audit first"
        if action is None:
            if names and not absent:
                # Reported as missing but every name is already there: the record
                # exists and the reporter could not find it, which is a search
                # problem, not a crawl one. Crawling again would change nothing.
                action = ("every name given is already in the dataset — treat as a search/"
                          "discoverability bug, not a missing record")
            elif absent:
                action = (f"confirm {absent[0]} is on the department site, then extend "
                          f"{school or 'that school'}'s crawler")
            else:
                action = "no name recognised in the message — ask the reporter which professor"

    if "incorrect" in cat and not action:
        action = "locate the record, correct it in the crawler source, re-run merge.py --sync-sources"
    if "feature" in cat:
        action = "product decision — no dataset work implied"

    return findings, action or "read the message and decide; no automatic signal"


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", default="open", choices=["open", "closed", "all"])
    ap.add_argument("--issue", type=int, help="triage a single issue number")
    ap.add_argument("--out", help="also write the report to this path")
    args = ap.parse_args()

    dataset = load_dataset()
    by_id = {r["id"]: r for r in dataset}
    issues = gh_issues(args.state, args.issue)

    lines = [f"# Feedback triage", "",
             f"{len(issues)} {args.state} issue(s) labelled `feedback` · "
             f"dataset: {len(dataset)} records", ""]

    if not issues:
        lines += ["Nothing to triage.", ""]
    for issue in sorted(issues, key=lambda i: i["number"], reverse=True):
        item = parse(issue)
        findings, action = triage_one(item, dataset, by_id)
        lines += [
            f"## #{item['number']} · {item['category']}"
            + (f" · `{item['school']}`" if item["school"] else ""),
            "",
            f"{item['url']} · filed {item['created']}"
            + (f" · state {item['state'].lower()}" if item["state"] else ""),
            "",
            "> " + (item["message"].replace("\n", "\n> ") or "(empty)"),
            "",
        ]
        if item["page"]:
            lines += [f"Page: `{item['page']}`", ""]
        if findings:
            lines += ["**Checked:**"] + [f"- {f}" for f in findings] + [""]
        lines += [f"**Suggested action:** {action}", ""]
        if item["email"]:
            lines += [f"_Reporter left a reply address._", ""]

    report = "\n".join(lines)
    print(report)
    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
        print(f"\n(written to {args.out})", file=sys.stderr)


if __name__ == "__main__":
    main()
