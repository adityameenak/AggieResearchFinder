#!/usr/bin/env python3
"""
Generate research overview paragraphs from research summaries without an API.
Uses varied sentence templates to produce natural-sounding text.
"""
import json, re, random, hashlib
from pathlib import Path

FACULTY_JSON = Path(__file__).parent / "faculty.json"

DEPT_NAMES = {
    'aerospace': 'Aerospace Engineering', 'biomedical': 'Biomedical Engineering',
    'chemical': 'Chemical Engineering', 'civil': 'Civil & Environmental Engineering',
    'cse': 'Computer Science & Engineering', 'electrical': 'Electrical & Computer Engineering',
    'etid': 'Engineering Technology & Industrial Distribution',
    'industrial': 'Industrial & Systems Engineering', 'materials': 'Materials Science & Engineering',
    'mechanical': 'Mechanical Engineering', 'nuclear': 'Nuclear Engineering',
    'ocean': 'Ocean Engineering', 'petroleum': 'Petroleum Engineering',
    'biology': 'Biology', 'chemistry': 'Chemistry', 'mathematics': 'Mathematics',
    'physics-astronomy': 'Physics & Astronomy', 'statistics': 'Statistics',
    'oceanography': 'Oceanography', 'psychological-brain-sciences': 'Psychological & Brain Sciences',
}


def clean_summary(raw):
    """Clean the raw research summary into usable topics."""
    filler = [
        r'Research\s+Research\s*', r'Research\s+Facilities\s+and\s+Equipment\s*',
        r'Faculty\s+Research\s+Specialty\s+Areas?\s*', r'Undergraduate\s+Research\s*',
        r'Seminars?\s+and\s+Distinguished\s+Lectures?\s*', r'Research\s+Areas?\s*',
        # Navigation/menu junk from TAMU pages
        r'Close the\s+\w[\w\s&]*menu\.?',
        r'(Research|Instructional|Emeritus)\s+Faculty\s*',
        r'Joint\s+Appointments?\s*',
        r'Chemistry\s+Facilities\s*',
        r'Centers?\s+and\s+Institutes?\s*',
        r'Faculty\s+&\s+Research\s*',
        r'People\s+Directory\s*',
        r'Faculty\s+Directory\s*',
    ]
    text = raw
    for pat in filler:
        text = re.sub(pat, '', text, flags=re.I)

    parts = re.split(r'\s*\|\s*|\n', text)
    topics = []
    seen = set()
    for p in parts:
        p = p.strip().rstrip('.')
        if len(p) < 3 or len(p) > 300:
            continue
        if re.match(r'^(Research|Faculty|Labs?|Seminars?|Home|About|Contact|People|Close|Directory)\s*$', p, re.I):
            continue
        # Skip navigation fragments
        if re.search(r'(Close the|menu\b|Directory|Faculty\s+&)', p, re.I):
            continue
        low = p.lower()
        if low not in seen:
            seen.add(low)
            topics.append(p)
    return topics


def join_list(items):
    """Join a list into natural English: 'a, b, and c'."""
    if len(items) == 0:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ', '.join(items[:-1]) + f', and {items[-1]}'


def deterministic_choice(options, seed_str):
    """Pick from options deterministically based on a seed string."""
    idx = int(hashlib.md5(seed_str.encode()).hexdigest(), 16) % len(options)
    return options[idx]


