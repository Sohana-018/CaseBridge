#!/usr/bin/env python3
"""CaseBridge: Safe SQLite Snapshot to Postgres Migration Tool.

Migrates all tables from a SQLite consistent snapshot (VACUUM INTO / .backup)
into PostgreSQL in foreign-key-safe topological order.

Guarantees:
1. Snapshot Source Only: Refuses to run against live/in-use database files or uncheckpointed WAL files.
2. Idempotent & Conflict-Safe: Identical re-runs are no-ops; conflicting destination rows fail loudly (NEVER overwrites).
3. Full Table Coverage: Migrates all 8 tables: institutions, cases, case_events, overlap_links, alerts, users, config, counters.
4. Sequence Synchronization: Advances all Postgres sequences above max existing IDs.
5. Content Verification: Computes per-table row counts, content hashes, and foreign key integrity checks.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from psycopg import sql
from psycopg.types.json import Json

# Ordered list of tables in topological dependency order (parents before children)
TOPOLOGICAL_TABLES = [
    "config",
    "counters",
    "users",
    "institutions",
    "cases",
    "case_events",
    "overlap_links",
    "alerts",
]

TABLE_PKS = {
    "config": ["key"],
    "counters": ["key"],
    "users": ["id"],
    "institutions": ["id"],
    "cases": ["id"],
    "case_events": ["id"],
    "overlap_links": ["id"],
    "alerts": ["id"],
}


class MigrationConflictError(Exception):
    """Raised when destination contains conflicting data for the same primary key."""
    pass


class InvalidSnapshotError(Exception):
    """Raised when source database file is invalid, in-use, or uncheckpointed."""
    pass


def normalize_value(val: Any, col_type: str = "") -> Any:
    """Normalize SQLite/Postgres datatypes for deterministic equality comparison."""
    if val is None:
        return None
    if col_type == "boolean":
        return bool(val in (1, "1", "true", "True", True))
    if col_type == "user-defined" and isinstance(val, str):
        return val.strip().upper()
    if isinstance(val, bool):
        return val
    if isinstance(val, (datetime, date)):
        if isinstance(val, datetime):
            return val.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")
        return val.isoformat()
    if isinstance(val, (dict, list)):
        return json.dumps(val, sort_keys=True)
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return round(val, 6)
    if isinstance(val, str):
        trimmed = val.strip()
        # Parse JSON
        if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
            try:
                parsed = json.loads(trimmed)
                return json.dumps(parsed, sort_keys=True)
            except Exception:
                pass
        # Parse date / datetime
        if len(trimmed) >= 10 and trimmed[4] == "-" and trimmed[7] == "-":
            try:
                cleaned = trimmed.replace("T", " ").split("+")[0].split("Z")[0].strip()
                if "." in cleaned:
                    cleaned = cleaned.split(".")[0]
                if len(cleaned) == 10:
                    return date.fromisoformat(cleaned).isoformat()
                return datetime.fromisoformat(cleaned).strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                pass
        return trimmed
    return str(val)


def validate_snapshot_file(path: Path, allow_live: bool = False) -> None:
    """Ensure path exists, is a valid SQLite database, and is not a live database."""
    # Check for live database indicators BY NAME / PATH before existence check
    if not allow_live:
        path_name_lower = path.name.lower()
        normalized_path = str(path).replace("\\", "/").lower()
        if (
            path_name_lower == "casebridge.db"
            or normalized_path.endswith("backend/casebridge.db")
            or normalized_path.endswith("/casebridge.db")
        ):
            raise InvalidSnapshotError(
                f"Refusing to run against primary development/live database: {path}\n"
                "You must provide a consistent snapshot file created via 'VACUUM INTO' or 'sqlite3 .backup'."
            )

    if not path.exists():
        raise InvalidSnapshotError(f"Snapshot file not found: {path}")
    wal_file = path.parent / f"{path.name}-wal"
    shm_file = path.parent / f"{path.name}-shm"
    if wal_file.exists() and wal_file.stat().st_size > 0:
        raise InvalidSnapshotError(
            f"Uncheckpointed WAL file detected: {wal_file}\n"
            "The snapshot must be consistent and fully checkpointed with no pending WAL content."
        )

    # Validate SQLite integrity
    try:
        conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("PRAGMA integrity_check;")
        res = cur.fetchall()
        conn.close()
        if not res or res[0][0] != "ok":
            raise InvalidSnapshotError(f"PRAGMA integrity_check failed on {path}: {res}")
    except Exception as e:
        raise InvalidSnapshotError(f"Failed opening SQLite database {path}: {e}")


def get_sqlite_tables_and_columns(sqlite_conn: sqlite3.Connection) -> Dict[str, List[str]]:
    """Retrieve column names for each table in SQLite database."""
    cur = sqlite_conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tables = [r[0] for r in cur.fetchall()]

    col_map = {}
    for t in tables:
        cur.execute(f"PRAGMA table_info({t});")
        col_map[t] = [r[1] for r in cur.fetchall()]
    return col_map


def get_postgres_columns_and_types(pg_conn: psycopg.Connection, table: str) -> Dict[str, str]:
    """Retrieve column names and data types for a table in PostgreSQL."""
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position;
            """,
            (table,),
        )
        return {r[0]: r[1].lower() for r in cur.fetchall()}


