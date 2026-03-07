from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import FacultyRecord, ResumeSession
from services import emailer
from routers.faculty import _to_dict

router = APIRouter()


class DraftRequest(BaseModel):
    faculty_id: str
    tone: Literal["professional", "warm", "concise"] = "professional"
    session_id: str | None = None
    interests: str = ""


@router.post("/draft")
def draft_email(req: DraftRequest, db: Session = Depends(get_db)):
    # Load faculty
    prof_record = db.query(FacultyRecord).filter(FacultyRecord.id == req.faculty_id).first()
    if not prof_record:
        raise HTTPException(status_code=404, detail="Faculty not found.")
    prof = _to_dict(prof_record)

    # Load resume context if session provided
    resume_profile = {}
    interests = req.interests
    if req.session_id:
        session = db.query(ResumeSession).filter(ResumeSession.id == req.session_id).first()
        if session:
            resume_profile = session.parsed_profile or {}
            if not interests:
                interests = session.interests or ""

    draft = emailer.generate_draft(
        prof=prof,
        resume_profile=resume_profile,
        interests=interests,
        tone=req.tone,
    )

    return {
        "faculty_id": req.faculty_id,
        "session_id": req.session_id,
        **draft,
        "mock_mode": emailer.llm.MOCK_MODE,
    }
