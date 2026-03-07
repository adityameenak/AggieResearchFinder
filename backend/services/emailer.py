"""
Email draft generation: produces a personalized cold-outreach email from a
student to a professor. Uses Claude when ANTHROPIC_API_KEY is set, otherwise
returns a polished template-based draft.
"""
from services import llm

DRAFT_SYSTEM = """\
You are helping a university student write a professional cold-outreach email
to a professor about potential research opportunities.

Rules:
- Sound like a real, thoughtful student — not a form letter.
- Be concise: 3-4 short paragraphs.
- Reference specific aspects of the professor's actual research.
- Mention the student's relevant background naturally (do not list every skill).
- Express genuine curiosity and ask about opportunities — do not presume acceptance.
- Do NOT use phrases like "I am deeply passionate" or "I would be honored".
- End with a clear, polite call to action.

Format your response exactly as:
Subject: [subject line]

[email body — starting with "Dear Prof. [name],"]
"""

TONE_NOTES = {
    "professional": "Tone: formal and professional, appropriate for a faculty email.",
    "warm": "Tone: warm and conversational while remaining respectful.",
    "concise": "Tone: very concise — keep the email under 200 words. Get to the point quickly.",
}


def _parse_draft(raw: str) -> dict[str, str]:
    """Split the raw LLM output into subject and body."""
    lines = raw.strip().splitlines()
    subject = ""
    body_lines = []
    in_body = False
    for line in lines:
        if not in_body and line.lower().startswith("subject:"):
            subject = line[len("subject:"):].strip()
        elif subject and not in_body and line.strip() == "":
            in_body = True
        elif in_body:
            body_lines.append(line)
    body = "\n".join(body_lines).strip()
    return {"subject": subject, "body": body}


def _template_draft(
    prof: dict,
    resume_profile: dict,
    interests: str,
    tone: str,
) -> dict[str, str]:
    """Return a polished template-based draft when LLM is unavailable."""
    student_name = (resume_profile or {}).get("name") or "Student"
    major = (resume_profile or {}).get("major") or "Engineering"
    year = (resume_profile or {}).get("year") or ""
    year_str = f"{year} " if year else ""
    skills = ((resume_profile or {}).get("technical_skills") or [])[:3]
    skills_str = ", ".join(skills) if skills else "engineering tools and methods"

    research_snippet = ((prof.get("research_summary") or "")[:160]).rstrip(".,")
    interests_snippet = (interests or "")[:120]
    prof_name = prof.get("name", "Professor")

    subject = f"Research Opportunity Inquiry — {student_name}"

    if tone == "concise":
        body = f"""\
Dear Prof. {prof_name},

I am {student_name}, a {year_str}{major} student at Texas A&M. I came across your research on {research_snippet}… and it resonates strongly with my interest in {interests_snippet}.

I would love to know if there are any opportunities to contribute to your lab. I have experience with {skills_str} and am eager to apply it in a research setting. My resume is attached.

Would you be open to a brief meeting to discuss?

Best regards,
{student_name}
Texas A&M University"""

    elif tone == "warm":
        body = f"""\
Dear Prof. {prof_name},

I hope this message finds you well! My name is {student_name}, and I'm a {year_str}{major} student at Texas A&M. I recently read about your work on {research_snippet}… and found myself genuinely excited — it connects closely with what I've been exploring in {interests_snippet}.

I'd love to learn more about your research and whether there's any way I could contribute. I have some background in {skills_str} and am always looking to grow in a real research environment. I've attached my resume in case it's helpful.

Thanks so much for taking the time to read this — I'd really welcome the chance to chat!

Warm regards,
{student_name}
Texas A&M University"""

    else:  # professional
        body = f"""\
Dear Prof. {prof_name},

My name is {student_name}, and I am a {year_str}{major} student at Texas A&M University. I have been exploring research opportunities in {interests_snippet} and came across your work on {research_snippet}…, which I found particularly compelling.

I am writing to inquire whether there are openings in your research group for an undergraduate/graduate research assistant. My background includes experience with {skills_str}, and I am committed to contributing meaningfully to an ongoing project.

I have attached my resume for your consideration. I would welcome the opportunity to discuss your current research directions at your convenience.

Thank you for your time.

Sincerely,
{student_name}
Texas A&M University"""

    return {"subject": subject, "body": body, "tone": tone}


def generate_draft(
    prof: dict,
    resume_profile: dict,
    interests: str,
    tone: str = "professional",
) -> dict[str, str]:
    """
    Generate an outreach email draft.
    Returns {"subject": str, "body": str, "tone": str}.
    """
    if llm.MOCK_MODE:
        return _template_draft(prof, resume_profile, interests, tone)

    student_name = (resume_profile or {}).get("name") or "the student"
    major = (resume_profile or {}).get("major") or "engineering"
    year = (resume_profile or {}).get("year") or ""
    skills = ", ".join(((resume_profile or {}).get("technical_skills") or [])[:5]) or "various tools"
    themes = ", ".join(((resume_profile or {}).get("inferred_themes") or [])[:4]) or interests

    prompt = (
        f"Professor: Prof. {prof.get('name')}\n"
        f"Title: {prof.get('title', '')}\n"
        f"Department: {prof.get('department', '')}\n"
        f"Research summary: {(prof.get('research_summary') or '')[:500]}\n\n"
        f"Student name: {student_name}\n"
        f"Student year/major: {year} {major}\n"
        f"Student stated interests: {interests}\n"
        f"Student inferred themes: {themes}\n"
        f"Student skills: {skills}\n\n"
        f"{TONE_NOTES.get(tone, TONE_NOTES['professional'])}\n\n"
        "Write the email now."
    )

    try:
        raw = llm.chat(DRAFT_SYSTEM, prompt, max_tokens=700)
        result = _parse_draft(raw)
        result["tone"] = tone
        return result
    except Exception as exc:
        print(f"[emailer] LLM call failed ({exc}), using template")
        return _template_draft(prof, resume_profile, interests, tone)