def get_postgres_columns(pg_conn: psycopg.Connection, table: str) -> List[str]:
    return list(get_postgres_columns_and_types(pg_conn, table).keys())


def compute_table_content_hash(rows: List[Dict[str, Any]], columns: List[str]) -> str:
    """Compute deterministic SHA-256 hash of table contents."""
    sorted_cols = sorted(columns)
    hasher = hashlib.sha256()
    
    # Sort rows by primary key or tuple of values
    def row_sort_key(r: Dict[str, Any]) -> str:
        return str(tuple(normalize_value(r.get(c)) for c in sorted_cols))

    sorted_rows = sorted(rows, key=row_sort_key)
    for r in sorted_rows:
        row_str = "|".join(f"{c}:{normalize_value(r.get(c))}" for c in sorted_cols)
        hasher.update(row_str.encode("utf-8"))
        hasher.update(b"\n")
    return hasher.hexdigest()


def migrate_sqlite_to_postgres(
    sqlite_snapshot_path: Path,
    postgres_url: str,
    dry_run: bool = False,
    allow_live: bool = False,
) -> Dict[str, Any]:
    """Execute complete migration and verification."""
    print(f"[*] Validating source SQLite snapshot: {sqlite_snapshot_path}")
    validate_snapshot_file(sqlite_snapshot_path, allow_live=allow_live)
    print("    Snapshot validation passed (clean, checkpointed, integrity OK).")

    # Normalize Postgres URL
    if postgres_url.startswith("postgres://"):
        postgres_url = postgres_url.replace("postgres://", "postgresql://", 1)
    elif "+psycopg" in postgres_url:
        postgres_url = postgres_url.replace("+psycopg", "")

    sqlite_conn = sqlite3.connect(f"file:{sqlite_snapshot_path.as_posix()}?mode=ro", uri=True)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cols_map = get_sqlite_tables_and_columns(sqlite_conn)

    report = {
        "tables": {},
        "sequences_updated": [],
        "dry_run": dry_run,
        "fk_checks_passed": False,
    }

    with psycopg.connect(postgres_url, autocommit=False) as pg_conn:
        # 1. Process each table in topological order
        for table in TOPOLOGICAL_TABLES:
            if table not in sqlite_cols_map:
                print(f"[-] Table '{table}' not present in SQLite snapshot, skipping.")
                continue

            pg_col_types = get_postgres_columns_and_types(pg_conn, table)
            pg_cols = list(pg_col_types.keys())
            if not pg_cols:
                raise RuntimeError(f"Destination PostgreSQL table 'public.{table}' does not exist! Run migrations/create_all first.")

            # Determine common columns between source and destination
            src_cols = sqlite_cols_map[table]
            common_cols = [c for c in src_cols if c in pg_cols]
            pk_cols = TABLE_PKS.get(table, ["id"])

            # Read source rows
            cur_sq = sqlite_conn.cursor()
            cur_sq.execute(f"SELECT {', '.join(common_cols)} FROM {table};")
            src_rows = [dict(r) for r in cur_sq.fetchall()]

            # Read existing destination rows
            with pg_conn.cursor() as cur_pg:
                cur_pg.execute(sql.SQL("SELECT {} FROM {}").format(
                    sql.SQL(", ").join([sql.Identifier(c) for c in common_cols]),
                    sql.Identifier(table),
                ))
                dest_rows = [dict(zip(common_cols, row)) for row in cur_pg.fetchall()]

            dest_map = {}
            for r in dest_rows:
                pk_val = tuple(normalize_value(r[k], pg_col_types.get(k, '')) for k in pk_cols)
                dest_map[pk_val] = r

            rows_to_insert = []
            rows_identical = 0
            rows_conflicting = 0

            for s_row in src_rows:
                pk_val = tuple(normalize_value(s_row[k], pg_col_types.get(k, '')) for k in pk_cols)
                if pk_val in dest_map:
                    d_row = dest_map[pk_val]
                    # Check if all common column values match
                    is_identical = True
                    diff_cols = []
                    for c in common_cols:
                        col_t = pg_col_types.get(c, "")
                        sv = normalize_value(s_row.get(c), col_t)
                        dv = normalize_value(d_row.get(c), col_t)
                        if sv != dv:
                            is_identical = False
                            diff_cols.append((c, sv, dv))

                    if is_identical:
                        rows_identical += 1
                    else:
                        rows_conflicting += 1
                        diff_summary = "; ".join(f"{c}: src='{sv}' != dest='{dv}'" for c, sv, dv in diff_cols)
                        raise MigrationConflictError(
                            f"Conflict detected in table '{table}' for PK {pk_val}!\n"
                            f"Destination has different content than source: {diff_summary}\n"
                            "Migration aborted to prevent silent data overwrite."
                        )
                else:
                    rows_to_insert.append(s_row)

            # Insert missing rows into PostgreSQL
            if rows_to_insert and not dry_run:
                with pg_conn.cursor() as cur_pg:
                    insert_query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                        sql.Identifier(table),
                        sql.SQL(", ").join([sql.Identifier(c) for c in common_cols]),
                        sql.SQL(", ").join([sql.Placeholder(c) for c in common_cols]),
                    )
                    # Prepare rows with proper type conversions for PostgreSQL (boolean, JSON)
                    formatted_rows = []
                    for r in rows_to_insert:
                        row_copy = dict(r)
                        for col in common_cols:
                            val = row_copy.get(col)
                            c_type = pg_col_types.get(col, "")
                            if c_type == "boolean" and not isinstance(val, bool) and val is not None:
                                row_copy[col] = bool(val in (1, "1", "true", "True", True))
                            elif c_type == "user-defined" and isinstance(val, str):
                                row_copy[col] = val.strip().upper()
                            elif (c_type in ("json", "jsonb") or col == "reasons"):
                                if isinstance(val, str):
                                    try:
                                        row_copy[col] = Json(json.loads(val))
                                    except Exception:
                                        row_copy[col] = Json(val)
                                elif val is not None:
                                    row_copy[col] = Json(val)
                        formatted_rows.append(row_copy)

                    cur_pg.executemany(insert_query, formatted_rows)

            report["tables"][table] = {
                "source_rows": len(src_rows),
                "dest_existing_before": len(dest_rows),
                "inserted": len(rows_to_insert),
                "identical_skipped": rows_identical,
                "total_dest_after": len(dest_rows) + (len(rows_to_insert) if not dry_run else 0),
            }

            print(
                f"    Table '{table:13}': {len(src_rows):4} source rows | "
                f"{len(rows_to_insert):4} inserted | {rows_identical:4} identical skipped"
            )

        # 2. Advance all PostgreSQL sequences above max existing IDs
        if not dry_run:
            print("[*] Synchronizing PostgreSQL sequences above max table IDs...")
            with pg_conn.cursor() as cur_pg:
                for table in TOPOLOGICAL_TABLES:
                    if "id" in TABLE_PKS.get(table, []):
                        cur_pg.execute(
                            sql.SQL(
                                """
                                SELECT setval(
                                    pg_get_serial_sequence(%s, 'id'),
                                    coalesce((SELECT max(id) FROM {}), 1)
                                );
                                """
                            ).format(sql.Identifier(table)),
                            (table,),
                        )
                        new_seq = cur_pg.fetchone()[0]
                        report["sequences_updated"].append((table, new_seq))
                        print(f"    Sequence for '{table:13}': set to {new_seq}")

            pg_conn.commit()
            print("[*] Transaction committed successfully.")
        else:
            pg_conn.rollback()
            print("[*] DRY RUN: Changes rolled back.")

    sqlite_conn.close()

    # 3. Post-Migration Verification
    print("\n" + "=" * 80)
    print("VERIFICATION: CONTENT COMPARISON AND FOREIGN KEY INTEGRITY CHECKS")
    print("=" * 80)

    verify_report = verify_migration_content(sqlite_snapshot_path, postgres_url)
    report["verification"] = verify_report
    report["success"] = bool(verify_report.get("success", True))
    return report


