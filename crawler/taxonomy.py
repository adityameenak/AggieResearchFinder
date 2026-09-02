#!/usr/bin/env python3
"""
The canonical STEM department vocabulary shared by every school.

Why this exists: each crawler was written against one university's own naming,
so the same discipline ended up with different slugs per school — Rice and UT
called biology "biosciences", MIT called psychology "brain-cognitive-sciences",
and four schools each had their own name for earth science. Filtering
"Bioengineering" at Texas A&M returned nothing, because A&M's crawler emits
"biomedical". `merge.py` runs every record through `canonical_slug()` so the UI
sees one vocabulary.

Adding a school: map its department names onto CANONICAL below. Only add a new
canonical slug when the discipline genuinely isn't already here — a new slug
means a new label in ui/src/utils/search.js DEPT_DISPLAY and new entries in the
three badge-colour maps, or it renders grey with a raw slug showing.
"""

# ── Canonical slugs → display label ──────────────────────────────────────
# Keep in sync with DEPT_DISPLAY in ui/src/utils/search.js. This is the
# authoritative list; the UI map is the mirror.
CANONICAL = {
    # Engineering
    "aerospace":    "Aerospace Engineering",
    "biomedical":   "Biomedical Engineering",
    "chemical":     "Chemical Engineering",
    "civil":        "Civil & Environmental",
    "cse":          "Computer Science & Eng.",
    "electrical":   "Electrical & Computer Eng.",
    "etid":         "Engineering Technology",
    "industrial":   "Industrial & Systems",
    "materials":    "Materials Science",
    "mechanical":   "Mechanical Engineering",
    "nuclear":      "Nuclear Engineering",
    "ocean":        "Ocean Engineering",
    "petroleum":    "Petroleum Engineering",

    # Natural sciences
    "biology":              "Biology",
    "chemistry":            "Chemistry",
    "mathematics":          "Mathematics",
    "physics-astronomy":    "Physics & Astronomy",
    "statistics":           "Statistics",
    "applied-physics":      "Applied Physics",
    "earth-atmospheric":    "Earth & Atmospheric Sciences",
    "oceanography":         "Oceanography",
    "psychological-brain-sciences": "Psych. & Brain Sciences",

    # Health & life sciences
    "public-health":    "Public Health",
    "medicine":         "Medicine",
    "nursing":          "Nursing",
    "pharmacy":         "Pharmacy",
    "dentistry":        "Dentistry",
    "veterinary":       "Veterinary Medicine",
    "neuroscience":     "Neuroscience",
    "genetics":         "Genetics & Genomics",
    "immunology":       "Immunology & Microbiology",
    "nutrition":        "Nutrition & Food Science",
    "kinesiology":      "Kinesiology & Health",
}

# ── Aliases → canonical ──────────────────────────────────────────────────
# Left side is a slug some crawler already emits. Every entry here is a
# deliberate judgement that two schools were naming the same discipline.
ALIASES = {
    # Rice/UT "biosciences" is the same undergraduate-facing discipline as
    # A&M/UTD/MIT "biology".
    "biosciences":              "biology",
    # Rice/UTD/MIT/Harvard "bioengineering" == A&M/UT "biomedical engineering".
    "bioengineering":           "biomedical",
    # MIT's department name for what every other school calls psychology.
    "brain-cognitive-sciences": "psychological-brain-sciences",
    # Rice Computational & Applied Mathematics is a maths department.
    "cmor":                     "mathematics",
    # MIT EAPS and UTD Geosciences are both earth/atmospheric science.
    "earth-atmospheric-planetary": "earth-atmospheric",
    "geosciences":              "earth-atmospheric",
    # Rice Earth, Environmental & Planetary Sciences.
    "earth-environmental":      "earth-atmospheric",
    # Harvard SEAS "Environmental Science & Engineering" is the environmental
    # half of what other schools bundle into civil & environmental.
    "environmental":            "civil",
    # Rice Systems & Synthetic Biology is a bioengineering group (n=1).
    "systems-synthetic-biology": "biomedical",
    # UTD Systems Engineering is A&M's industrial & systems (n=1).
    "systems-engineering":      "industrial",
}

# Deliberately NOT merged, despite looking similar:
#   ocean (A&M Ocean Engineering) vs oceanography (A&M Oceanography) — one is
#   an engineering department, the other a natural science. A&M runs both.
#   applied-physics (Harvard) vs physics-astronomy — Harvard SEAS applied
#   physics is a distinct engineering-side department.


def canonical_slug(slug):
    """Map any crawler-emitted slug onto the canonical vocabulary.

    Unknown slugs pass through unchanged so a new crawler's output is never
    silently dropped — `audit_slugs()` is what surfaces them.
    """
    if not slug:
        return slug
    s = str(slug).strip().lower()
    return ALIASES.get(s, s)


def label(slug):
    """Display label for a canonical slug (falls back to the slug itself)."""
    return CANONICAL.get(canonical_slug(slug), slug)


def audit_slugs(slugs):
    """Return slugs that are neither canonical nor aliased.

    Anything returned here needs either a CANONICAL entry (new discipline) or
    an ALIASES entry (existing discipline under a new name) — and, if
    canonical, a matching DEPT_DISPLAY label in the UI.
    """
    unknown = set()
    for s in slugs:
        c = canonical_slug(s)
        if c and c not in CANONICAL:
            unknown.add(c)
    return sorted(unknown)
