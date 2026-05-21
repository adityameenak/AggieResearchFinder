import os
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tamurf.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from db.models import Base as B  # noqa: F401
    B.metadata.create_all(bind=engine)
    _migrate_add_university()


def _migrate_add_university():
    """Add faculty.university column to pre-existing DBs and backfill as 'tamu'.

    Why: SQLAlchemy's create_all is no-op for existing tables, so the new column
    introduced when going multi-university wouldn't be added otherwise. Safe to
    re-run — checks for column presence first.
    """
    inspector = inspect(engine)
    if "faculty" not in inspector.get_table_names():
        return
    cols = {c["name"] for c in inspector.get_columns("faculty")}
    if "university" in cols:
        return
    with engine.begin() as conn:
        conn.execute(text(
            "ALTER TABLE faculty ADD COLUMN university VARCHAR NOT NULL DEFAULT 'tamu'"
        ))
        conn.execute(text("UPDATE faculty SET university = 'tamu' WHERE university IS NULL OR university = ''"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_faculty_university ON faculty (university)"))
