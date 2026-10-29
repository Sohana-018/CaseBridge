import os
import sqlite3
import sys
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from scripts.migrate_sqlite_to_postgres import (
    InvalidSnapshotError,
    TOPOLOGICAL_TABLES,
    normalize_value,
    validate_snapshot_file,
)


def test_topological_table_order():
    """Verify tables with foreign keys appear after their referenced parents."""
    assert TOPOLOGICAL_TABLES.index("institutions") < TOPOLOGICAL_TABLES.index("cases")
    assert TOPOLOGICAL_TABLES.index("cases") < TOPOLOGICAL_TABLES.index("case_events")
    assert TOPOLOGICAL_TABLES.index("cases") < TOPOLOGICAL_TABLES.index("overlap_links")
    assert TOPOLOGICAL_TABLES.index("cases") < TOPOLOGICAL_TABLES.index("alerts")
    assert TOPOLOGICAL_TABLES.index("overlap_links") < TOPOLOGICAL_TABLES.index("alerts")


def test_validate_snapshot_refuses_nonexistent_path(tmp_path: Path):
    """Verify non-existent snapshot path raises InvalidSnapshotError."""
    fake_path = tmp_path / "nonexistent.db"
    with pytest.raises(InvalidSnapshotError, match="Snapshot file not found"):
        validate_snapshot_file(fake_path)


def test_validate_snapshot_refuses_live_database():
    """Verify live app database path is refused."""
    live_path = Path("backend/casebridge.db")
    with pytest.raises(InvalidSnapshotError, match="Refusing to run against primary development/live database"):
        validate_snapshot_file(live_path)


def test_validate_snapshot_refuses_uncheckpointed_wal(tmp_path: Path):
    """Verify snapshot accompanied by non-empty WAL file is refused."""
    db_file = tmp_path / "test_snapshot.db"
    conn = sqlite3.connect(db_file.as_posix())
    conn.execute("CREATE TABLE t (id INT);")
    conn.commit()
    conn.close()

    wal_file = tmp_path / "test_snapshot.db-wal"
    wal_file.write_bytes(b"uncheckpointed bytes")

    with pytest.raises(InvalidSnapshotError, match="Uncheckpointed WAL file detected"):
        validate_snapshot_file(db_file)


def test_normalize_value_cross_dialect_equivalences():
    """Verify datatypes normalize deterministically across SQLite and Postgres representations."""
    # Booleans
    assert normalize_value(1, "boolean") is True
    assert normalize_value(0, "boolean") is False
    assert normalize_value(True, "boolean") is True
    assert normalize_value(False, "boolean") is False

    # JSON strings vs parsed objects
    assert normalize_value('["a", "b"]') == '["a", "b"]'
    assert normalize_value(["a", "b"]) == '["a", "b"]'
    assert normalize_value('{"y": 2, "x": 1}') == '{"x": 1, "y": 2}'
    assert normalize_value({"x": 1, "y": 2}) == '{"x": 1, "y": 2}'

    # None
    assert normalize_value(None) is None
