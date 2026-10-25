import os
from pathlib import Path
from typing import Generator
from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

# Load environment variables from backend/.env if present
BASE_DIR = Path(__file__).resolve().parent.parent
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./casebridge.db")

# SQLite requires check_same_thread=False for FastAPI concurrency
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args,
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
    except Exception:
        pass


def get_session() -> Generator[Session, None, None]:
    """Dependency that yields an active database session."""
    with Session(engine) as session:
        yield session
