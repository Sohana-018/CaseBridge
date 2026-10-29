# CaseBridge: Database Migration Runbook (SQLite to Supabase Postgres)

This runbook defines the operational procedure for migrating the CaseBridge database from Render ephemeral SQLite storage to Supabase PostgreSQL (Free Tier).

> [!CRITICAL]
> **STAGE 5 MANDATORY STOP CHECKPOINT & CUTOVER BLOCKERS**:
> Cutover MUST NOT proceed until two explicit blockers are resolved with the user:
> 1. **Snapshot Extraction Route (BLOCKED on Render Free Tier)**: Render free-tier web services have no shell access (SSH or console), no persistent disk, and no one-off job execution. Extracting the live SQLite database without a shell is currently blocked.
> 2. **Pre-Cutover Write Freeze (BLOCKED on Existing Live Service)**: Setting environment variables (such as `SYSTEM_MAINTENANCE_MODE=true`) or redeploying on Render free tier causes a container restart that wipes ephemeral storage, destroying unpreserved data. Suspending the frontend service leaves the backend API reachable and writes can continue.
>
> **Do NOT run live migration or cutover until a verified, non-destructive snapshot extraction and write-freeze route is approved.**

---

## Architecture Summary

| Component | Current State (Ephemeral) | Target State (Persistent) |
| :--- | :--- | :--- |
| **Database Engine** | SQLite 3 (`backend/casebridge.db`) | PostgreSQL 16 (Supabase Shared Pooler) |
| **Hosting Platform** | Render Free Tier (ephemeral disk) | Supabase Free Tier (managed DB) |
| **Admin Connection** | Local filesystem file | `postgres.[PROJECT-REF]` via Session Pooler (DDL & migration only) |
| **Runtime App Connection** | Local filesystem file | `casebridge_app.[PROJECT-REF]` via Session Pooler (Port 5432, IPv4) |
| **Driver** | Built-in Python `sqlite3` | `psycopg[binary]>=3.2.0` |
| **Data API Exposure** | N/A (local SQLite) | Fully Neutralized (Privileges Revoked + Deny-all RLS) |
| **DDL on Boot** | Run on boot | Decoupled (`RUN_DDL=false`, one-time admin setup) |
| **Seeding on Boot** | Run on boot (`AUTO_SEED=true`) | Decoupled (`AUTO_SEED=false`, manual one-time init) |

---

## Stage A: Supabase Project Setup & Connection String Configuration

### 1. Create Supabase Project
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New project** and select your organization.
3. Choose a project name (e.g. `casebridge-prod`) and a secure database password.
4. Select the region closest to your Render service (e.g. `Frankfurt (eu-central-1)` or `Singapore (ap-southeast-1)`).
5. Ensure you remain on the **Free Plan** (do NOT enable the paid IPv4 add-on).

### 2. Understand the Two-Role Security Architecture

CaseBridge strictly enforces a **Two-Role Model** to eliminate superuser/owner privileges at runtime:

1. **Migration / Admin Role (`postgres`)**:
   - Used **only** by the system administrator for one-time table creation (`create_db_and_tables`), running `scripts/security_hardening.sql`, and running the initial `scripts/migrate_sqlite_to_postgres.py` migration script.
   - Never configured in Render runtime environment variables.
2. **Runtime Application Role (`casebridge_app`)**:
   - Used by the Render web service for day-to-day application operations.
   - Genuine least-privileged role: granted `SELECT`, `INSERT`, `UPDATE`, `DELETE` under strict RLS policies on application tables; granted sequence usage; **strictly denied `CREATE TABLE`, `DROP TABLE`, `ALTER TABLE`, or schema modifications**.
   - Runs with `RUN_DDL=false`, performing NO DDL and NO schema validation on startup.

### 3. Configure Custom Pooler Connection Strings

> [!WARNING]
> **IP Version & Connection Mode Rules**:
> - Supabase's **Direct Connection** (port 5432 on `db.<ref>.supabase.co`) is strictly **IPv6-only** on the free tier. Render's free tier runtime does not support outbound IPv6 to external hosts. Attempting direct connection from Render will fail with network timeout / connection refused.
> - Supabase's **Shared Pooler** provides an **IPv4-compatible** endpoint available on every plan at no extra cost.
> - You **MUST** use **Session Mode (Port 5432)**, NOT Transaction Mode (Port 6543). CaseBridge uses SQLModel/SQLAlchemy connection pooling, session-scoped prepared statements, and sequence tracking that require Session Mode.
> - Supabase's shared pooler supports custom database roles using the username syntax: `[ROLE].[PROJECT-REF]`.

