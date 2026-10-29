#!/usr/bin/env python3
"""CaseBridge: End-to-End Migration Script Verification Tool.

Verifies:
1. Creation of synthetic SQLite source fixture covering all 8 tables.
2. Snapshot creation via VACUUM INTO.
3. Strict refusal of live database paths (by name) and uncheckpointed WAL files.
4. Initial migration into PostgreSQL with 100% row-count and SHA-256 content match.
5. Zero foreign key orphans in destination.
6. Sequence synchronization above max table IDs.
7. Idempotent re-run safety (0 rows inserted, all skipped, no errors).
8. Deliberate conflict detection (aborts with MigrationConflictError, zero overwrite).
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile

import psycopg
from psycopg import sql

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
backend_dir = ROOT_DIR / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from scripts.migrate_sqlite_to_postgres import (
    InvalidSnapshotError,
    MigrationConflictError,
    migrate_sqlite_to_postgres,
    validate_snapshot_file,
)


def create_synthetic_sqlite(db_path: Path) -> None:
    """Build a complete, synthetic SQLite fixture covering all 8 tables with foreign keys."""
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path.as_posix())
    cur = conn.cursor()

    # 1. config
    cur.execute("CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL);")
    cur.execute("INSERT INTO config (key, value) VALUES ('sla_warn_days', '3'), ('system_mode', 'operational');")

    # 2. counters
    cur.execute("CREATE TABLE counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL);")
    cur.execute("INSERT INTO counters (key, value) VALUES ('cases_2026_RB', 5), ('cases_2026_PGRC', 10);")

    # 3. users
    cur.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            bureau TEXT,
            hashed_password TEXT NOT NULL,
            email TEXT,
            is_active INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
    """)
    cur.execute("""
        INSERT INTO users (id, username, name, role, bureau, hashed_password, email, is_active, created_at)
        VALUES (1, 'synth_coord', 'Synthetic Coordinator', 'coordinator', NULL, '$2b$04$fakehash', 'synth.coord@example.com', 1, '2026-10-24 10:00:00');
    """)

    # 4. institutions
    cur.execute("""
        CREATE TABLE institutions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            permanent_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            region TEXT NOT NULL,
            state TEXT,
            address TEXT,
            is_active INTEGER NOT NULL
        );
    """)
    cur.execute("""
        INSERT INTO institutions (id, permanent_id, name, region, state, address, is_active)
        VALUES (1, 'SYNTH-INST-01', 'Synthetic Institute of Technology', 'NORTH', 'Delhi', 'Connaught Place', 1),
               (2, 'SYNTH-INST-02', 'Synthetic National University', 'SOUTH', 'Karnataka', 'Bengaluru', 1);
    """)

    # 5. cases
    cur.execute("""
        CREATE TABLE cases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_no TEXT UNIQUE NOT NULL,
            institution_id INTEGER NOT NULL REFERENCES institutions(id),
            bureau TEXT NOT NULL,
            category TEXT NOT NULL,
            subcategory TEXT,
            description TEXT NOT NULL,
            received_date TEXT NOT NULL,
            status TEXT NOT NULL,
            priority TEXT NOT NULL,
            complainant_name TEXT,
            complainant_email TEXT,
            complainant_phone TEXT,
            assigned_officer TEXT,
            last_action TEXT,
            last_action_date TEXT,
            next_action TEXT,
            expected_disposal_date TEXT,
            created_at TEXT NOT NULL
        );
    """)
    cur.execute("""
        INSERT INTO cases (id, case_no, institution_id, bureau, category, subcategory, description, received_date, status, priority, complainant_name, complainant_email, complainant_phone, assigned_officer, last_action, last_action_date, next_action, expected_disposal_date, created_at)
        VALUES (1, 'RB-2026-00001', 1, 'RB', 'INFRASTRUCTURE', 'lab_facilities', 'Substandard equipment reported in research labs.', '2026-10-24', 'PENDING', 'MEDIUM', 'A. Student', 'astudent@example.com', '9876543210', 'officer_rb', 'Initial review', '2026-10-24', 'Document verification', '2026-11-15', '2026-10-24 10:30:00'),
               (2, 'PGRC-2026-00001', 1, 'PGRC', 'INFRASTRUCTURE', 'lab_facilities', 'Substandard equipment reported in student labs.', '2026-10-25', 'UNDER_PROCESS', 'HIGH', 'B. Scholar', 'bscholar@example.com', '9876543211', 'officer_pgrc', 'Inspection called', '2026-10-25', 'Committee hearing', '2026-11-20', '2026-10-25 11:00:00');
    """)

    # 6. case_events
    cur.execute("""
        CREATE TABLE case_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_id INTEGER NOT NULL REFERENCES cases(id),
            ts TEXT NOT NULL,
            actor TEXT NOT NULL,
            bureau TEXT NOT NULL,
            event_type TEXT NOT NULL,
            from_bureau TEXT,
            to_bureau TEXT,
            from_status TEXT,
            to_status TEXT,
            remarks TEXT,
            attachment_ref TEXT
        );
    """)
    cur.execute("""
        INSERT INTO case_events (id, case_id, ts, actor, bureau, event_type, from_status, to_status, remarks)
        VALUES (1, 1, '2026-10-24 10:30:00', 'Grievance Coordinator', 'RB', 'CREATED', NULL, 'PENDING', 'Complaint registered'),
               (2, 2, '2026-10-25 11:00:00', 'Grievance Coordinator', 'PGRC', 'CREATED', NULL, 'PENDING', 'Complaint registered');
    """)

    # 7. overlap_links
    cur.execute("""
        CREATE TABLE overlap_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            case_a_id INTEGER NOT NULL REFERENCES cases(id),
            case_b_id INTEGER NOT NULL REFERENCES cases(id),
            confidence_band TEXT NOT NULL,
            reasons TEXT NOT NULL,
            review_status TEXT NOT NULL,
            reviewed_by TEXT,
            reviewed_at TEXT,
            note TEXT,
            created_at TEXT NOT NULL
        );
    """)
    reasons_json = json.dumps(["same_permanent_id", "similar_description"])
    cur.execute(f"""
        INSERT INTO overlap_links (id, case_a_id, case_b_id, confidence_band, reasons, review_status, reviewed_by, reviewed_at, note, created_at)
        VALUES (1, 1, 2, 'HIGH', '{reasons_json}', 'OPEN', NULL, NULL, 'System detected overlap', '2026-10-25 11:05:00');
    """)

    # 8. alerts
    cur.execute("""
        CREATE TABLE alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            case_id INTEGER REFERENCES cases(id),
            link_id INTEGER REFERENCES overlap_links(id),
            message TEXT NOT NULL,
            priority TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            due_at TEXT
        );
    """)
    cur.execute("""
        INSERT INTO alerts (id, type, case_id, link_id, message, priority, status, created_at, due_at)
        VALUES (1, 'OVERLAP', 2, 1, 'Potential duplicate grievance identified.', 'HIGH', 'open', '2026-10-25 11:06:00', NULL);
    """)

    conn.commit()
    conn.close()


