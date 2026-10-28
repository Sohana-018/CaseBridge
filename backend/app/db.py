import os
from pathlib import Path
from typing import Generator
from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

# Load environment variables from backend/.env if present
BASE_DIR = Path(__file__).resolve().parent.parent
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if os.getenv("TESTING") == "1":
        DATABASE_URL = "sqlite:///:memory:"
    else:
        DATABASE_URL = f"sqlite:///{(BASE_DIR / 'casebridge.db').as_posix()}"

# SQLite requires check_same_thread=False for FastAPI concurrency
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine_kwargs = {"echo": False, "connect_args": connect_args}
if DATABASE_URL == "sqlite:///:memory:":
    engine_kwargs["poolclass"] = StaticPool

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs,
)


def create_db_and_tables(target_engine=None) -> None:
    """Create all SQLModel database tables and migrate missing columns if needed."""
    eng = target_engine or engine
    SQLModel.metadata.create_all(eng)

    try:
        from sqlalchemy import text
        with eng.connect() as conn:
            rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            existing_cols = {r[1] for r in rows}
            if existing_cols:
                if "username" not in existing_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR"))
                if "hashed_password" not in existing_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN hashed_password VARCHAR"))
                if "email" not in existing_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR"))
                if "is_active" not in existing_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
                if "created_at" not in existing_cols:
                    conn.execute(text("ALTER TABLE users ADD COLUMN created_at DATETIME"))
                conn.commit()

            case_rows = conn.execute(text("PRAGMA table_info(cases)")).fetchall()
            existing_case_cols = {r[1] for r in case_rows}
            if existing_case_cols:
                if "complainant_name" not in existing_case_cols:
                    conn.execute(text("ALTER TABLE cases ADD COLUMN complainant_name VARCHAR"))
                if "complainant_email" not in existing_case_cols:
                    conn.execute(text("ALTER TABLE cases ADD COLUMN complainant_email VARCHAR"))
                conn.commit()
    except Exception:
        pass


def get_session() -> Generator[Session, None, None]:
    """Dependency provider yielding a scoped database session."""
    with Session(engine) as session:
        yield session
