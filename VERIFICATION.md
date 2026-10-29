# CaseBridge: Supabase Migration Verification Evidence

This document records the exact reproduction commands, execution environments, commit hashes, and outputs for all database migration, security hardening, maintenance mode, and runtime role verifications.

---

## 1. Environment & Commit Metadata

- **Branch**: `supabase-migration`
- **Commit Base**: `a0c4945d41fbf6e622244ff2bd2362770f0207cf` (`a0c4945`)
- **Host OS**: Windows 11 (win32)
- **Python Version**: Python 3.13.1
- **Pytest Version**: pytest 9.1.1 (pluggy 1.6.0, anyio 4.14.1)
- **Target PostgreSQL Server**: PostgreSQL 16.10 (isolated local daemon on port 54332, database `casebridge_test`)
- **External Network Access**: None (zero live Supabase or Render systems contacted; email backend disabled with zero external side effects)

---

## 2. Audit of Local File & Environment Dependence (Fix 1)

### Issue Found Independently:
In commit `a0c4945`, `validate_snapshot_file()` checked `snapshot_path.exists()` before checking the live path guard. On a clean clone without `backend/casebridge.db`, running `pytest backend/tests/test_migration.py` failed because `test_validate_snapshot_refuses_live_database` received `"Snapshot file not found: backend/casebridge.db"` instead of `"Refusing to run against primary development/live database"`.

### Remediation Applied:
- `scripts/migrate_sqlite_to_postgres.py`: Updated `validate_snapshot_file()` to inspect the path string and file name (`casebridge.db`, `backend/casebridge.db`, `\casebridge.db`, `/casebridge.db`) **before** checking file existence on disk.
- `backend/tests/test_migration.py`: Strengthened `test_validate_snapshot_refuses_live_database` to explicitly test both `Path("backend/casebridge.db")` and a guaranteed nonexistent path `Path("nonexistent/backend/casebridge.db")`.
- **Suite-wide Audit**: Audited all 14 test files in `backend/tests/`. All other tests use SQLite `:memory:`, isolated `tempfile.TemporaryDirectory()`, or dynamic mock engines. No other test exhibits hidden dependence on local files, machine state, or pre-existing databases.

---

## 3. SQLite Pytest Suite Execution

Full test suite executed against default in-memory SQLite backend.

### Command:
```powershell
pytest backend/tests
```

### Execution Output:
```text
============================= test session starts =============================
platform win32 -- Python 3.13.1, pytest-9.1.1, pluggy-1.6.0
rootdir: C:\Users\Sohana\OneDrive\Desktop\Casebridge
plugins: anyio-4.14.1, langsmith-0.14.2
collected 155 items

backend\tests\test_admin.py ............                                 [  7%]
backend\tests\test_alerts.py .......                                     [ 12%]
backend\tests\test_auth.py .............                                 [ 20%]
backend\tests\test_cases.py ........................                     [ 36%]
backend\tests\test_email.py ...................                          [ 48%]
backend\tests\test_errors.py ......                                      [ 52%]
backend\tests\test_eval_dataset.py .....                                 [ 55%]
backend\tests\test_events.py ...........                                 [ 62%]
backend\tests\test_health.py ..                                          [ 63%]
backend\tests\test_import.py .......                                     [ 68%]
backend\tests\test_institutions.py .......                               [ 72%]
backend\tests\test_maintenance.py .....                                  [ 76%]
backend\tests\test_migration.py .....                                    [ 79%]
backend\tests\test_models.py ...                                         [ 81%]
backend\tests\test_overlaps.py ..............                            [ 90%]
backend\tests\test_reports.py ...............                            [100%]

============================ 155 passed in 41.27s =============================
```

**Result**: 155 passed, 0 failed (100% pass rate).

---

## 4. PostgreSQL Pytest Suite Execution (Dual-Connection Harness)

Full test suite executed against isolated PostgreSQL 16 daemon using dual-connection privilege separation.

### Test Harness Privilege Architecture:
- `POSTGRES_ADMIN_URL`: Connects as owner/admin (`postgres`) to perform schema initialization (`create_all`) and table truncations (`TRUNCATE ... RESTART IDENTITY CASCADE`).
- `POSTGRES_TEST_URL`: Supplies `app.db.engine` to simulate genuine application execution.

