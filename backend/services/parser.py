"""
Resume parsing: extract text from PDF/DOCX, then parse into structured profile
via LLM (real) or keyword heuristics (mock).
"""
import re
from pathlib import Path
from services import llm

PARSE_SYSTEM = """\
You are a precise resume parser for an academic research-matching tool.
Extract structured information from the resume text and return ONLY valid JSON.
Do not include any explanation outside the JSON object.

Return this exact schema:
{
  "name": string | null,
  "year": string | null,
  "major": string | null,
  "gpa": string | null,
  "coursework": [string],
  "technical_skills": [string],
  "software_tools": [string],
  "lab_techniques": [string],
  "research_experiences": [{"title": string, "lab": string, "description": string}],
  "project_experiences": [{"title": string, "description": string}],
  "inferred_themes": [string]
}

"inferred_themes" should be broad research areas you infer from the resume content,
e.g. "machine learning", "materials science", "biomedical engineering".
"""


def extract_text_pdf(file_bytes: bytes) -> str:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = [page.get_text() for page in doc]
    return "\n".join(pages)


def extract_text_docx(file_bytes: bytes) -> str:
    import io
    from docx import Document
    doc = Document(io.BytesIO(file_bytes))
    return "\n".join(para.text for para in doc.paragraphs)


def extract_text(filename: str, file_bytes: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return extract_text_pdf(file_bytes)
    elif ext in (".docx", ".doc"):
        return extract_text_docx(file_bytes)
    raise ValueError(f"Unsupported file type: {ext}. Please upload a PDF or DOCX.")


# ---------------------------------------------------------------------------
# Mock parser — keyword heuristics, no LLM
# ---------------------------------------------------------------------------

_TECH_SKILLS = [
    "python", "matlab", "r", "java", "c++", "c#", "javascript", "typescript",
    "sql", "julia", "fortran", "labview", "tensorflow", "pytorch", "scikit-learn",
    "pandas", "numpy", "opencv", "ros", "ansys", "comsol", "autocad", "solidworks",
]
_LAB_TECHNIQUES = [
    "sem", "tem", "xrd", "ftir", "nmr", "pcr", "hplc", "gc-ms",
    "electrochemistry", "cell culture", "microscopy", "spectroscopy",
    "chromatography", "flow cytometry", "raman", "afm",
]
_THEME_KEYWORDS = {
    "machine learning": ["neural", "deep learning", "machine learning", "nlp", "ai", "transformer"],
    "robotics": ["robot", "control system", "autonomous", "drone", "manipulation"],
    "energy storage": ["battery", "fuel cell", "supercapacitor", "electrode", "electrolyte"],
    "materials science": ["material", "polymer", "alloy", "composite", "thin film", "nanomaterial"],
    "biomedical engineering": ["biomedical", "tissue", "implant", "drug delivery", "cell", "clinical"],
    "sustainability": ["sustainability", "renewable", "carbon", "co2", "climate", "green"],
    "fluid dynamics": ["fluid", "cfd", "turbulence", "flow", "aerodynamics"],
    "semiconductors": ["semiconductor", "transistor", "cmos", "ic design", "photovoltaic"],
    "computational methods": ["simulation", "finite element", "molecular dynamics", "modeling"],
}


def _mock_parse(text: str) -> dict:
    lower = text.lower()

    skills = [s for s in _TECH_SKILLS if s in lower]
    techniques = [t for t in _LAB_TECHNIQUES if t in lower]
    themes = [theme for theme, kws in _THEME_KEYWORDS.items() if any(k in lower for k in kws)]

    # Try to find a name from the first non-empty line
    first_line = next((ln.strip() for ln in text.split("\n") if ln.strip()), None)
    name = first_line if first_line and len(first_line.split()) <= 4 else None

    # Try to detect year
    year = None
    for label in ["freshman", "sophomore", "junior", "senior", "graduate", "ph.d", "phd", "master"]:
        if label in lower:
            year = label.title()
            break

    # Try to detect major
    major = None
    for m in ["chemical engineering", "mechanical engineering", "electrical engineering",
              "computer science", "materials science", "civil engineering",
              "biomedical engineering", "aerospace engineering", "industrial engineering"]:
        if m in lower:
            major = m.title()
            break

    return {
        "name": name,
        "year": year,
        "major": major,
        "gpa": None,
        "coursework": [],
        "technical_skills": skills,
        "software_tools": [],
        "lab_techniques": techniques,
        "research_experiences": [],
        "project_experiences": [],
        "inferred_themes": themes,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_resume(text: str) -> dict:
    """Return a structured profile dict from raw resume text."""
    if llm.MOCK_MODE:
        return _mock_parse(text)

    try:
        # Truncate to avoid token overflow (~4000 chars is plenty)
        truncated = text[:6000]
        return llm.chat_json(PARSE_SYSTEM, f"Resume text:\n\n{truncated}", max_tokens=1500)
    except Exception as exc:
        # Fall back to mock if LLM call fails
        print(f"[parser] LLM call failed ({exc}), using mock parser")
        return _mock_parse(text)
