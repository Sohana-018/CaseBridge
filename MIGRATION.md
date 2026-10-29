# CaseBridge: Database Migration Runbook (SQLite to Supabase Postgres)

This runbook defines the exact operational procedure for migrating the CaseBridge database from Render ephemeral SQLite storage to Supabase PostgreSQL (Free Tier).

> [!CRITICAL]
> **MANDATORY PRE-CONDITION**: Do NOT start this cutover without first freezing writes and verifying an offline consistent snapshot. Because Render free tier uses ephemeral container storage, any restart or redeploy can wipe the SQLite file. **Your verified offline snapshot is the ONLY rollback source. If a complete consistent snapshot cannot be obtained, the cutover does not proceed.**

---

## Architecture Summary

| Component | Current State (Ephemeral) | Target State (Persistent) |
| :--- | :--- | :--- |
| **Database Engine** | SQLite 3 (`backend/casebridge.db`) | PostgreSQL 16 (Supabase Shared Pooler) |
| **Hosting Platform** | Render Free Tier (ephemeral disk) | Supabase Free Tier (managed DB) |
| **Connection Method** | Local filesystem file | Session-Mode Shared Pooler (Port 5432, IPv4) |
| **Driver** | Built-in Python `sqlite3` | `psycopg[binary]>=3.2.0` |
| **Data API Exposure** | N/A (local SQLite) | Fully Neutralized (Privileges Revoked + Deny-all RLS) |
| **Seeding on Boot** | Run on every boot (`AUTO_SEED=true`) | Decoupled (`AUTO_SEED=false`, manual one-time init) |

---

## Stage A: Supabase Project Setup & Connection String

### 1. Create Supabase Project
1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New project** and select your organization.
3. Choose a project name (e.g. `casebridge-prod`) and a secure database password.
4. Select the region closest to your Render service (e.g. `Frankfurt (eu-central-1)` or `Singapore (ap-southeast-1)`).
5. Ensure you remain on the **Free Plan** (do NOT enable the paid IPv4 add-on).

### 2. Copy the Session-Mode Shared Pooler Connection String
> [!WARNING]
> **IP Version & Connection Mode Rules**:
> - Supabase's **Direct Connection** (port 5432 on `db.<ref>.supabase.co`) is strictly **IPv6-only** on the free tier. Render's free tier runtime does not support outbound IPv6 to external hosts. Attempting direct connection from Render will fail with network timeout / connection refused.
> - Supabase's **Shared Pooler** provides an **IPv4-compatible** endpoint available on every plan at no extra cost.
> - You **MUST** use **Session Mode (Port 5432)**, NOT Transaction Mode (Port 6543). CaseBridge uses SQLModel/SQLAlchemy connection pooling, session-scoped prepared statements, and sequence tracking that require Session Mode.
> - The pooler host name CANNOT be guessed or derived from region name alone — it must be copied directly from your project's Connect dialog.

1. In your project dashboard, click **Connect** (top navigation bar).
2. Under **Connection Method**, select **Session pooler** (or **Connection pooler** -> Mode: **Session**).
3. The port MUST be **`5432`** (NOT `6543`).
4. Copy the URI string, which will look like:
   ```text
   postgres://postgres.[PROJECT_REF]:[YOUR-PASSWORD]@[POOLER-HOST].pooler.supabase.com:5432/postgres?sslmode=require
   ```
5. **URL Encoding & Dialect**:
   - If your password contains special characters (e.g. `@`, `#`, `/`, `%`), you must percent-encode it (e.g. `@` -> `%40`).
   - The CaseBridge backend driver automatically normalizes `postgres://` or `postgresql://` to `postgresql+psycopg://`.
   - Ensure `sslmode=require` is present at the end of the query string.

---

## Stage B: Apply Security Hardening BEFORE Any Data Copy

By default, Supabase exposes all tables in `public` schema via its auto-generated PostgREST Data API to the `anon` and `authenticated` roles. Because CaseBridge handles sensitive grievance records and uses its own FastAPI JWT auth, the Data API must be completely locked down before copying any live data.

