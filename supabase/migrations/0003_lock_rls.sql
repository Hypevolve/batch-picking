-- Migration 0003: lock the tables to the server.
--
-- Until now every table had RLS on but a policy "Allow all for authenticated"
-- with USING (true) WITH CHECK (true) and no TO clause, so it applied to every
-- role, including `anon`: anyone holding the publishable key (it ships to the
-- browser) could read and change users (password hashes), orders (customer
-- names) and everything else through the Supabase REST API.
--
-- After this migration:
--   * RLS stays enabled on every table and there is no policy for public, anon
--     or authenticated, so those roles see no rows;
--   * anon, authenticated and PUBLIC have no privileges on the tables or their
--     id sequences, so the REST API answers 401 for the publishable key;
--   * service_role (SUPABASE_SERVICE_ROLE_KEY, server only) keeps full access;
--     it bypasses RLS.
--
-- ORDER MATTERS (docs/RLS-PRELAZAK.md): run this only after
--   1. SUPABASE_SERVICE_ROLE_KEY is set on Render, and
--   2. the code that uses it is deployed: GET /api/health shows
--      "serviceRoleConfigured": true.
-- Run it earlier and the live app loses database access.
--
-- Run in the Supabase SQL Editor. Safe to re-run: it only drops policies that
-- exist, skips tables that do not exist, and REVOKE/GRANT/ENABLE are idempotent.

DO $$
DECLARE
  app_tables text[] := ARRAY[
    'users', 'products', 'product_locations', 'picking_routes', 'orders',
    'order_items', 'batches', 'batch_orders', 'batch_items', 'activity_logs'
  ];
  t text;
  pol record;
  seq text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Roles anon, authenticated and service_role not found: run this in the Supabase project database.';
  END IF;

  FOREACH t IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'skipped %: table does not exist', t;
      CONTINUE;
    END IF;

    -- Every policy that reaches public, anon or authenticated: the old USING (true)
    -- ones and anything added by hand in the dashboard.
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
      RAISE NOTICE 'dropped policy "%" on %', pol.policyname, t;
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated, PUBLIC', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);

    seq := pg_get_serial_sequence(format('public.%I', t), 'id');
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated, PUBLIC', seq);
      EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %s TO service_role', seq);
    END IF;
  END LOOP;
END
$$;

-- Check (the SQL Editor shows this result): every row should read
-- rls_enabled = true, open_policies = 0, anon_access = false,
-- authenticated_access = false, service_role_access = true.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
      AND p.roles && ARRAY['public', 'anon', 'authenticated']::name[]) AS open_policies,
  has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE') AS anon_access,
  has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE') AS authenticated_access,
  has_table_privilege('service_role', c.oid, 'SELECT') AND has_table_privilege('service_role', c.oid, 'INSERT')
    AND has_table_privilege('service_role', c.oid, 'UPDATE') AND has_table_privilege('service_role', c.oid, 'DELETE')
    AS service_role_access
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = ANY (ARRAY[
    'users', 'products', 'product_locations', 'picking_routes', 'orders',
    'order_items', 'batches', 'batch_orders', 'batch_items', 'activity_logs'
  ])
ORDER BY c.relname;
