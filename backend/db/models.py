import uuid
from sqlalchemy import Column, String, Text, Float, Integer, DateTime, JSON
from sqlalchemy.sql import func
from db.database import Base


class FacultyRecord(Base):
    __tablename__ = "faculty"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    title = Column(String)
    department = Column(String)
    email = Column(String)
    profile_url = Column(String)
    lab_website = Column(String)
    research_summary = Column(Text)


class ResumeSession(Base):
    __tablename__ = "resume_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String)
    raw_text = Column(Text)
    parsed_profile = Column(JSON)   # structured resume data dict
    interests = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
