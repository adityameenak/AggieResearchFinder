import uuid
import os
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import ResumeSession
from services import parser

router = APIRouter()

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload")
async def upload_resume(
    file: UploadFile = File(...),
    interests: str = Form(default=""),
    db: Session = Depends(get_db),
):
    # Validate file type
    filename = file.filename or ""
    if not filename.lower().endswith((".pdf", ".docx", ".doc")):
        raise HTTPException(
            status_code=422,
            detail="Only PDF and DOCX files are supported.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")

    # Extract text
    try:
        raw_text = parser.extract_text(filename, file_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Text extraction failed: {e}")

    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="No text could be extracted from the file.")

    # Parse into structured profile
    parsed_profile = parser.parse_resume(raw_text)

    # Persist session
    session_id = str(uuid.uuid4())
    session = ResumeSession(
        id=session_id,
        filename=filename,
        raw_text=raw_text[:50000],  # cap stored text
        parsed_profile=parsed_profile,
        interests=interests,
    )
    db.add(session)
    db.commit()

    return {
        "session_id": session_id,
        "parsed_profile": parsed_profile,
        "interests": interests,
        "mock_mode": parser.llm.MOCK_MODE,
    }


@router.get("/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    session = db.query(ResumeSession).filter(ResumeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {
        "session_id": session.id,
        "filename": session.filename,
        "parsed_profile": session.parsed_profile,
        "interests": session.interests,
    }