def generate_review(name, dept, summary, scholar_interests=None):
    """Generate a varied, natural-sounding research overview."""
    topics = clean_summary(summary)
    if not topics:
        return ""

    dept_full = DEPT_NAMES.get(dept, dept.replace('-', ' ').title())
    parts = name.split()
    last_name = parts[-1] if parts else "This researcher"
    # Use full name seed for deterministic variation
    seed = name + dept

    interests = scholar_interests or []
    # Deduplicate interests against topics
    topic_lower = set(t.lower() for t in topics)
    unique_interests = [i for i in interests if i.lower() not in topic_lower]

    is_keywords = (sum(len(t) for t in topics) / len(topics)) < 50

    sentences = []

    # --- Opening sentence ---
    if is_keywords and len(topics) >= 2:
        # Deduplicate: topics may appear both as "X Y Z" and individual "X", "Y", "Z"
        # Keep only the most specific (longer) form
        final_topics = []
        for t in topics:
            # Skip if this topic is a substring of another topic already kept
            is_sub = False
            for ft in final_topics:
                if t.lower() in ft.lower() and t.lower() != ft.lower():
                    is_sub = True
                    break
            if not is_sub:
                # Also remove any previously kept topic that is a substring of this one
                final_topics = [ft for ft in final_topics if ft.lower() not in t.lower() or ft.lower() == t.lower()]
                final_topics.append(t)
        topics = final_topics

        primary = [t.lower() for t in topics[:3]]

        openers = [
            f"Dr. {last_name} is a researcher in the Department of {dept_full} with expertise in {join_list(primary)}.",
            f"Based in {dept_full} at Texas A&M, Dr. {last_name}'s research centers on {join_list(primary)}.",
            f"Dr. {last_name}'s research program in {dept_full} focuses on {join_list(primary)}.",
            f"Working within {dept_full}, Dr. {last_name} conducts research in {join_list(primary)}.",
            f"As a member of the {dept_full} department, Dr. {last_name} specializes in {join_list(primary)}.",
        ]
        sentences.append(deterministic_choice(openers, seed + "open"))

        # --- Middle: additional areas ---
        secondary = [t.lower() for t in topics[3:7]]
        if secondary:
            middles = [
                f"Their work also addresses {join_list(secondary)}.",
                f"Additional research interests include {join_list(secondary)}.",
                f"They also contribute to work in {join_list(secondary)}.",
                f"Beyond their primary focus, they investigate {join_list(secondary)}.",
            ]
            sentences.append(deterministic_choice(middles, seed + "mid"))

        remaining = [t.lower() for t in topics[7:]]
        if remaining:
            extras = [
                f"Other areas of activity include {join_list(remaining[:3])}.",
                f"Their broader research portfolio extends to {join_list(remaining[:3])}.",
            ]
            sentences.append(deterministic_choice(extras, seed + "extra"))

    elif len(topics) >= 1:
        # Longer-form descriptions or few topics
        long_topics = [t for t in topics if len(t) > 80]
        short_topics = [t.lower() for t in topics if len(t) <= 80]

        if long_topics:
            first_long = long_topics[0]
            if not first_long[0].isupper():
                first_long = first_long[0].upper() + first_long[1:]
            openers = [
                f"Dr. {last_name} is a researcher in {dept_full}. {first_long}",
                f"Working in {dept_full} at Texas A&M, Dr. {last_name}'s research involves the following: {first_long}",
            ]
            s = deterministic_choice(openers, seed + "longopen")
            if not s.endswith('.'):
                s += '.'
            sentences.append(s)

            for lt in long_topics[1:2]:
                if not lt.endswith('.'):
                    lt += '.'
                sentences.append(lt)
        elif short_topics:
            openers = [
                f"Dr. {last_name}'s research in {dept_full} focuses on {join_list(short_topics[:3])}.",
                f"As a faculty member in {dept_full}, Dr. {last_name} works in the areas of {join_list(short_topics[:3])}.",
            ]
            sentences.append(deterministic_choice(openers, seed + "shortopen"))
            if len(short_topics) > 3:
                sentences.append(f"They also pursue research in {join_list(short_topics[3:6])}.")

    # --- Scholar interests sentence ---
    if unique_interests:
        int_items = unique_interests[:4]
        scholar_sentences = [
            f"Their Google Scholar profile highlights research interests in {join_list(int_items)}.",
            f"On Google Scholar, their listed interests include {join_list(int_items)}.",
            f"Scholar profile topics include {join_list(int_items)}, reflecting the breadth of their work.",
        ]
        sentences.append(deterministic_choice(scholar_sentences, seed + "scholar"))

    # --- Closing ---
    if len(sentences) >= 2:
        closers = [
            f"Students interested in these areas may find Dr. {last_name}'s lab a strong fit for research opportunities.",
            f"This interdisciplinary focus makes Dr. {last_name}'s group relevant to students across multiple specializations.",
            f"Prospective students with interests in these topics are encouraged to review Dr. {last_name}'s recent publications for more detail.",
            f"Dr. {last_name}'s research group offers opportunities at the intersection of several important areas in {dept_full}.",
        ]
        sentences.append(deterministic_choice(closers, seed + "close"))

    if not sentences:
        return ""

    return ' '.join(sentences)


def main():
    data = json.load(FACULTY_JSON.open(encoding="utf-8"))

    # Only overwrite locally-generated reviews (keep good Gemini ones)
    need = []
    for i, r in enumerate(data):
        review = r.get("ai_review", "")
        summary = (r.get("research_summary") or "").strip()

        # Needs a review if missing and has summary data
        if not review and len(summary) >= 40:
            need.append((i, r))
        # Replace our earlier formulaic reviews
        elif review and "faculty member in" in review[:80]:
            need.append((i, r))
        # Replace bad Gemini placeholder responses
        elif review and review.startswith("Please provide"):
            need.append((i, r))
        # Replace reviews with navigation junk
        elif review and ("Close the" in review or "Faculty & Research menu" in review
                         or "Instructional Faculty" in review):
            need.append((i, r))

    print(f"Total records: {len(data)}")
    print(f"Need review (new + replacing formulaic): {len(need)}")

    generated = 0
    for idx, r in need:
        review = generate_review(
            r["name"],
            r.get("department", ""),
            r.get("research_summary", ""),
            r.get("scholar_interests"),
        )
        if review:
            data[idx]["ai_review"] = review
            generated += 1

    FACULTY_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Generated {generated} reviews. Saved to {FACULTY_JSON}")


if __name__ == "__main__":
    main()
