import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import init_db, SessionLocal
from db.models import FacultyRecord


# ---------------------------------------------------------------------------
# Faculty auto-import on startup
# ---------------------------------------------------------------------------

def _auto_import_faculty():
    CANDIDATES = [
        Path(__file__).parent.parent / "ui" / "public" / "faculty.json",
        Path(__file__).parent / "data" / "faculty.json",
    ]
    db = SessionLocal()
    try:
        if db.query(FacultyRecord).count() > 0:
            return
        for path in CANDIDATES:
            if path.exists():
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                for item in data:
                    db.add(FacultyRecord(**{k: v for k, v in item.items() if hasattr(FacultyRecord, k)}))
                db.commit()
                print(f"✓ Auto-imported {len(data)} faculty records from {path}")
                return
        print("⚠ No faculty.json found — run POST /api/faculty/import after placing faculty.json.")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _auto_import_faculty()
    yield


app = FastAPI(
    title="TAMUResearchFinder API",
    description="Backend for research discovery, resume parsing, matching, and email drafting.",
    version="1.0.0",
    lifespan=lifespan,
)

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

from routers import faculty, resume, match
from routers import email as email_router

app.include_router(faculty.router, prefix="/api/faculty", tags=["Faculty"])
app.include_router(resume.router, prefix="/api/resume", tags=["Resume"])
app.include_router(match.router, prefix="/api/match", tags=["Match"])
app.include_router(email_router.router, prefix="/api/email", tags=["Email"])


@app.get("/api/health", tags=["Health"])
def health():
    from services.llm import MOCK_MODE
    return {"status": "ok", "version": "1.0.0", "mock_mode": MOCK_MODE}
