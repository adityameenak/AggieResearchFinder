"""
What counts as a *valid* value in a faculty record.

census.py used to count any non-empty field as good, which overstated the
dataset badly: UT Dallas read 100% email while 603 of its 606 records carried
the profile site's footer address (oris@utdallas.edu), and MIT read 98% photos
while 104 were the EECS department logo. This module is the single definition
of "real value vs. filler", imported by both:

  census.py --quality   to report violations (the regression gate), and
  merge.py              to remove them on every merge (clean()).

merge.py applies clean() *after* carry_forward(), so the rules are idempotent:
junk carried forward from the previous dataset is stripped again every time,
rather than needing the two-pass clear that enriched fields otherwise require.

Pure functions, no I/O. The `counts` arguments are Counters over the whole
dataset, built once by value_counts(); repetition across unrelated people is the
most reliable placeholder signal there is.
"""
import collections, re
from urllib.parse import urlparse

# ── Repetition thresholds ────────────────────────────────────────────────
# Every photo URL used by 3+ records was verified to be a placeholder or logo.
# Lab links need a higher bar: real research centres are legitimately shared by
# 2-3 PIs (newtcenter.org, psalserver.tamu.edu), while junk repeats 8+ times.
PHOTO_REPEAT = 3
EMAIL_REPEAT = 3
LAB_REPEAT = 8


def value_counts(records):
    """Counters of email/photo/lab values across the dataset."""
    c = {"email": collections.Counter(), "photo_url": collections.Counter(),
         "lab_website": collections.Counter()}
    for r in records:
        for f in c:
            v = (r.get(f) or "").strip().lower()
            if v:
                c[f][v] += 1
    return c


# ── Email ────────────────────────────────────────────────────────────────
# Office mailboxes. Matched on the local part so a single-record office address
# (a department's advising box on one profile) is still caught.
_OFFICE_LOCAL_RE = re.compile(
    r"^(info|admin|office|oris|bexec|clinical[_.]?affairs|advising|.*-advising|"
    r"under-info|grad-info|webmaster|contact|help|dept|department|frontdesk)$"
    r"|_(affairs|office|biosciences|department)$", re.I)


def is_shared_email(email, counts=None):
    e = (email or "").strip().lower()
    if not e:
        return False
    if counts and counts["email"][e] >= EMAIL_REPEAT:
        return True
    return bool(_OFFICE_LOCAL_RE.search(e.split("@")[0]))


# ── Photo ────────────────────────────────────────────────────────────────
_PLACEHOLDER_PHOTO_RE = re.compile(
    r"placeholder|/default[^/]*\.(png|jpe?g)|default_images|no-photo|silhouette|"
    r"_ilogo|-logo|logo[_-]|/icons?/|\.svg(\?|$)", re.I)


def is_placeholder_photo(url, counts=None):
    u = (url or "").strip()
    if not u:
        return False
    if counts and counts["photo_url"][u.lower()] >= PHOTO_REPEAT:
        return True
    return bool(_PLACEHOLDER_PHOTO_RE.search(u))


# ── Links ────────────────────────────────────────────────────────────────
# Hosts that are never a lab website: social media, photo galleries, course
# pages, mailing lists, admissions, and funders' home pages.
_JUNK_LINK_HOSTS = (
    "flickr.com", "flic.kr", "bsky.app", "twitter.com", "x.com", "facebook.com",
    "instagram.com", "linkedin.com", "youtube.com", "youtu.be", "tiktok.com",
    "instructure.com", "mailman.mit.edu", "mitadmissions.org",
    "student.mit.edu", "orcid.org", "researchgate.net", "nsf.gov", "nih.gov",
    "ieee.org", "utsystem.edu", "scholar.google.com",
)
# Program pages scraped off a department sidebar, one per whole department.
_JUNK_LINK_URLS = ("nsfstep.math.tamu.edu",)


def _host(url):
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def fix_scheme(url):
    """'scholar.google.com/…' and ' https://…' → a usable absolute URL."""
    u = (url or "").strip()
    if u and not re.match(r"^https?://", u, re.I) and "." in u.split("/")[0]:
        u = "https://" + u
    return u


def is_junk_link(url, counts=None):
    u = fix_scheme(url)
    if not u:
        return False
    if counts and counts["lab_website"][(url or "").strip().lower()] >= LAB_REPEAT:
        return True
    h = _host(u)
    if any(h == d or h.endswith("." + d) for d in _JUNK_LINK_HOSTS):
        return True
    return any(j in u.lower() for j in _JUNK_LINK_URLS)