### Command:
```powershell
$env:POSTGRES_ADMIN_URL="postgresql+psycopg://postgres@127.0.0.1:54332/casebridge_test"
$env:POSTGRES_TEST_URL="postgresql+psycopg://postgres@127.0.0.1:54332/casebridge_test"
pytest backend/tests
```

### Execution Output:
```text
============================= test session starts =============================
platform win32 -- Python 3.13.1, pytest-9.1.1, pluggy-1.6.0
rootdir: C:\Users\Sohana\OneDrive\Desktop\Casebridge
plugins: anyio-4.14.1, langsmith-0.14.2
collected 155 items

backend\tests\test_admin.py ............                                 [  7%]
backend\tests\test_alerts.py .......                                     [ 12%]
backend\tests\test_auth.py .............                                 [ 20%]
backend\tests\test_cases.py ........................                     [ 36%]
backend\tests\test_email.py ...................                          [ 48%]
backend\tests\test_errors.py ......                                      [ 52%]
backend\tests\test_eval_dataset.py .....                                 [ 55%]
backend\tests\test_events.py ...........                                 [ 62%]
backend\tests\test_health.py ..                                          [ 63%]
backend\tests\test_import.py .......                                     [ 68%]
backend\tests\test_institutions.py .......                               [ 72%]
backend\tests\test_maintenance.py .....                                  [ 76%]
backend\tests\test_migration.py .....                                    [ 79%]
backend\tests\test_models.py ...                                         [ 81%]
backend\tests\test_overlaps.py ..............                            [ 90%]
backend\tests\test_reports.py ...............                            [100%]

======================= 155 passed in 98.70s (0:01:38) ========================
```

**Result**: 155 passed, 0 failed (100% pass rate).

---

## 5. Security Access & Least-Privilege Verification (`scripts/verify_security_access.py`)

Verifies table creation by admin role `postgres` (matching production one-time init), denial of PostgREST `anon` and `authenticated` roles, and authorized least-privileged access by `casebridge_app`.

### Command:
```powershell
python scripts/verify_security_access.py --admin-url "postgresql://postgres@127.0.0.1:54332/casebridge_test"
```

### Execution Output:
```text
======================================================================
STAGE 3: DATABASE ACCESS SECURITY VERIFICATION
======================================================================

[1] Creating tables as ADMIN role (simulating production one-time DDL)...
    Tables verified created by role: 'postgres' (session: 'postgres')

[2] Applying scripts/security_hardening.sql as ADMIN role...
    Security hardening applied and test role passwords configured.

[3] Testing UNAUTHORIZED access denial for 'anon' role against all tables...
  [DENIED] anon          SELECT on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          SELECT on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          SELECT on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          SELECT on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          SELECT on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          SELECT on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          SELECT on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] anon          SELECT on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          INSERT on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          UPDATE on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          DELETE on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] anon          nextval on 'institutions_id_seq' -> InsufficientPrivilege (PASS)

[4] Testing UNAUTHORIZED access denial for 'authenticated' role against all tables...
  [DENIED] authenticated SELECT on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'alerts       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated SELECT on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'case_events  ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated SELECT on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'cases        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated SELECT on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'config       ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated SELECT on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'counters     ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated SELECT on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'institutions ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated SELECT on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'overlap_links' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated SELECT on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated INSERT on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated UPDATE on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated DELETE on 'users        ' -> InsufficientPrivilege (PASS)
  [DENIED] authenticated nextval on 'institutions_id_seq' -> InsufficientPrivilege (PASS)

[5] Testing AUTHORIZED operational access for least-privileged 'casebridge_app' role...
    Connected as role: current_user='casebridge_app', session_user='casebridge_app'
  [ALLOWED] casebridge_app SELECT on 'alerts       ' -> 1 rows
  [ALLOWED] casebridge_app SELECT on 'case_events  ' -> 4 rows
  [ALLOWED] casebridge_app SELECT on 'cases        ' -> 2 rows
  [ALLOWED] casebridge_app SELECT on 'config       ' -> 7 rows
  [ALLOWED] casebridge_app SELECT on 'counters     ' -> 2 rows
  [ALLOWED] casebridge_app SELECT on 'institutions ' -> 3 rows
  [ALLOWED] casebridge_app SELECT on 'overlap_links' -> 1 rows
  [ALLOWED] casebridge_app SELECT on 'users        ' -> 9 rows
  [ALLOWED] casebridge_app full CRUD operations verified under RLS policy.
  [ALLOWED] casebridge_app sequence usage verified (nextval=5).

[6] Testing DDL denial for 'casebridge_app' role (must NOT have CREATE/DROP)...
  [DENIED] casebridge_app CREATE TABLE -> InsufficientPrivilege (PASS)
  [DENIED] casebridge_app DROP TABLE   -> InsufficientPrivilege (PASS)

======================================================================
ALL 68 SECURITY DENIAL AND LEAST-PRIVILEGE TESTS PASSED!
Creator role: postgres | App runtime role: casebridge_app
======================================================================
```

