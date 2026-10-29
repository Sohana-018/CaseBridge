#!/usr/bin/env python3
"""CaseBridge: Security Hardening Verification Script.

Verifies:
1. Tables created by the ADMIN/OWNER role ('postgres').
2. Application of scripts/security_hardening.sql.
3. Strict UNAUTHORIZED access denial for 'anon' and 'authenticated' roles
   across all 8 tables (SELECT, INSERT, UPDATE, DELETE) and sequences.
4. AUTHORIZED operational CRUD and sequence access for 'casebridge_app'.
5. Denial of DDL privileges (CREATE/DROP) for 'casebridge_app'.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
import psycopg
from psycopg import errors

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
backend_dir = ROOT_DIR / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

TABLES = [
    "alerts",
    "case_events",
    "cases",
    "config",
    "counters",
    "institutions",
    "overlap_links",
    "users",
]


def assert_denied(role_name: str, conn_url: str, operation: str, table: str, sql_stmt: str) -> None:
    with psycopg.connect(conn_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(sql_stmt)
                conn.commit()
                raise AssertionError(f"SECURITY BREACH: Role '{role_name}' was able to perform {operation} on '{table}'!")
            except errors.InsufficientPrivilege:
                conn.rollback()
                print(f"  [DENIED] {role_name:13} {operation:6} on '{table:13}' -> InsufficientPrivilege (PASS)")


def verify_security(
    admin_url: str,
    app_role: str = "casebridge_app",
    test_anon_pass: str = "test_anon_pass",
    test_auth_pass: str = "test_auth_pass",
    test_app_pass: str = "test_app_pass_123",
) -> dict:
    sql_file = ROOT_DIR / "scripts" / "security_hardening.sql"
    if not sql_file.exists():
        raise FileNotFoundError(f"Missing {sql_file}")

    print("=" * 70)
    print("STAGE 3: DATABASE ACCESS SECURITY VERIFICATION")
    print("=" * 70)

    # 1. Connect as ADMIN/OWNER to create tables
    print("\n[1] Creating tables as ADMIN role (simulating production one-time DDL)...")
    import sqlmodel
    import app.models  # noqa: F401
    from app.db import create_db_and_tables

    sa_url = admin_url
    if sa_url.startswith("postgresql://") and "+psycopg" not in sa_url:
        sa_url = sa_url.replace("postgresql://", "postgresql+psycopg://", 1)
    admin_engine = sqlmodel.create_engine(sa_url, echo=False)
    create_db_and_tables(target_engine=admin_engine)

    with psycopg.connect(admin_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_user, session_user;")
            creator_user, session_user = cur.fetchone()
            print(f"    Tables verified created by role: '{creator_user}' (session: '{session_user}')")

            # 2. Apply security hardening
            print("\n[2] Applying scripts/security_hardening.sql as ADMIN role...")
            sql_content = sql_file.read_text(encoding="utf-8")
            cur.execute(sql_content)

            # Set testing passwords for isolated direct-connection testing
            cur.execute(f"ALTER ROLE anon WITH LOGIN PASSWORD '{test_anon_pass}';")
            cur.execute(f"ALTER ROLE authenticated WITH LOGIN PASSWORD '{test_auth_pass}';")
            cur.execute(f"ALTER ROLE {app_role} WITH PASSWORD '{test_app_pass}';")
            print("    Security hardening applied and test role passwords configured.")

    # Parse base host, port, dbname from admin_url
    base_info = psycopg.conninfo.conninfo_to_dict(admin_url)
    host = base_info.get("host", "127.0.0.1")
    port = base_info.get("port", "5432")
    dbname = base_info.get("dbname", "postgres")

    anon_url = f"postgresql://anon:{test_anon_pass}@{host}:{port}/{dbname}"
    auth_url = f"postgresql://authenticated:{test_auth_pass}@{host}:{port}/{dbname}"
    app_url = f"postgresql://{app_role}:{test_app_pass}@{host}:{port}/{dbname}"

    total_denials = 0

    # 3. Test Access Denial for 'anon' Role
    print("\n[3] Testing UNAUTHORIZED access denial for 'anon' role against all tables...")
    for table in TABLES:
        assert_denied("anon", anon_url, "SELECT", table, f"SELECT * FROM {table} LIMIT 1;")
        assert_denied("anon", anon_url, "INSERT", table, f"INSERT INTO {table} DEFAULT VALUES;")
        if "config" not in table and "counters" not in table:
            assert_denied("anon", anon_url, "UPDATE", table, f"UPDATE {table} SET id=id WHERE false;")
        else:
            assert_denied("anon", anon_url, "UPDATE", table, f"UPDATE {table} SET key=key WHERE false;")
        assert_denied("anon", anon_url, "DELETE", table, f"DELETE FROM {table} WHERE false;")
        total_denials += 4

    # Sequence denial
    with psycopg.connect(anon_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("SELECT nextval('institutions_id_seq');")
                conn.commit()
                raise AssertionError("SECURITY BREACH: anon was able to advance sequence!")
            except errors.InsufficientPrivilege:
                conn.rollback()
                print("  [DENIED] anon          nextval on 'institutions_id_seq' -> InsufficientPrivilege (PASS)")
                total_denials += 1

    # 4. Test Access Denial for 'authenticated' Role
    print("\n[4] Testing UNAUTHORIZED access denial for 'authenticated' role against all tables...")
    for table in TABLES:
        assert_denied("authenticated", auth_url, "SELECT", table, f"SELECT * FROM {table} LIMIT 1;")
        assert_denied("authenticated", auth_url, "INSERT", table, f"INSERT INTO {table} DEFAULT VALUES;")
        if "config" not in table and "counters" not in table:
            assert_denied("authenticated", auth_url, "UPDATE", table, f"UPDATE {table} SET id=id WHERE false;")
        else:
            assert_denied("authenticated", auth_url, "UPDATE", table, f"UPDATE {table} SET key=key WHERE false;")
        assert_denied("authenticated", auth_url, "DELETE", table, f"DELETE FROM {table} WHERE false;")
        total_denials += 4

    # Sequence denial
    with psycopg.connect(auth_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("SELECT nextval('institutions_id_seq');")
                conn.commit()
                raise AssertionError("SECURITY BREACH: authenticated was able to advance sequence!")
            except errors.InsufficientPrivilege:
                conn.rollback()
                print("  [DENIED] authenticated nextval on 'institutions_id_seq' -> InsufficientPrivilege (PASS)")
                total_denials += 1

    # 5. Test Authorized Operational Access for 'casebridge_app'
    print(f"\n[5] Testing AUTHORIZED operational access for least-privileged '{app_role}' role...")
    with psycopg.connect(app_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_user, session_user;")
            c_user, s_user = cur.fetchone()
            print(f"    Connected as role: current_user='{c_user}', session_user='{s_user}'")
            assert c_user == app_role, f"Expected user {app_role}, got {c_user}"

            for table in TABLES:
                cur.execute(f"SELECT count(*) FROM {table};")
                cnt = cur.fetchone()[0]
                print(f"  [ALLOWED] {app_role} SELECT on '{table:13}' -> {cnt} rows")

            # Test CRUD on config under RLS
            cur.execute("INSERT INTO config (key, value) VALUES ('test_sec_key', 'test_sec_val');")
            cur.execute("SELECT value FROM config WHERE key='test_sec_key';")
            val = cur.fetchone()[0]
            assert val == "test_sec_val"
            cur.execute("UPDATE config SET value='updated_val' WHERE key='test_sec_key';")
            cur.execute("DELETE FROM config WHERE key='test_sec_key';")
            print(f"  [ALLOWED] {app_role} full CRUD operations verified under RLS policy.")

            # Test sequence usage
            cur.execute("SELECT nextval('institutions_id_seq');")
            nxt = cur.fetchone()[0]
            print(f"  [ALLOWED] {app_role} sequence usage verified (nextval={nxt}).")
            conn.commit()

    # 6. Test DDL Denial for 'casebridge_app'
    print(f"\n[6] Testing DDL denial for '{app_role}' role (must NOT have CREATE/DROP)...")
    with psycopg.connect(app_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("CREATE TABLE ddl_test_table (id int);")
                conn.commit()
                raise AssertionError(f"SECURITY BREACH: '{app_role}' was able to execute CREATE TABLE!")
            except errors.InsufficientPrivilege:
                conn.rollback()
                print(f"  [DENIED] {app_role} CREATE TABLE -> InsufficientPrivilege (PASS)")
                total_denials += 1

            try:
                cur.execute("DROP TABLE users;")
                conn.commit()
                raise AssertionError(f"SECURITY BREACH: '{app_role}' was able to execute DROP TABLE!")
            except errors.InsufficientPrivilege:
                conn.rollback()
                print(f"  [DENIED] {app_role} DROP TABLE   -> InsufficientPrivilege (PASS)")
                total_denials += 1

    print("\n" + "=" * 70)
    print(f"ALL {total_denials} SECURITY DENIAL AND LEAST-PRIVILEGE TESTS PASSED!")
    print(f"Creator role: {creator_user} | App runtime role: {app_role}")
    print("=" * 70)
    return {
        "success": True,
        "creator_role": creator_user,
        "app_role": app_role,
        "total_denials": total_denials,
    }


def main():
    parser = argparse.ArgumentParser(description="Verify database access security model against PostgreSQL.")
    parser.add_argument(
        "--admin-url",
        default=os.getenv("POSTGRES_ADMIN_URL", os.getenv("POSTGRES_TEST_URL", os.getenv("DATABASE_URL"))),
        help="PostgreSQL admin connection URL",
    )
    parser.add_argument("--app-role", default="casebridge_app", help="Application runtime role name")
    args = parser.parse_args()

    if not args.admin_url:
        print("Error: --admin-url or POSTGRES_ADMIN_URL / POSTGRES_TEST_URL / DATABASE_URL environment variable required.")
        sys.exit(1)

    # Normalize url scheme if necessary
    admin_url = args.admin_url
    if admin_url.startswith("postgresql+psycopg://"):
        admin_url = admin_url.replace("postgresql+psycopg://", "postgresql://", 1)

    verify_security(admin_url=admin_url, app_role=args.app_role)


if __name__ == "__main__":
    main()
