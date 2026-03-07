from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import FacultyRecord, ResumeSession
from services import matcher
from routers.faculty import _to_dict

router = APIRouter()


class MatchRequest(BaseModel):
    session_id: str
    interests: str = ""
    top_n: int = 20


@router.post("")
def run_match(req: MatchRequest, db: Session = Depends(get_db)):
    # Load session
    session = db.query(ResumeSession).filter(ResumeSession.id == req.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Please upload a resume first.")

    # Effective interests: prefer request body (user may have updated them)
    interests = req.interests.strip() or session.interests or ""
    resume_profile = session.parsed_profile or {}

    # Load faculty
    faculty_records = db.query(FacultyRecord).all()
    if not faculty_records:
        raise HTTPException(
            status_code=503,
            detail="No faculty data loaded. Run POST /api/faculty/import first.",
        )
    faculty = [_to_dict(r) for r in faculty_records]

    results = matcher.match_faculty(
        faculty=faculty,
        interests=interests,
        resume_profile=resume_profile,
        top_n=min(req.top_n, 50),
    )

    return {
        "session_id": req.session_id,
        "interests": interests,
        "resume_profile": resume_profile,
        "total": len(results),
        "matches": results,
        "mock_mode": matcher.llm.MOCK_MODE,
    }