def verify_migration_content(sqlite_snapshot_path: Path, postgres_url: str) -> Dict[str, Any]:
    """Perform content hash and foreign-key orphan verification."""
    sqlite_conn = sqlite3.connect(f"file:{sqlite_snapshot_path.as_posix()}?mode=ro", uri=True)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cols_map = get_sqlite_tables_and_columns(sqlite_conn)

    results = {}
    all_matched = True

    with psycopg.connect(postgres_url, autocommit=True) as pg_conn:
        for table in TOPOLOGICAL_TABLES:
            if table not in sqlite_cols_map:
                continue

            pg_cols = get_postgres_columns(pg_conn, table)
            common_cols = [c for c in sqlite_cols_map[table] if c in pg_cols]

            # Read source rows
            cur_sq = sqlite_conn.cursor()
            cur_sq.execute(f"SELECT {', '.join(common_cols)} FROM {table};")
            src_rows = [dict(r) for r in cur_sq.fetchall()]

            # Read destination rows
            with pg_conn.cursor() as cur_pg:
                cur_pg.execute(sql.SQL("SELECT {} FROM {}").format(
                    sql.SQL(", ").join([sql.Identifier(c) for c in common_cols]),
                    sql.Identifier(table),
                ))
                dest_rows = [dict(zip(common_cols, r)) for r in cur_pg.fetchall()]

            pg_col_types = get_postgres_columns_and_types(pg_conn, table)
            def compute_typed_hash(rows):
                sorted_cols = sorted(common_cols)
                hasher = hashlib.sha256()
                def sort_fn(r):
                    return str(tuple(normalize_value(r.get(c), pg_col_types.get(c, '')) for c in sorted_cols))
                for r in sorted(rows, key=sort_fn):
                    row_str = "|".join(f"{c}:{normalize_value(r.get(c), pg_col_types.get(c, ''))}" for c in sorted_cols)
                    hasher.update(row_str.encode("utf-8"))
                    hasher.update(b"\n")
                return hasher.hexdigest()

            src_hash = compute_typed_hash(src_rows)
            dest_hash = compute_typed_hash(dest_rows)

            counts_match = len(src_rows) == len(dest_rows)
            hashes_match = src_hash == dest_hash

            status = "MATCH" if (counts_match and hashes_match) else "MISMATCH"
            if status == "MISMATCH":
                all_matched = False

            results[table] = {
                "source_count": len(src_rows),
                "dest_count": len(dest_rows),
                "source_hash": src_hash[:16],
                "dest_hash": dest_hash[:16],
                "status": status,
            }

            print(
                f"  Table '{table:13}': Src={len(src_rows):4} | Dest={len(dest_rows):4} | "
                f"Hash: {src_hash[:8]} vs {dest_hash[:8]} -> [{status}]"
            )

        # 4. Foreign Key Orphan Checks on PostgreSQL
        print("\n[*] Checking Foreign Key Integrity (zero orphans)...")
        fk_checks = [
            ("cases.institution_id", "SELECT count(*) FROM cases c LEFT JOIN institutions i ON c.institution_id = i.id WHERE i.id IS NULL;"),
            ("case_events.case_id", "SELECT count(*) FROM case_events e LEFT JOIN cases c ON e.case_id = c.id WHERE c.id IS NULL;"),
            ("overlap_links.case_a_id", "SELECT count(*) FROM overlap_links l LEFT JOIN cases c ON l.case_a_id = c.id WHERE c.id IS NULL;"),
            ("overlap_links.case_b_id", "SELECT count(*) FROM overlap_links l LEFT JOIN cases c ON l.case_b_id = c.id WHERE c.id IS NULL;"),
            ("alerts.case_id", "SELECT count(*) FROM alerts a LEFT JOIN cases c ON a.case_id = c.id WHERE a.case_id IS NOT NULL AND c.id IS NULL;"),
            ("alerts.link_id", "SELECT count(*) FROM alerts a LEFT JOIN overlap_links l ON a.link_id = l.id WHERE a.link_id IS NOT NULL AND l.id IS NULL;"),
        ]

        orphans_found = 0
        with pg_conn.cursor() as cur_pg:
            for check_name, check_sql in fk_checks:
                cur_pg.execute(check_sql)
                orphan_count = cur_pg.fetchone()[0]
                if orphan_count > 0:
                    orphans_found += orphan_count
                    print(f"  [FAIL] {check_name}: {orphan_count} orphan row(s) found!")
                else:
                    print(f"  [PASS] {check_name}: 0 orphan rows.")

    sqlite_conn.close()

    if orphans_found > 0:
        raise RuntimeError(f"Foreign key integrity check failed: {orphans_found} orphan records detected in destination!")
    if not all_matched:
        raise RuntimeError("Verification failed: Content hashes or row counts mismatched between source and destination!")

    print("\n[+] Verification Complete: 100% row counts matched, 100% content hashes verified, 0 FK orphans.")
    return {"tables": results, "orphans": orphans_found, "success": True}


def main():
    parser = argparse.ArgumentParser(description="Migrate SQLite snapshot to PostgreSQL with full content verification.")
    parser.add_argument("--sqlite-snapshot", required=True, type=Path, help="Path to consistent SQLite snapshot file")
    parser.add_argument("--postgres-url", default=os.getenv("DATABASE_URL"), help="Target PostgreSQL connection URL (or DATABASE_URL env)")
    parser.add_argument("--dry-run", action="store_true", help="Simulate migration without committing changes")
    parser.add_argument("--allow-live-db", action="store_true", help="Force allow path even if named casebridge.db (testing only)")

    args = parser.parse_args()

    if not args.postgres_url:
        print("ERROR: Target PostgreSQL connection URL must be specified via --postgres-url or DATABASE_URL env var.", file=sys.stderr)
        sys.exit(1)

    try:
        migrate_sqlite_to_postgres(
            sqlite_snapshot_path=args.sqlite_snapshot,
            postgres_url=args.postgres_url,
            dry_run=args.dry_run,
            allow_live=args.allow_live_db,
        )
    except Exception as e:
        print(f"\nMIGRATION FAILED: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