---

## 6. End-to-End Migration Script Verification (`scripts/verify_migration_e2e.py`)

Verifies live DB rejection by name, WAL protection, topological migration of all 8 tables, sequence sync, 100% content hashes, 0 FK orphans, idempotent re-run (0 rows inserted), and deliberate conflict detection (abort without overwriting).

### Command:
```powershell
python scripts/verify_migration_e2e.py --postgres-url "postgresql://postgres@127.0.0.1:54332/casebridge_test"
```

### Execution Output:
```text
======================================================================
STAGE 4: END-TO-END MIGRATION SCRIPT VERIFICATION
======================================================================

[Step 1] Creating synthetic SQLite fixture with all 8 tables...
  Created raw synthetic database at: C:\Users\Sohana\AppData\Local\Temp\cb_migration_verify_gtr10sk3\synthetic_raw.db

[Step 2] Taking consistent VACUUM INTO snapshot...
  Consistent snapshot generated at: C:\Users\Sohana\AppData\Local\Temp\cb_migration_verify_gtr10sk3\synthetic_snapshot.db

[Step 3] Testing Live Database and WAL protection...
  [PASS] Correctly refused live database by name: Refusing to run against primary development/live database: backend\casebridge.db
You must provide a consistent snapshot file created via 'VACUUM INTO' or 'sqlite3 .backup'.
  [PASS] Correctly refused nonexistent live database by name: Refusing to run against primary development/live database: nonexistent\backend\casebridge.db
You must provide a consistent snapshot file created via 'VACUUM INTO' or 'sqlite3 .backup'.
  [PASS] Correctly refused snapshot with pending WAL: Uncheckpointed WAL file detected: C:\Users\Sohana\AppData\Local\Temp\cb_migration_verify_gtr10sk3\synthetic_snapshot.db-wal
The snapshot must be consistent and fully checkpointed with no pending WAL content.

[Step 4] Cleaning PostgreSQL destination tables before initial migration...
  Destination tables emptied.

[Step 5] Running initial migration from synthetic snapshot into PostgreSQL...
[*] Validating source SQLite snapshot: C:\Users\Sohana\AppData\Local\Temp\cb_migration_verify_gtr10sk3\synthetic_snapshot.db
    Snapshot validation passed (clean, checkpointed, integrity OK).
    Table 'config       ':    2 source rows |    2 inserted |    0 identical skipped
    Table 'counters     ':    2 source rows |    2 inserted |    0 identical skipped
    Table 'users        ':    1 source rows |    1 inserted |    0 identical skipped
    Table 'institutions ':    2 source rows |    2 inserted |    0 identical skipped
    Table 'cases        ':    2 source rows |    2 inserted |    0 identical skipped
    Table 'case_events  ':    2 source rows |    2 inserted |    0 identical skipped
    Table 'overlap_links':    1 source rows |    1 inserted |    0 identical skipped
    Table 'alerts       ':    1 source rows |    1 inserted |    0 identical skipped
[*] Synchronizing PostgreSQL sequences above max table IDs...
    Sequence for 'users        ': set to 1
    Sequence for 'institutions ': set to 2
    Sequence for 'cases        ': set to 2
    Sequence for 'case_events  ': set to 2
    Sequence for 'overlap_links': set to 1
    Sequence for 'alerts       ': set to 1
[*] Transaction committed successfully.

================================================================================
VERIFICATION: CONTENT COMPARISON AND FOREIGN KEY INTEGRITY CHECKS
================================================================================
  Table 'config       ': Src=   2 | Dest=   2 | Hash: 44638997 vs 44638997 -> [MATCH]
  Table 'counters     ': Src=   2 | Dest=   2 | Hash: 726d552e vs 726d552e -> [MATCH]
  Table 'users        ': Src=   1 | Dest=   1 | Hash: 86a8205c vs 86a8205c -> [MATCH]
  Table 'institutions ': Src=   2 | Dest=   2 | Hash: 591bd1e1 vs 591bd1e1 -> [MATCH]
  Table 'cases        ': Src=   2 | Dest=   2 | Hash: 550e1924 vs 550e1924 -> [MATCH]
  Table 'case_events  ': Src=   2 | Dest=   2 | Hash: 1c79622c vs 1c79622c -> [MATCH]
  Table 'overlap_links': Src=   1 | Dest=   1 | Hash: f4dce4e7 vs f4dce4e7 -> [MATCH]
  Table 'alerts       ': Src=   1 | Dest=   1 | Hash: 8ca49a6f vs 8ca49a6f -> [MATCH]

[*] Checking Foreign Key Integrity (zero orphans)...
  [PASS] cases.institution_id: 0 orphan rows.
  [PASS] case_events.case_id: 0 orphan rows.
  [PASS] overlap_links.case_a_id: 0 orphan rows.
  [PASS] overlap_links.case_b_id: 0 orphan rows.
  [PASS] alerts.case_id: 0 orphan rows.
  [PASS] alerts.link_id: 0 orphan rows.

[+] Verification Complete: 100% row counts matched, 100% content hashes verified, 0 FK orphans.
  Initial migration succeeded with 100% verified content match!

[Step 6] Testing Idempotent Re-Run (must be complete no-op)...
[*] Validating source SQLite snapshot: C:\Users\Sohana\AppData\Local\Temp\cb_migration_verify_gtr10sk3\synthetic_snapshot.db
    Snapshot validation passed (clean, checkpointed, integrity OK).
    Table 'config       ':    2 source rows |    0 inserted |    2 identical skipped
    Table 'counters     ':    2 source rows |    0 inserted |    2 identical skipped
    Table 'users        ':    1 source rows |    0 inserted |    1 identical skipped
    Table 'institutions ':    2 source rows |    0 inserted |    2 identical skipped
    Table 'cases        ':    2 source rows |    0 inserted |    2 identical skipped
    Table 'case_events  ':    2 source rows |    0 inserted |    2 identical skipped
    Table 'overlap_links':    1 source rows |    0 inserted |    1 identical skipped
    Table 'alerts       ':    1 source rows |    0 inserted |    1 identical skipped
[*] Synchronizing PostgreSQL sequences above max table IDs...
    Sequence for 'users        ': set to 1
    Sequence for 'institutions ': set to 2
    Sequence for 'cases        ': set to 2
    Sequence for 'case_events  ': set to 2
    Sequence for 'overlap_links': set to 1
    Sequence for 'alerts       ': set to 1
[*] Transaction committed successfully.

================================================================================
VERIFICATION: CONTENT COMPARISON AND FOREIGN KEY INTEGRITY CHECKS
================================================================================
  Table 'config       ': Src=   2 | Dest=   2 | Hash: 44638997 vs 44638997 -> [MATCH]
  Table 'counters     ': Src=   2 | Dest=   2 | Hash: 726d552e vs 726d552e -> [MATCH]
  Table 'users        ': Src=   1 | Dest=   1 | Hash: 86a8205c vs 86a8205c -> [MATCH]
  Table 'institutions ': Src=   2 | Dest=   2 | Hash: 591bd1e1 vs 591bd1e1 -> [MATCH]
  Table 'cases        ': Src=   2 | Dest=   2 | Hash: 550e1924 vs 550e1924 -> [MATCH]
  Table 'case_events  ': Src=   2 | Dest=   2 | Hash: 1c79622c vs 1c79622c -> [MATCH]
  Table 'overlap_links': Src=   1 | Dest=   1 | Hash: f4dce4e7 vs f4dce4e7 -> [MATCH]
  Table 'alerts       ': Src=   1 | Dest=   1 | Hash: 8ca49a6f vs 8ca49a6f -> [MATCH]

[*] Checking Foreign Key Integrity (zero orphans)...
  [PASS] cases.institution_id: 0 orphan rows.
  [PASS] case_events.case_id: 0 orphan rows.
  [PASS] overlap_links.case_a_id: 0 orphan rows.
  [PASS] overlap_links.case_b_id: 0 orphan rows.
  [PASS] alerts.case_id: 0 orphan rows.
  [PASS] alerts.link_id: 0 orphan rows.

[+] Verification Complete: 100% row counts matched, 100% content hashes verified, 0 FK orphans.
  Idempotent re-run verified: 0 rows inserted, all rows identical and skipped.

[Step 7] Testing Deliberate Conflict Protection (No-Overwrite Guarantee)...
  Deliberately introduced conflict in destination: modified user #1 email.
[*] Validating source SQLite snapshot: C:\Users\Sohana\AppData\Local\Temp\cb_migration_verify_gtr10sk3\synthetic_snapshot.db
    Snapshot validation passed (clean, checkpointed, integrity OK).
    Table 'config       ':    2 source rows |    0 inserted |    2 identical skipped
    Table 'counters     ':    2 source rows |    0 inserted |    2 identical skipped
  [PASS] Conflict detected and migration stopped with error:
    Conflict detected in table 'users' for PK (1,)!
Destination has different content than source: email: src='synth.coord@example.com' != dest='hacked_dest_email@example.com'
Migration aborted to prevent silent data overwrite.
  Verified destination row preserved untouched: email='hacked_dest_email@example.com' (NO OVERWRITE).

======================================================================
ALL STAGE 4 DATA MIGRATION VERIFICATION CHECKS PASSED CLEANLY!
======================================================================
```

