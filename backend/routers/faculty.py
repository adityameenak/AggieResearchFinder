import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import FacultyRecord

router = APIRouter()

FACULTY_JSON_CANDIDATES = [
    Path(__file__).parent.parent.parent / "ui" / "public" / "faculty.json",
    Path(__file__).parent.parent / "data" / "faculty.json",
]


@router.get("")
def list_faculty(db: Session = Depends(get_db)):
    records = db.query(FacultyRecord).all()
    return [_to_dict(r) for r in records]


@router.get("/{faculty_id}")
def get_faculty(faculty_id: str, db: Session = Depends(get_db)):
    record = db.query(FacultyRecord).filter(FacultyRecord.id == faculty_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Faculty not found")
    return _to_dict(record)


@router.post("/import")
def import_faculty(db: Session = Depends(get_db)):
    """
    Import faculty records from faculty.json.
    Idempotent: upserts by ID so re-running is safe.
    """
    path = None
    for candidate in FACULTY_JSON_CANDIDATES:
        if candidate.exists():
            path = candidate
            break

    if path is None:
        raise HTTPException(
            status_code=404,
            detail="faculty.json not found. Place it at ui/public/faculty.json or backend/data/faculty.json.",
        )

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    upserted = 0
    for item in data:
        existing = db.query(FacultyRecord).filter(FacultyRecord.id == item["id"]).first()
        if existing:
            for k, v in item.items():
                if hasattr(existing, k):
                    setattr(existing, k, v)
        else:
            db.add(FacultyRecord(**{k: v for k, v in item.items() if hasattr(FacultyRecord, k)}))
        upserted += 1

    db.commit()
    return {"imported": upserted, "source": str(path)}


def _to_dict(r: FacultyRecord) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "title": r.title,
        "department": r.department,
        "email": r.email,
        "profile_url": r.profile_url,
        "lab_website": r.lab_website,
        "research_summary": r.research_summary,
        "google_scholar": r.google_scholar,
        "ai_review": r.ai_review,
        "photo_url": r.photo_url,
        "phone": r.phone,
        "office": r.office,
        "scholar_interests": r.scholar_interests,
        "publications": r.publications,
    }