1. In your Supabase Dashboard, click **Connect** (top navigation bar).
2. Under **Connection Method**, select **Session pooler** (Mode: **Session**, Port: **`5432`**).
3. Copy the pooler host name (e.g. `aws-0-[REGION].pooler.supabase.com`).
4. **Admin Connection URL** (for one-time migration only):
   ```text
   postgresql://postgres.[PROJECT-REF]:[ADMIN-PASSWORD]@[POOLER-HOST]:5432/postgres?sslmode=require
   ```
5. **Runtime Connection URL** (for Render `DATABASE_URL`):
   ```text
   postgresql://casebridge_app.[PROJECT-REF]:[APP-PASSWORD]@[POOLER-HOST]:5432/postgres?sslmode=require
   ```
   *(Note: Percent-encode special characters in passwords if applicable, e.g. `@` -> `%40`).*

---

## Stage B: Apply Security Hardening BEFORE Any Data Copy

By default, Supabase exposes all tables in the `public` schema via its auto-generated PostgREST Data API to the `anon` and `authenticated` roles. Because CaseBridge handles sensitive grievance records and uses its own FastAPI JWT auth, the Data API must be completely locked down before copying any live data.

### 1. Execute Security Hardening Script as Admin (`postgres`)
In your Supabase Dashboard, open the **SQL Editor**, paste and run the contents of [`scripts/security_hardening.sql`](file:///scripts/security_hardening.sql):

```sql
-- 1. Layer A: Revoke all table, sequence, and routine privileges from anon and authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- 2. Layer B: Enable Row Level Security (RLS) Deny-by-Default on all tables
ALTER TABLE IF EXISTS alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS overlap_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;

-- 3. Layer C: Least-Privileged Application Role (casebridge_app)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'casebridge_app') THEN
        CREATE ROLE casebridge_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO casebridge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO casebridge_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO casebridge_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO casebridge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO casebridge_app;

-- 4. Grant explicit RLS policy to casebridge_app
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY['alerts', 'case_events', 'cases', 'config', 'counters', 'institutions', 'overlap_links', 'users'];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
            EXECUTE format('DROP POLICY IF EXISTS casebridge_app_full_access ON %I;', tbl);
            EXECUTE format('CREATE POLICY casebridge_app_full_access ON %I TO casebridge_app USING (true) WITH CHECK (true);', tbl);
        END IF;
    END LOOP;
END
$$;
```

### 2. Set Password for `casebridge_app` Role
In the Supabase SQL Editor, execute:
```sql
ALTER ROLE casebridge_app WITH PASSWORD '[USER-CHOSEN-SECURE-PASSWORD]';
```
*(The user chooses and enters their own password; never log or commit credentials).*

### 3. Verify Access Denial in Supabase SQL Editor
Run the verification check in the SQL Editor to prove `anon` cannot read anything:
```sql
SET ROLE anon;
SELECT * FROM cases; -- Must fail with: ERROR: permission denied for table cases
RESET ROLE;
```

---

## Stage C: Pre-Cutover Backup & Write-Freeze Status

> [!CAUTION]
> **EPHEMERAL STORAGE & FREE-TIER REALITY**:
> Render's free tier stores files on an ephemeral container filesystem (https://render.com/docs/free). Any container restart, redeploy, or spin-down permanently destroys un-backed-up SQLite files.
>
> **CRITICAL RUNBOOK STATUS**:
> - **Snapshot Extraction: [BLOCKED ON RENDER FREE TIER]**
>   Render free web services provide NO SSH shell, NO dashboard terminal, and NO persistent disk. The `sqlite3` or Python `VACUUM INTO` procedure below is executable ONLY if the service is on a paid Render plan with shell access or if a dedicated extraction route is implemented.
> - **Pre-Cutover Write Freeze: [BLOCKED ON EXISTING LIVE SERVICE]**
>   Setting `SYSTEM_MAINTENANCE_MODE=true` on the existing live service requires a redeploy, which would wipe the ephemeral SQLite file before it can be preserved. Furthermore, suspending the frontend service leaves the backend API reachable and incoming writes could continue.
> - **Requirement**: Cutover MUST NOT proceed until a verified, non-destructive extraction route is established.

### Conditional Procedure (Requires Paid Render Plan with Shell Access):
*If and only if SSH/shell access is available on a paid plan:*

1. Checkpoint WAL and take atomic consistent snapshot:
   ```bash
   python -c "
   import sqlite3
   conn = sqlite3.connect('backend/casebridge.db')
   conn.execute('PRAGMA wal_checkpoint(TRUNCATE);')
   conn.execute(\"VACUUM INTO 'backend/casebridge_snapshot_pre_cutover.db';\")
   conn.close()
   print('Consistent backup complete.')
   "
   ```
2. Verify snapshot integrity offline:
   ```bash
   sqlite3 backend/casebridge_snapshot_pre_cutover.db "PRAGMA integrity_check;"
   sha256sum backend/casebridge_snapshot_pre_cutover.db > snapshot_hash.txt
   ```
3. Download `casebridge_snapshot_pre_cutover.db` and hash file safely off-Render before proceeding.

---

## Stage D: Run Migration Script Against Supabase

### 1. First-Time Schema Initialization via Admin Role (`postgres`)
Create all PostgreSQL tables using the admin connection:
```bash
python -c "
import os
os.environ['RUN_DDL'] = 'true'
os.environ['DATABASE_URL'] = '[SUPABASE_ADMIN_POOLER_URL]'
from app.db import create_db_and_tables, engine
create_db_and_tables(engine)
print('Tables initialized in Supabase by role postgres.')
"
```

### 2. Re-apply Security Hardening
In the Supabase SQL Editor, re-run `scripts/security_hardening.sql` to ensure RLS policies and table grants cover all newly created tables.

### 3. Execute Data Migration Script
Run the idempotent, conflict-safe migration script using the admin connection:
```bash
python scripts/migrate_sqlite_to_postgres.py \
  --sqlite-snapshot backend/casebridge_snapshot_pre_cutover.db \
  --postgres-url "[SUPABASE_ADMIN_POOLER_URL]"
```

The script will:
1. Verify snapshot integrity and refuse live databases by name (`casebridge.db`) or uncheckpointed WAL files.
2. Transfer all 8 tables in topological order: `config`, `counters`, `users`, `institutions`, `cases`, `case_events`, `overlap_links`, `alerts`.
3. Advance all PostgreSQL sequences above max existing table IDs.
4. Verify 100% row counts, 100% SHA-256 typed content hashes, and zero FK orphans.
5. Provide idempotent re-run (0 rows inserted on second pass) and abort on any destination conflict without overwriting.

---

## Stage E: Cutover & Production Deployment

### 1. Update Render Environment Variables
In the Render Dashboard for `casebridge-backend`:
1. **`DATABASE_URL`**: Set genuinely to the runtime role connection string:
   `postgresql://casebridge_app.[PROJECT-REF]:[APP-PASSWORD]@[POOLER-HOST]:5432/postgres?sslmode=require`
2. **`RUN_DDL`**: Set to `"false"` (strictly prohibits DDL under `casebridge_app`).
3. **`AUTO_SEED`**: Set to `"false"` (strictly disables auto-seeding on boot).
4. **`RUN_SEED_IMPORT`**: Set to `"false"` (strictly disables CSV import on boot).
5. **`SYSTEM_MAINTENANCE_MODE`**: Ensure unset or `"false"`.
6. Trigger the deployment on Render.

### 2. Post-Cutover Verification Checklist
- [ ] **Health Endpoint**: `GET /api/v1/health` returns `{"status":"ok"}`.
- [ ] **Admin Status**: `GET /api/v1/admin/health-summary` reports `db_status: "Operational (PostgreSQL)"`.
- [ ] **Role Verification**: Application connects as `casebridge_app` with zero DDL permissions.
- [ ] **Authentication**: Log in using an existing coordinator/admin account.
- [ ] **Data Verification**: Confirm existing cases, review outcomes, and institutions display properly.
- [ ] **Sequence Verification**: Register a new complaint. Verify it receives the next incremental case number without collision.
- [ ] **Overlap Scan & Review**: Verify overlap scan and submit a review decision under RLS. Confirm persistence across page reloads.

---

## Stage F: Maintenance Mode Implementation & Operational Scope

### 1. Code Implementation
CaseBridge provides `SYSTEM_MAINTENANCE_MODE=true` support:
- **Mutating Requests**: Default-denies all `POST`, `PUT`, `PATCH`, `DELETE` requests with HTTP 503 and structured error:
  `{"error": {"code": "MAINTENANCE_MODE", "message": "System is currently undergoing scheduled maintenance. Write operations are temporarily suspended."}}`
- **Allowlist**: Permits only `/api/v1/auth/login` and `/api/v1/auth/mock-login` so that administrators and health-checks can authenticate.
- **Read Operations**: All `GET` requests pass through cleanly.
- **Background Operations**: Lifespan startup seeding (`AUTO_SEED`), CSV seed import (`RUN_SEED_IMPORT`), alert evaluations, and the standalone `scripts/import_csv.py` script automatically abort when maintenance mode is active.

### 2. Operational Scope & Limitations
- **Post-Cutover Use**: When running on PostgreSQL, setting `SYSTEM_MAINTENANCE_MODE=true` safely freezes all runtime writes during planned maintenance or rollbacks.
- **Pre-Cutover Prohibition on Render Free Tier**: Because Render free tier restarts containers on environment variable changes, setting this flag on the existing live service causes an ephemeral filesystem wipe. It cannot be used as a pre-cutover write freeze on Render free tier.

---

## Rollback Plan

### Scenario 1: Rollback BEFORE any new writes land in Postgres
*(Requires paid Render plan with shell access to restore files)*
1. In Render, set `DATABASE_URL` back to SQLite (or leave unset).
2. If the container was restarted and wiped the ephemeral database, restore from offline snapshot via shell:
   ```bash
   cp backend/casebridge_snapshot_pre_cutover.db backend/casebridge.db
   ```
3. Restart backend service.

### Scenario 2: Rollback AFTER new writes have landed in Postgres
> [!WARNING]
> If new complaints or review decisions were recorded in Postgres after cutover, **DO NOT silently overwrite them with the old SQLite snapshot**.
1. In Render environment variables, set `SYSTEM_MAINTENANCE_MODE=true` to freeze writes safely.
2. In Supabase SQL Editor, export records created after cutover:
   ```sql
   SELECT * FROM cases WHERE created_at > '[CUTOVER_TIMESTAMP]';
   SELECT * FROM overlap_links WHERE created_at > '[CUTOVER_TIMESTAMP]';
   SELECT * FROM case_events WHERE ts > '[CUTOVER_TIMESTAMP]';
   ```
3. Replay exported records into SQLite and update `counters`.
4. Revert Render environment variables.

---

## Supabase & Render Free-Tier Operational Caveats

1. **Supabase Inactivity Pausing (1-Year Restore Window)**:
   - Supabase automatically pauses free-tier projects after **7 days of database inactivity**.
   - Supabase sends an email notification ~7 days before pausing.
   - If paused, the database can be unpaused from the Supabase dashboard in ~1-2 minutes without data loss. Projects can be restored for **up to 1 year** after pausing (per [Supabase Pausing Docs](https://supabase.com/docs/guides/platform/pausing)).
   - *Mitigation*: CaseBridge's normal usage or periodic uptime ping keeps the pooler active.
2. **No Automatic Backups on Free Tier**:
   - The Supabase free plan does NOT include automated daily backups or Point-in-Time Recovery (PITR).
   - *Mitigation*: Maintain a scheduled weekly backup using `pg_dump`:
     ```bash
     pg_dump -d "[SUPABASE_ADMIN_POOLER_URL]" -F c -b -v -f "backup_$(date +%Y%m%d).dump"
     ```
3. **Render Cold Starts**:
   - Migrating to Supabase provides **persistent storage** across Render restarts, but it **DOES NOT eliminate Render free-tier cold starts** (~50 seconds when spun down due to HTTP inactivity). `pool_pre_ping=True` ensures stale pooled connections reconnect gracefully upon wake-up.
