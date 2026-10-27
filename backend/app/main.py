import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables from backend/.env if present
BASE_DIR = Path(__file__).resolve().parent.parent
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()

# Import models to ensure they are registered with SQLModel.metadata
import app.models  # noqa: F401
from sqlmodel import Session
from app.db import create_db_and_tables, engine
from app.errors import register_error_handlers
from app.auth_utils import seed_default_users_and_config
from app.routers import admin, alerts, auth, cases, dashboard, events, institutions, overlaps, reports
from app.services.alerts import refresh_alerts


def auto_seed_demo_data(session: Session) -> None:
    """Idempotently seed demo data on startup if cases table is empty (AUTO_SEED=true)."""
    import sys
    from sqlmodel import select
    from app.models import Case

    # Check if the cases table is already populated
    first_case = session.exec(select(Case.id).limit(1)).first()
    if first_case is not None:
        return

    # Resolve repository root and seed directory (handling both root and backend working directories)
    repo_root = Path(__file__).resolve().parent.parent.parent
    if str(repo_root) not in sys.path:
        sys.path.insert(0, str(repo_root))

    backend_dir = Path(__file__).resolve().parent.parent
    seed_dir = None
    for candidate in [
        repo_root / "data" / "seed",
        backend_dir / "data" / "seed",
        Path("data/seed").resolve(),
    ]:
        if (candidate / "cases.csv").exists():
            seed_dir = candidate
            break

    if seed_dir is None:
        print("[Auto-Seed] Warning: data/seed not found, skipping auto-seed.")
        return

    print(f"[Auto-Seed] Empty database detected with AUTO_SEED=true. Seeding demo data from {seed_dir}...")
    try:
        import scripts.seed_demo as seed_demo_mod
        bind = session.get_bind() if hasattr(session, "get_bind") else (getattr(session, "bind", None) or engine)
        seed_demo_mod.engine = bind
        seed_demo_mod.seed_demo()
    except Exception as e:
        print(f"[Auto-Seed] Note from seed_demo: {e}")

    try:
        from scripts.import_csv import import_csv
        res = import_csv(session=session, seed_dir=seed_dir)
        print(f"[Auto-Seed] Finished importing seed CSVs: {res}")
    except Exception as e:
        print(f"[Auto-Seed] Error importing CSVs: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager creating tables, seeding users/config, and running alert evaluations."""
    create_db_and_tables()
    with Session(engine) as session:
        seed_default_users_and_config(session)
        auto_seed = os.getenv("AUTO_SEED", "false").lower() in ("true", "1", "yes")
        if auto_seed:
            auto_seed_demo_data(session)
        refresh_alerts(session)
    yield


app = FastAPI(
    title="CaseBridge API",
    version="1.0.0",
    description="Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases",
    lifespan=lifespan,
)

# Register shared error handlers (PRD Section 10 contract)
register_error_handlers(app)

# Include API routers under /api/v1
app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(institutions.router, prefix="/api/v1")
app.include_router(cases.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(overlaps.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")

# Parse CORS origins from environment
raw_cors = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174")
origins = [origin.strip() for origin in raw_cors.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    """Root endpoint welcoming visitors and linking to health and docs."""
    return {
        "name": "CaseBridge API",
        "status": "running",
        "health": "/api/v1/health",
        "docs": "/docs",
    }


@app.get("/api/v1/health")
def health_check():
    """Health check endpoint returning API status."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=["app"],
    )
