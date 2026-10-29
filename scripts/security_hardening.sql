-- CaseBridge Security Hardening Script for Supabase Postgres
-- Neutralizes unauthorized Data API access by revoking all permissions from anon and authenticated roles,
-- and enabling Row Level Security (RLS) on all backend tables.
-- Sets up the least-privileged backend application role: casebridge_app.

-- 1. Create Supabase client roles if they do not exist (pre-existing in real Supabase)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END
$$;

-- 2. Layer A: Privilege Revocation from anon & authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon, authenticated;

-- Ensure future created tables/sequences in public schema do not grant default permissions to anon/authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon, authenticated;

-- 3. Layer B: Row Level Security (RLS) Deny-by-Default on all tables
ALTER TABLE IF EXISTS alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS overlap_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;

-- 4. Create least-privileged backend application role
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

-- 5. Grant RLS Policy to casebridge_app so it can execute CRUD under RLS
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