def is_bad_scholar(url):
    """A Scholar *profile* has user=; searches, clusters and Books links don't."""
    u = (url or "").strip()
    return bool(u) and "user=" not in u


# ── Text ─────────────────────────────────────────────────────────────────
# Navigation captured as a research summary. Anchored or distinctive phrases
# only — see crawl.py _looks_like_menu for why this must stay narrow.
_MENU_RE = re.compile(
    r"^research research\b|skip to (main|content)|toggle navigation|"
    r"close the .{0,30}menu|faculty & research menu|^research areas seminars|"
    r"^see here research areas", re.I)  # UT math: "See here" links out, no text

# TAMU Health pages append the whole site footer, pipe-joined, to the last
# section. Everything from the first footer cell on is chrome.
# On five records the footer is the whole summary, so the leading pipe is optional.
_HEALTH_FOOTER_RE = re.compile(r"(?:^|\s*\|)\s*Texas A&M Health\s*\|\s*Dentistry\s*\|.*$", re.S)


def is_menu_text(s):
    return bool(_MENU_RE.search((s or "").strip()))


def strip_footer(s):
    return _HEALTH_FOOTER_RE.sub("", s or "")


_MOJIBAKE_RE = re.compile(r"Ã.|Â[\s©®°·]|â€")


def has_mojibake(s):
    return bool(_MOJIBAKE_RE.search(s or ""))


# A UTF-8 lead byte (Â-ô) followed by continuation bytes, as they look after
# being decoded as cp1252. cp1252 maps 0x80-0x9F to curly quotes, €, ™ etc.
_MOJIBAKE_RUN_RE = re.compile(
    "[Â-ô][\u0080-¿ŒœŠšŸŽž"
    "ƒˆ˜–—‘-„†-•…‰"
    "‹›€™]{1,3}")


def _fix_run(m):
    run = m.group(0)
    for enc in ("cp1252", "latin-1"):
        try:
            return run.encode(enc).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return run


def fix_mojibake(s):
    """Undo UTF-8 bytes that were decoded as Latin-1/cp1252.

    Repairs run by run rather than round-tripping the whole string, because the
    scraped text is mixed: most of a TAMU Health summary is correct and only
    some spans are double-encoded, so a whole-string re-decode fails on the
    correct characters. A run that doesn't decode is left as it was.
    """
    if not has_mojibake(s):
        return s
    s = _MOJIBAKE_RUN_RE.sub(_fix_run, s)
    # Remnants whose trailing byte was already lost upstream: a no-break space
    # normalised to a plain one leaves a bare "Â", and a closing quote whose
    # last byte was dropped leaves "â€".
    return re.sub(r"Â(?=\s)", "", s).replace("â€ ", "” ").replace(" ", " ")


# A review that describes the site's section headings, not the research — the
# model was handed "Research Research Facilities and Equipment" and dutifully
# summarized it.
_JUNK_REVIEW_RE = re.compile(
    r"focuses on (research )?(facilities|centers|laboratories|equipment|"
    r"news|events|people)\b|(facilities|centers) and (equipment|laboratories)\b",
    re.I)
_REFUSAL_RE = re.compile(
    r"please provide|i need (that|the) text|i don't have any information|"
    r"no research information|as an ai\b", re.I)
MIN_REVIEW = 120


def is_junk_review(s):
    s = (s or "").strip()
    if not s:
        return False
    return (len(s) < MIN_REVIEW or bool(_JUNK_REVIEW_RE.search(s))
            or bool(_REFUSAL_RE.search(s[:200])))


# ── Names ────────────────────────────────────────────────────────────────
_HONORIFIC_RE = re.compile(r"^(dr|prof|professor)\.?\s+", re.I)
# Degrees and post-nominals that trail a name, comma- or space-separated.
_DEGREE = (r"ph\.?\s?d|m\.?d|d\.?d\.?s|d\.?m\.?d|dmsc|m\.?s|m\.?sc|m\.?p\.?h|"
           r"dr\.?p\.?h|m\.?b\.?a|j\.?d|b\.?d\.?s|m\.?a|m\.?s\.?d|pharm\.?d|"
           r"r\.?n|m\.?s\.?n|d\.?n\.?p|p\.?e|facp|faan|fada|mph|cph|rdh|mds|"
           r"ms\.?ed|ed\.?d|psy\.?d|fics|facd|bsdh|b\.?s|b\.?a|mhs|msph|dsc|mdiv")
