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
from app.routers import alerts, events
from app.services.alerts import refresh_alerts


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager creating tables and running initial alert evaluations on startup."""
    create_db_and_tables()
    with Session(engine) as session:
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
app.include_router(events.router, prefix="/api/v1")
app.include_router(alerts.router, prefix="/api/v1")

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