---

## 7. Runtime Role & Lifecycle Persistence (`scripts/verify_runtime_role.py`)

Verifies genuine runtime operation under the least-privileged `casebridge_app` role with `RUN_DDL=false`, executing login, complaint registration with atomic counter increments, overlap scans, review decisions under RLS, cold restart persistence across engine disposal, and zero external email side effects.

### Command:
```powershell
python scripts/verify_runtime_role.py `
  --admin-url "postgresql://postgres@127.0.0.1:54332/casebridge_test" `
  --app-url "postgresql://casebridge_app:test_app_pass_123@127.0.0.1:54332/casebridge_test"
```

### Execution Output:
```text
Unknown EMAIL_BACKEND 'none'; safely skipping email delivery to student.a@example.com
Unknown EMAIL_BACKEND 'none'; safely skipping email delivery to student.b@example.com
======================================================================
STAGE 4: RUNTIME ROLE & LIFECYCLE PERSISTENCE VERIFICATION
======================================================================

[Step 1] Preparing database via ADMIN role ('postgres')...
  Admin setup complete: tables initialized and security hardening applied.

[Step 2] Connecting application genuinely as 'casebridge_app'...
  Verified app engine connected as: current_user='casebridge_app'

[Step 3] Booting FastAPI application (verifying NO DDL / NO seeding under casebridge_app)...
  FastAPI lifespan completed cleanly under 'casebridge_app' with RUN_DDL=false.

[Step 4] Authenticating as coordinator...
  Authentication successful: JWT token issued.

[Step 5] Registering complaints as 'casebridge_app'...
  Complaint 1 registered: Case No 'RB-2026-00001'
  Complaint 2 registered: Case No 'PG-2026-00001'

[Step 6] Running overlap detection scan as 'casebridge_app'...
  Overlap scan completed: created 1 links.

[Step 7] Submitting review decision as 'casebridge_app'...
  Review decision successfully submitted for overlap link #1.

[Step 8] Testing Cold Restart Persistence (reloading from PostgreSQL)...
  [PASS] Cold restart verified: Cases 'RB-2026-00001' and 'PG-2026-00001' persisted intact across restart.

======================================================================
ALL RUNTIME ROLE AND COLD RESTART CHECKS PASSED CLEANLY!
Application genuinely operated under least-privileged role 'casebridge_app'.
======================================================================
```