# The comma is required: degree abbreviations collide with real surnames
# ("Qiaochu Ma" is not a Master of Arts), and every credentialed name in the
# data writes them comma-separated.
_TRAILING_DEGREES_RE = re.compile(
    rf"\s*,\s*((?:(?:{_DEGREE})\.?)(?:\s*[,/]\s*(?:{_DEGREE})\.?)*)\s*$", re.I)

# Listing pages the UT mechanical engineering crawl scraped as if they were
# people ("Open Faculty Positions", "Emeritus Faculty").
_NOT_A_PERSON_RE = re.compile(
    r"^((open|retired|adjunct|affiliated|emeritus|visiting)\s+)?faculty(\s+positions)?$", re.I)


def is_not_a_person(name):
    return bool(_NOT_A_PERSON_RE.match(" ".join((name or "").split())))


def split_name(name):
    """'Dr. Zhou Chen, DDS, MS' -> ('Zhou Chen', 'DDS, MS').

    Also flips 'Gustafson, Robert' -> 'Robert Gustafson'. Suffixes that are
    part of the name (Jr., III) are left alone.
    """
    n = " ".join((name or "").split())
    creds = ""
    m = _TRAILING_DEGREES_RE.search(n)
    if m and m.start() > 0:
        creds = m.group(1).strip(" ,")
        n = n[:m.start()].rstrip(" ,")
    n = _HONORIFIC_RE.sub("", n)
    # "Last, First" — exactly one comma, and the tail is not a suffix.
    if n.count(",") == 1:
        last, first = (p.strip() for p in n.split(","))
        if first and not re.fullmatch(r"(jr|sr|ii|iii|iv)\.?", first, re.I) \
                and " " not in last:
            n = f"{first} {last}"
    return n, creds


# ── Titles and rank ──────────────────────────────────────────────────────
# Titles that are not a position at all — award lines and alumni blurbs that
# the TAMU artsci parser took for the title.
_NOT_A_TITLE_RE = re.compile(r"^(\d{4} graduate|aps fellow|distinguished|retired)$", re.I)

_RANK_WORD_RE = re.compile(
    r"\b(professor|lecturer|instructor|scientist|researcher|preceptor)\b", re.I)
# Where a second role starts after the rank phrase: a separator, or a new role
# noun that Harvard and MIT run straight on with no punctuation ("…Professor of
# Chemistry Howard Hughes Medical Institute Investigator").
_ROLE_BREAK_RE = re.compile(
    r"\s*[;|,]\s*|\s+(?=(?:and\s+)?(?:Director|Co-Director|Affiliate|Howard Hughes|"
    r"Chair|Head|Dean|Associate Dean|Faculty|Member|Investigator|Professor|"
    r"Lecturer|Senior|Principal|\())")

_EMERITUS_RE = re.compile(r"\bemerit(us|a|i)\b|\bretired\b", re.I)
_ADJUNCT_RE = re.compile(r"\b(adjunct|affiliate(d)?|courtesy|joint|secondary)\b", re.I)
_VISITING_RE = re.compile(r"\bvisiting\b", re.I)
_TEACHING_RE = re.compile(
    r"\b(lecturer|instructor|instructional|of instruction|teaching|"
    r"(of|in) (the )?practice|clinical)\b", re.I)
# A tenure-line rank anywhere in the title outranks the teaching words — a
# "Professor of Physics and Instructional Lab Director" is research faculty.
_RESEARCH_RANK_RE = re.compile(
    r"\b(?<!instructional )(?<!clinical )(?<!adjunct )(?<!visiting )"
    r"(assistant |associate |full |distinguished |university |regents )?professor\b"
    r"(?! of (instruction|practice|the practice))", re.I)


def is_non_title(title):
    """An award line, an alumni blurb, a lone adjective, or scraped navigation."""
    t = (title or "").strip()
    return bool(_NOT_A_TITLE_RE.match(t)) or bool(re.search(r"skip to (main|content)", t, re.I))


def _clip(s, n=80):
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + "…"


def short_title(title):
    """The first rank phrase for cards: 'Professor of Chemistry', not the chair list.

    Keeps the whole segment the rank word sits in (so the discipline and any
    'Emeritus' survive) and cuts where the next role begins.
    """
    t = " ".join((title or "").split())
    if len(t) <= 60:
        return t
    m = _RANK_WORD_RE.search(t)
    if not m:
        return _clip(t, 60)
    # Segment start: the last separator before the rank word.
    start = max(t.rfind(sep, 0, m.start()) for sep in (";", "|", ","))
    start = 0 if start < 0 else start + 1
    brk = _ROLE_BREAK_RE.search(t, m.end())
    end = brk.start() if brk else len(t)
    return _clip(t[start:end].strip(" ,;|-"))


