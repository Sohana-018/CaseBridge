import os
import sys
from pathlib import Path
import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Configure fast bcrypt hashing for test suite
os.environ["BCRYPT_ROUNDS"] = "4"

postgres_test_url = os.getenv("POSTGRES_TEST_URL")

if postgres_test_url:
    # Disable external emails completely during Postgres tests
    os.environ["EMAIL_BACKEND"] = "none"
    os.environ["RESEND_API_KEY"] = ""
    os.environ["DATABASE_URL"] = postgres_test_url
    os.environ["TESTING"] = "0"

    import sqlmodel
    import sqlalchemy
    from sqlalchemy import text
    import app.models  # noqa: F401
    import app.db

    _orig_sqlmodel_create_engine = sqlmodel.create_engine
    _orig_sqlalchemy_create_engine = sqlalchemy.create_engine

    _pg_engine = _orig_sqlmodel_create_engine(
        postgres_test_url,
        echo=False,
        pool_pre_ping=True,
    )
    app.db.engine = _pg_engine

    def _patched_create_engine(url, *args, **kwargs):
        if str(url).startswith("sqlite"):
            if "connect_args" in kwargs:
                kwargs["connect_args"] = {
                    k: v for k, v in kwargs["connect_args"].items() if k != "check_same_thread"
                }
            if "poolclass" in kwargs:
                kwargs.pop("poolclass", None)
            return _pg_engine
        return _orig_sqlmodel_create_engine(url, *args, **kwargs)

    sqlmodel.create_engine = _patched_create_engine
    sqlalchemy.create_engine = _patched_create_engine

    # Intercept drop_all to preserve tables and fast-truncate between tests
    _orig_drop_all = sqlmodel.SQLModel.metadata.drop_all

    def _safe_drop_all(bind=None, **kwargs):
        target = bind or _pg_engine
        if getattr(getattr(target, "dialect", None), "name", "") == "postgresql":
            with target.begin() as conn:
                conn.execute(
                    text(
                        "TRUNCATE TABLE alerts, case_events, cases, config, counters, institutions, overlap_links, users RESTART IDENTITY CASCADE;"
                    )
                )
            return
        return _orig_drop_all(bind=bind, **kwargs)

    sqlmodel.SQLModel.metadata.drop_all = _safe_drop_all

    @pytest.fixture(autouse=True)
    def clean_postgres_db():
        """Ensure clean slate for each test running against isolated Postgres."""
        sqlmodel.SQLModel.metadata.create_all(_pg_engine)
        with _pg_engine.begin() as conn:
            conn.execute(
                text(
                    "TRUNCATE TABLE alerts, case_events, cases, config, counters, institutions, overlap_links, users RESTART IDENTITY CASCADE;"
                )
            )
        yield
else:
    os.environ["TESTING"] = "1"
