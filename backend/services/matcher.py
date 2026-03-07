"""
Hybrid faculty-matching: keyword overlap (primary) + resume context (secondary).

The ranking is interest-driven: the student's stated interests dominate.
The resume provides a secondary boost and context for explanation generation.
"""
import re
from services import llm

EXPLAIN_SYSTEM = """\
You are a helpful academic advisor assistant. Given a professor's research profile
and a student's interests and background, write a 2-sentence explanation of why
this professor is a good match. Be specific — mention the professor's actual
research topics and the student's relevant interests or skills. Do not use
generic phrases like "aligns perfectly". Sound natural and direct.
"""


# ---------------------------------------------------------------------------
# Tokenization (mirrors ui/src/utils/search.js)
# ---------------------------------------------------------------------------

def tokenize(text: str) -> list[str]:
    if not text:
        return []
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return [t for t in text.split() if len(t) >= 2]


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _count_token_hits(tokens: list[str], haystack: str) -> float:
    score = 0.0
    hl = haystack.lower()
    for token in tokens:
        count = hl.count(token)
        if count:
            score += count
            score += 1.5  # bonus for any presence
    return score


def score_professor(prof: dict, interest_tokens: list[str], resume_tokens: list[str]) -> float:
    research = prof.get("research_summary") or ""
    name = prof.get("name") or ""
    dept = prof.get("department") or ""
    haystack = f"{research} {name} {dept}"

    # Primary: interest tokens vs full haystack (+ extra weight on research summary)
    primary = _count_token_hits(interest_tokens, haystack)
    # Extra bonus when token appears in research summary specifically
    for token in interest_tokens:
        if token in research.lower():
            primary += 2

    # Secondary: resume inferred tokens vs research summary only (0.35 weight)
    secondary = _count_token_hits(resume_tokens, research) * 0.35

    return primary + secondary


# ---------------------------------------------------------------------------
# Fit labels
# ---------------------------------------------------------------------------

def _fit_label(score: float, max_score: float) -> str:
    if max_score == 0:
        return "adjacent_fit"
    ratio = score / max_score
    if ratio >= 0.6:
        return "strong_fit"
    elif ratio >= 0.25:
        return "exploratory_fit"
    return "adjacent_fit"


# ---------------------------------------------------------------------------
# Mock explanation
# ---------------------------------------------------------------------------

def _mock_explanation(prof: dict, interests: str, resume_profile: dict) -> str:
    name = prof.get("name", "This professor")
    dept_map = {
        "chemical": "Chemical Engineering", "mechanical": "Mechanical Engineering",
        "cse": "Computer Science", "electrical": "Electrical Engineering",
        "materials": "Materials Science", "civil": "Civil Engineering",
        "nuclear": "Nuclear Engineering", "industrial": "Industrial Engineering",
        "ocean": "Ocean Engineering", "petroleum": "Petroleum Engineering",
    }
    dept = dept_map.get(prof.get("department", ""), prof.get("department", "their department"))
    research = (prof.get("research_summary") or "")[:120].rstrip()
    interest_snippet = (interests or "")[:80].rstrip()

    themes = resume_profile.get("inferred_themes") or []
    resume_hint = f" Your background in {themes[0]} adds relevant context." if themes else ""

    return (
        f"Prof. {name}'s research in {dept} focuses on {research}…, "
        f"which closely relates to your stated interest in {interest_snippet}.{resume_hint}"
    )


# ---------------------------------------------------------------------------
# Real LLM explanation
# ---------------------------------------------------------------------------

def _llm_explanation(prof: dict, interests: str, resume_profile: dict) -> str:
    themes = ", ".join((resume_profile.get("inferred_themes") or [])[:5]) or "general engineering"
    skills = ", ".join((resume_profile.get("technical_skills") or [])[:5]) or "various tools"
    prompt = (
        f"Professor: {prof.get('name')}, {prof.get('department')} department\n"
        f"Research: {(prof.get('research_summary') or '')[:400]}\n\n"
        f"Student stated interests: {interests}\n"
        f"Student inferred themes from resume: {themes}\n"
        f"Student skills: {skills}\n\n"
        "Write the 2-sentence match explanation."
    )
    try:
        return llm.chat(EXPLAIN_SYSTEM, prompt, max_tokens=200)
    except Exception as exc:
        print(f"[matcher] explanation LLM call failed ({exc}), using mock")
        return _mock_explanation(prof, interests, resume_profile)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def match_faculty(
    faculty: list[dict],
    interests: str,
    resume_profile: dict,
    top_n: int = 20,
    min_score: float = 0.1,
) -> list[dict]:
    """
    Rank faculty by fit and return top_n results with scores, fit labels, and explanations.

    Each result dict:
      professor   – full faculty record
      score       – raw numeric score
      fit_label   – 'strong_fit' | 'exploratory_fit' | 'adjacent_fit'
      explanation – 1-2 sentence natural-language reason for the match
      rank        – 1-based rank
    """
    interest_tokens = tokenize(interests)
    resume_tokens = tokenize(
        " ".join(
            (resume_profile.get("inferred_themes") or [])
            + (resume_profile.get("technical_skills") or [])
            + (resume_profile.get("coursework") or [])
            + (resume_profile.get("lab_techniques") or [])
        )
    )

    # Score every professor
    scored = []
    for prof in faculty:
        s = score_professor(prof, interest_tokens, resume_tokens)
        if s >= min_score:
            scored.append((s, prof))

    if not scored:
        # If nothing matched, return all faculty with equal score
        scored = [(1.0, p) for p in faculty]

    scored.sort(key=lambda x: x[0], reverse=True)
    scored = scored[:top_n]
    max_score = scored[0][0] if scored else 1.0

    results = []
    for rank, (score, prof) in enumerate(scored, start=1):
        fit = _fit_label(score, max_score)

        # Only call LLM for top results to save cost
        if not llm.MOCK_MODE and rank <= 10:
            explanation = _llm_explanation(prof, interests, resume_profile)
        else:
            explanation = _mock_explanation(prof, interests, resume_profile)

        results.append({
            "professor": prof,
            "score": round(score, 4),
            "fit_label": fit,
            "explanation": explanation,
            "rank": rank,
        })

    return results