### 1. Execute Security Hardening Script
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

### 2. Verify Access Denial in Supabase SQL Editor
Run the verification check in the SQL Editor to prove `anon` cannot read anything:
```sql
SET ROLE anon;
SELECT * FROM cases; -- Must fail with: ERROR: permission denied for table cases
RESET ROLE;
```

---

## Stage C: Pre-Cutover Backup (Safe Write-Freeze and Snapshot)

> [!CAUTION]
> **EPHEMERAL STORAGE WARNING**: Render's free tier stores files on an ephemeral container filesystem. Any container restart, crash, or deployment permanently destroys any un-backed-up SQLite database.
> The write freeze MUST be active before taking the snapshot, and MUST remain active until PostgreSQL cutover is fully verified.

### 1. Freeze Live Writes
To guarantee zero data drift or lost complaints during cutover:
1. In the Render Dashboard, temporarily suspend the frontend service OR set the environment variable:
   `SYSTEM_MAINTENANCE_MODE=true` (or stop web traffic).
2. Confirm via Render logs that no incoming `POST /cases` or `POST /overlaps/*/review` requests are in-flight.

### 2. Take Consistent SQLite Snapshot (with WAL checkpoint)
Do NOT copy `casebridge.db` using ordinary file copy (`cp`), because active transactions in `casebridge.db-wal` would be skipped or corrupted. Use SQLite's online consistent backup API or `VACUUM INTO`:

Connect to the running container shell or run via SSH:
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

### 3. Verify Snapshot Integrity and Store Off-Render
Run the offline verification on the snapshot:
```bash
sqlite3 backend/casebridge_snapshot_pre_cutover.db "PRAGMA integrity_check;"
# Output must be: ok

# Compute SHA-256 hash
sha256sum backend/casebridge_snapshot_pre_cutover.db > snapshot_hash.txt

# Record row counts
sqlite3 backend/casebridge_snapshot_pre_cutover.db "
SELECT 'institutions', count(*) FROM institutions
UNION ALL SELECT 'cases', count(*) FROM cases
UNION ALL SELECT 'case_events', count(*) FROM case_events
UNION ALL SELECT 'overlap_links', count(*) FROM overlap_links
UNION ALL SELECT 'alerts', count(*) FROM alerts
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'counters', count(*) FROM counters
UNION ALL SELECT 'config', count(*) FROM config;
" > snapshot_counts.txt
```
**Download `casebridge_snapshot_pre_cutover.db`, `snapshot_hash.txt`, and `snapshot_counts.txt` safely onto your local machine or secure cloud storage.**

---

## Stage D: Run Migration Script Against Supabase

### 1. First-Time Schema Initialization
Ensure all PostgreSQL tables are created in Supabase:
```bash
python -c "
import os
os.environ['DATABASE_URL'] = '[YOUR_SUPABASE_SESSION_POOLER_URL]'
from app.db import create_db_and_tables, engine
create_db_and_tables(engine)
print('Tables initialized in Supabase.')
"
```

### 2. Re-apply Security Hardening
Re-run `scripts/security_hardening.sql` in the Supabase SQL editor to ensure RLS and privilege revocations cover the newly created tables.

### 3. Execute Migration
Run the idempotent, conflict-safe migration script:
```bash
python scripts/migrate_sqlite_to_postgres.py \
  --sqlite-snapshot backend/casebridge_snapshot_pre_cutover.db \
  --postgres-url "[YOUR_SUPABASE_SESSION_POOLER_URL]"
```

The script will:
1. Verify snapshot file integrity and ensure no dangling WAL.
2. Transfer all 8 tables in topological order (`config`, `counters`, `users`, `institutions`, `cases`, `case_events`, `overlap_links`, `alerts`).
3. Advance all PostgreSQL sequences above max existing IDs.
4. Verify 100% row counts, 100% SHA-256 content hashes, and 0 FK orphans.
5. Exit cleanly with code `0`.

---

## Stage E: Cutover & Production Deployment