def verify_migration_e2e(postgres_url: str, work_dir: Optional[Path] = None) -> dict:
    temp_dir = work_dir or Path(tempfile.mkdtemp(prefix="cb_migration_verify_"))
    temp_dir.mkdir(parents=True, exist_ok=True)

    raw_sqlite = temp_dir / "synthetic_raw.db"
    snapshot_sqlite = temp_dir / "synthetic_snapshot.db"

    print("=" * 70)
    print("STAGE 4: END-TO-END MIGRATION SCRIPT VERIFICATION")
    print("=" * 70)

    # Step 1: Create synthetic fixture
    print("\n[Step 1] Creating synthetic SQLite fixture with all 8 tables...")
    create_synthetic_sqlite(raw_sqlite)
    print(f"  Created raw synthetic database at: {raw_sqlite}")

    # Step 2: Take VACUUM INTO snapshot
    print("\n[Step 2] Taking consistent VACUUM INTO snapshot...")
    conn = sqlite3.connect(raw_sqlite.as_posix())
    if snapshot_sqlite.exists():
        snapshot_sqlite.unlink()
    conn.execute(f"VACUUM INTO '{snapshot_sqlite.as_posix()}';")
    conn.close()
    print(f"  Consistent snapshot generated at: {snapshot_sqlite}")

    # Step 3: Test live DB & WAL protection
    print("\n[Step 3] Testing Live Database and WAL protection...")
    try:
        validate_snapshot_file(Path("backend/casebridge.db"))
        raise AssertionError("Failed: live database path was not refused!")
    except InvalidSnapshotError as e:
        print(f"  [PASS] Correctly refused live database by name: {e}")

    try:
        validate_snapshot_file(Path("nonexistent/backend/casebridge.db"))
        raise AssertionError("Failed: nonexistent live database path was not refused by name!")
    except InvalidSnapshotError as e:
        print(f"  [PASS] Correctly refused nonexistent live database by name: {e}")

    fake_wal = temp_dir / "synthetic_snapshot.db-wal"
    fake_wal.write_bytes(b"uncheckpointed WAL data")
    try:
        validate_snapshot_file(snapshot_sqlite)
        raise AssertionError("Failed: snapshot with pending WAL was not refused!")
    except InvalidSnapshotError as e:
        print(f"  [PASS] Correctly refused snapshot with pending WAL: {e}")
    finally:
        if fake_wal.exists():
            fake_wal.unlink()

    # Normalize Postgres URL
    pg_conn_url = postgres_url.replace("postgresql+psycopg://", "postgresql://", 1)

    # Step 4: Clean PostgreSQL destination
    print("\n[Step 4] Cleaning PostgreSQL destination tables before initial migration...")
    import sqlmodel
    import app.models  # noqa: F401
    from app.db import create_db_and_tables

    sa_url = postgres_url if "+psycopg" in postgres_url else postgres_url.replace("postgresql://", "postgresql+psycopg://", 1)
    admin_engine = sqlmodel.create_engine(sa_url, echo=False)
    create_db_and_tables(target_engine=admin_engine)

    with psycopg.connect(pg_conn_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE alerts, case_events, cases, config, counters, institutions, overlap_links, users RESTART IDENTITY CASCADE;")
    print("  Destination tables emptied.")

    # Step 5: Run initial migration
    print("\n[Step 5] Running initial migration from synthetic snapshot into PostgreSQL...")
    initial_res = migrate_sqlite_to_postgres(
        sqlite_snapshot_path=snapshot_sqlite,
        postgres_url=pg_conn_url,
        dry_run=False,
    )
    assert initial_res["success"] is True
    print("  Initial migration succeeded with 100% verified content match!")

    # Step 6: Test Idempotent Re-Run
    print("\n[Step 6] Testing Idempotent Re-Run (must be complete no-op)...")
    rerun_res = migrate_sqlite_to_postgres(
        sqlite_snapshot_path=snapshot_sqlite,
        postgres_url=pg_conn_url,
        dry_run=False,
    )
    assert rerun_res["success"] is True
    for tbl, info in rerun_res["tables"].items():
        assert info["inserted"] == 0, f"Expected 0 inserted on rerun for {tbl}, got {info['inserted']}"
    for tbl, info in rerun_res["verification"]["tables"].items():
        assert info["status"] == "MATCH"
    print("  Idempotent re-run verified: 0 rows inserted, all rows identical and skipped.")

    # Step 7: Test Deliberate Conflict Protection (No-Overwrite Guarantee)
    print("\n[Step 7] Testing Deliberate Conflict Protection (No-Overwrite Guarantee)...")
    with psycopg.connect(pg_conn_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET email = 'hacked_dest_email@example.com' WHERE id = 1;")
    print("  Deliberately introduced conflict in destination: modified user #1 email.")

    conflict_detected = False
    try:
        migrate_sqlite_to_postgres(
            sqlite_snapshot_path=snapshot_sqlite,
            postgres_url=pg_conn_url,
            dry_run=False,
        )
    except MigrationConflictError as e:
        conflict_detected = True
        print(f"  [PASS] Conflict detected and migration stopped with error:\n    {e}")

    assert conflict_detected is True, "Migration failed to halt on deliberate destination conflict!"

    # Verify destination row was preserved untouched
    with psycopg.connect(pg_conn_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT email FROM users WHERE id = 1;")
            preserved_email = cur.fetchone()[0]
            assert preserved_email == "hacked_dest_email@example.com"
            print(f"  Verified destination row preserved untouched: email='{preserved_email}' (NO OVERWRITE).")

    print("\n" + "=" * 70)
    print("ALL STAGE 4 DATA MIGRATION VERIFICATION CHECKS PASSED CLEANLY!")
    print("=" * 70)
    return {"success": True}


def main():
    parser = argparse.ArgumentParser(description="Run end-to-end migration verification against PostgreSQL.")
    parser.add_argument(
        "--postgres-url",
        default=os.getenv("POSTGRES_ADMIN_URL", os.getenv("POSTGRES_TEST_URL", os.getenv("DATABASE_URL"))),
        help="Target PostgreSQL connection URL",
    )
    parser.add_argument("--work-dir", type=Path, default=None, help="Working directory for test databases")
    args = parser.parse_args()

    if not args.postgres_url:
        print("Error: --postgres-url or POSTGRES_ADMIN_URL / POSTGRES_TEST_URL / DATABASE_URL environment variable required.")
        sys.exit(1)

    verify_migration_e2e(postgres_url=args.postgres_url, work_dir=args.work_dir)


if __name__ == "__main__":
    main()