def rank_type(title):
    """research | teaching | emeritus | adjunct | visiting.

    A blank or unrecognized title is 'research' — absence of a title is not
    evidence of anything, the same rule is_non_faculty() follows in merge.py.
    """
    t = title or ""
    if _EMERITUS_RE.search(t):
        return "emeritus"
    if _VISITING_RE.search(t):
        return "visiting"
    if _RESEARCH_RANK_RE.search(t) and not _ADJUNCT_RE.search(t):
        return "research"
    if _ADJUNCT_RE.search(t):
        return "adjunct"
    if _TEACHING_RE.search(t):
        return "teaching"
    return "research"


# ── Report + clean ───────────────────────────────────────────────────────
# (name, predicate(record, counts)) — what census.py --quality counts.
DETECTORS = [
    ("shared_email",  lambda r, c: is_shared_email(r.get("email"), c)),
    ("placeholder_photo", lambda r, c: is_placeholder_photo(r.get("photo_url"), c)),
    ("junk_lab_link", lambda r, c: is_junk_link(r.get("lab_website"), c)),
    ("bad_scholar",   lambda r, c: is_bad_scholar(r.get("google_scholar"))),
    ("menu_summary",  lambda r, c: is_menu_text(r.get("research_summary"))),
    ("footer_summary", lambda r, c: strip_footer(r.get("research_summary")) != (r.get("research_summary") or "")),
    ("junk_review",   lambda r, c: is_junk_review(r.get("ai_review"))),
    ("mojibake",      lambda r, c: any(has_mojibake(r.get(f)) for f in
                                       ("name", "title", "research_summary", "ai_review"))),
    ("name_honorific", lambda r, c: split_name(r.get("name")) != (" ".join((r.get("name") or "").split()), "")),
    ("non_title",     lambda r, c: is_non_title(r.get("title"))),
    ("not_a_person",  lambda r, c: is_not_a_person(r.get("name"))),
]


def clean(records):
    """Remove filler values in place. Returns a Counter of what changed.

    Never drops a record and never changes an id — ids are md5(profile_url),
    so bookmarks and alias_ids survive any amount of cleaning.
    """
    counts = value_counts(records)
    changed = collections.Counter()
    for r in records:
        for f in ("name", "title", "research_summary", "ai_review", "office"):
            if has_mojibake(r.get(f)):
                fixed = fix_mojibake(r[f])
                if fixed != r[f]:
                    r[f] = fixed
                    changed["mojibake"] += 1

        name, creds = split_name(r.get("name"))
        if name and name != r.get("name"):
            r["name"] = name
            changed["name"] += 1
        if creds and not r.get("credentials"):
            r["credentials"] = creds

        if is_shared_email(r.get("email"), counts):
            r["email"] = ""
            changed["shared_email"] += 1
        if is_placeholder_photo(r.get("photo_url"), counts):
            r["photo_url"] = ""
            changed["placeholder_photo"] += 1
        for f in ("lab_website", "google_scholar", "profile_url"):
            if r.get(f):
                fixed = fix_scheme(r[f])
                if fixed != r[f]:
                    r[f] = fixed
                    changed["url_scheme"] += 1
        if is_junk_link(r.get("lab_website"), counts):
            r["lab_website"] = ""
            changed["junk_lab_link"] += 1
        if is_bad_scholar(r.get("google_scholar")):
            r["google_scholar"] = ""
            changed["bad_scholar"] += 1

        s = r.get("research_summary") or ""
        stripped = strip_footer(s)
        if stripped != s:
            r["research_summary"] = s = stripped
            changed["footer_summary"] += 1
        if is_menu_text(s):
            r["research_summary"] = ""
            changed["menu_summary"] += 1
        if is_junk_review(r.get("ai_review")):
            r["ai_review"] = ""
            changed["junk_review"] += 1

        # Rank from the title as scraped, before a non-title is blanked —
        # "Retired" is not a position but it is still evidence of emeritus.
        # A blank title carries no signal, so it keeps a rank set by an earlier
        # pass rather than resetting it — clean() must be idempotent.
        if r.get("title") or not r.get("rank_type"):
            r["rank_type"] = rank_type(r.get("title"))
        if is_non_title(r.get("title")):
            r["title"] = ""
            changed["non_title"] += 1
        t = " ".join((r.get("title") or "").split())
        if t != (r.get("title") or ""):
            r["title"] = t
        r["title_short"] = short_title(t)
    return changed
