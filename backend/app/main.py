import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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


def is_maintenance_mode() -> bool:
    """Check if SYSTEM_MAINTENANCE_MODE environment flag is active."""
    return os.getenv("SYSTEM_MAINTENANCE_MODE", "false").lower() in ("true", "1", "yes")


# Allowed state-changing endpoints during maintenance mode:
# Only the exact authentication endpoint(s) required to authenticate health checks/monitoring probes.
MAINTENANCE_ALLOWLIST_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/mock-login",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager creating tables, seeding users/config, and running alert evaluations."""
    # Gate DDL execution: runtime role casebridge_app performs NO DDL at boot.
    # RUN_DDL=true is only set during one-time manual initialization under admin role.
    run_ddl = os.getenv("RUN_DDL", "false").lower() in ("true", "1", "yes")
    is_sqlite = str(engine.url).startswith("sqlite")
    if is_sqlite or run_ddl:
        create_db_and_tables()

    auto_seed = os.getenv("AUTO_SEED", "false").lower() in ("true", "1", "yes")
    run_seed_import = os.getenv("RUN_SEED_IMPORT", "false").lower() in ("true", "1", "yes")
    maintenance_active = is_maintenance_mode()

    with Session(engine) as session:
        # In maintenance mode, suspend all background writes, auto-seeding, and alert refresh
        if maintenance_active:
            print("[Lifespan] SYSTEM_MAINTENANCE_MODE=true: skipping all background seeding, imports, and alert evaluations.")
        else:
            # Decouple all seeding from boot: production starts with AUTO_SEED=false
            # and NO automatic seeding, import, demo-user, or demo-config creation.
            if auto_seed or run_seed_import:
                seed_default_users_and_config(session)
                auto_seed_demo_data(session)

            # Skip background alert evaluation on boot during automated testing
            if os.getenv("TESTING") != "1" and not os.getenv("POSTGRES_TEST_URL") and not os.getenv("POSTGRES_APP_URL"):
                refresh_alerts(session)
    yield


app = FastAPI(
    title="CaseBridge API",
    version="1.0.0",
    description="Integrated Dashboard for Monitoring and Tracking Institution-Related Complaint Cases",
    lifespan=lifespan,
)

# Register maintenance mode middleware (blocks all state-changing writes with 503)
@app.middleware("http")
async def maintenance_mode_middleware(request: Request, call_next):
    if is_maintenance_mode():
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            norm_path = request.url.path.rstrip("/")
            if norm_path not in MAINTENANCE_ALLOWLIST_PATHS:
                return JSONResponse(
                    status_code=503,
                    content={
                        "error": {
                            "code": "MAINTENANCE_MODE",
                            "message": "System is currently in maintenance mode. Database modifications are temporarily disabled.",
                            "details": {
                                "method": request.method,
                                "path": request.url.path,
                            },
                        }
                    },
                )
    return await call_next(request)

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

# Parse CORS origins from environment (strip trailing paths if accidentally provided)
raw_cors = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174")
origins: list[str] = []
for item in raw_cors.split(","):
    item = item.strip()
    if not item:
        continue
    if "://" in item:
        parts = item.split("/")
        origins.append(f"{parts[0]}//{parts[2]}")
    else:
        origins.append(item)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    """Root endpoint welcoming visitors and linking to health and docs."""
    return {
        "name": "CaseBridge API",
        "status": "running",
        "health": "/api/v1/health",
        "docs": "/docs",
    }


@app.api_route("/api/v1/health", methods=["GET", "HEAD"])
def health_check():
    """Health check endpoint returning API status."""
    return {"status": "ok"}


@app.api_route("/health", methods=["GET", "HEAD"])
def health_root():
    """Root health check endpoint returning API status for cloud container orchestrators."""
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