### 1. Update Render Environment Variables
In the Render Dashboard for `casebridge-backend`:
1. **`DATABASE_URL`**: Set to your copied session pooler connection string:
   `postgres://postgres.[REF]:[ENCODED_PASSWORD]@[POOLER_HOST].pooler.supabase.com:5432/postgres?sslmode=require`
2. **`AUTO_SEED`**: Set to `"false"` (strictly disables auto-seeding on boot).
3. **`RUN_SEED_IMPORT`**: Set to `"false"` (ensures CSV importer never runs on container startup).
4. **`SEED_DEMO_OUTCOMES`**: Leave unset or set to `"false"`.
5. Remove `SYSTEM_MAINTENANCE_MODE` to restore web traffic.
6. Deploy the changes on Render.

### 2. Post-Cutover Verification Checklist
- [ ] **Health Endpoint**: `GET /api/v1/health` returns `{"status":"ok"}`.
- [ ] **Admin Status**: `GET /api/v1/admin/health-summary` reports `db_status: "Operational (PostgreSQL)"`.
- [ ] **Authentication**: Log into the frontend using an existing coordinator/admin account.
- [ ] **Data Verification**: Confirm existing cases, review outcomes, and institutions display properly.
- [ ] **Sequence Verification**: Submit a test complaint from the UI. Verify it generates the next incremental case number without colliding with existing cases.
- [ ] **Overlap Scan**: Verify the overlap queue and confirm review decisions persist across page reloads.

---

## Rollback Plan

If unexpected issues arise during or after cutover:

### Scenario 1: Rollback BEFORE any new writes land in Postgres
If the cutover fails during verification and NO user has written new complaints or reviews to Postgres:
1. In Render, revert `DATABASE_URL` to point back to SQLite (or leave unset to default to `backend/casebridge.db`).
2. If Render's container restarted and wiped the ephemeral SQLite file, restore it directly from the offline snapshot:
   ```bash
   cp backend/casebridge_snapshot_pre_cutover.db backend/casebridge.db
   ```
3. Restart backend service.

### Scenario 2: Rollback AFTER new writes have landed in Postgres
> [!WARNING]
> If new complaints or review decisions were recorded in Postgres after cutover, **DO NOT silently overwrite them with the old SQLite snapshot**.
1. Set `SYSTEM_MAINTENANCE_MODE=true` to freeze writes.
2. Run an export query in PostgreSQL to capture all records created after cutover:
   ```sql
   SELECT * FROM cases WHERE created_at > '[CUTOVER_TIMESTAMP]';
   SELECT * FROM overlap_links WHERE created_at > '[CUTOVER_TIMESTAMP]';
   SELECT * FROM case_events WHERE ts > '[CUTOVER_TIMESTAMP]';
   ```
3. Restore SQLite from `casebridge_snapshot_pre_cutover.db`.
4. Replay the post-cutover exported records into SQLite, update the `counters` table, and verify continuity.
5. Revert Render environment variables.

---

## Supabase & Render Free-Tier Operational Caveats

1. **Supabase Inactivity Pausing**:
   - Supabase automatically pauses free-tier projects after **7 days of database inactivity**.
   - Supabase sends an email notification ~7 days before pausing.
   - If paused, the database can be unpaused from the Supabase dashboard in ~1-2 minutes without data loss. Projects can be restored for up to 90-365 days.
   - *Mitigation*: CaseBridge's normal usage or periodic uptime ping keeps the pooler active.
2. **No Automatic Backups on Free Tier**:
   - The Supabase free plan does NOT include automated daily backups or Point-in-Time Recovery (PITR).
   - *Mitigation*: Maintain a scheduled weekly backup using `pg_dump`:
     ```bash
     pg_dump -d "[SUPABASE_POOLER_URL]" -F c -b -v -f "backup_$(date +%Y%m%d).dump"
     ```
3. **Render Cold Starts**:
   - Migrating to Supabase provides **persistent storage** across Render restarts, but it **DOES NOT eliminate Render free-tier cold starts** (which take ~50 seconds when spun down due to HTTP inactivity). `pool_pre_ping=True` ensures stale pooled connections reconnect gracefully upon wake-up.

