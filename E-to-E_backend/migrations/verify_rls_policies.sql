-- =============================================================================
-- verify_rls_policies.sql
-- Extra-to-Essential — RLS policy verification script
-- =============================================================================
-- Run this against your Supabase project (SQL Editor) to verify that all
-- RLS policies are correctly applied. This script does NOT modify any
-- data or schema — it only queries the information schema to produce a
-- readable report.
--
-- Each section checks one table and lists its policies. Use this after
-- applying all migrations to confirm the expected policies exist.
-- =============================================================================

-- ── 1. Summary: which tables have RLS enabled? ──
SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
      'profiles', 'donors', 'ngos', 'volunteers', 'food_listings',
      'ngo_claims', 'deliveries', 'impact_metrics', 'notification_logs',
      'delivery_collection_secrets', 'impact_wallets', 'carbon_credits'
  )
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- ── 2. Deliveries policies (most critical) ──
-- After all migrations, there should be exactly one SELECT policy:
-- "deliveries_select_participants" — NOT "View assigned deliveries"
-- and NOT "delivery_tracking_participant_read".
SELECT
    polname AS policy_name,
    CASE polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
    END AS command,
    pg_get_expr(qual, polrelid) AS using_expression,
    pg_get_expr(with_check, polrelid) AS check_expression
FROM pg_policy
WHERE polrelid = 'public.deliveries'::regclass
ORDER BY polname;

-- ── 3. All policies across key tables ──
SELECT
    c.relname AS table_name,
    p.polname AS policy_name,
    CASE p.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        WHEN '*' THEN 'ALL'
    END AS command,
    pg_get_expr(p.qual, p.polrelid) AS using_expression
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
      'profiles', 'donors', 'ngos', 'food_listings',
      'ngo_claims', 'deliveries', 'impact_metrics'
  )
ORDER BY c.relname, p.polname;

-- ── 4. Security-definer functions (should NOT be executable by anon/auth) ──
SELECT
    p.proname AS function_name,
    l.lanname AS language,
    p.prosecdef AS is_security_definer,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;

-- ── 5. Realtime publication membership ──
-- Only 'deliveries' should be in the realtime publication for this app.
SELECT
    schemaname AS schema,
    tablename AS table_name
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ── 6. delivery_collection_secrets access grants ──
-- Should have ALL revoked from anon and authenticated, granted to service_role only.
SELECT
    grantee,
    string_agg(privilege_type, ', ') AS privileges
FROM information_schema.role_table_grants
WHERE table_name = 'delivery_collection_secrets'
  AND table_schema = 'public'
GROUP BY grantee
ORDER BY grantee;
