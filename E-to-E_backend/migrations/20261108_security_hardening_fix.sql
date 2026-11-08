-- =============================================================================
-- 20261108_security_hardening_fix.sql
-- Extra-to-Essential — Clean up redundant deliveries RLS policies
-- =============================================================================
-- The 20261106_live_donation_tracking migration created
-- "delivery_tracking_participant_read" and the 20261107_security_hardening
-- migration created "deliveries_select_participants". Both are participant-
-- only SELECT policies and are OR'd together by PostgreSQL (functionally
-- harmless but redundant). This migration drops the older one so only a
-- single, authoritative participant policy remains.
--
-- Safe to re-run: every statement is idempotent.
-- =============================================================================

BEGIN;

-- Drop the older redundant policy from the live-tracking migration.
-- The 20261107 migration's "deliveries_select_participants" is the
-- authoritative participant-only SELECT policy and remains in place.
DROP POLICY IF EXISTS "delivery_tracking_participant_read" ON public.deliveries;

COMMIT;

-- Verification: after running, there should be exactly one SELECT policy
-- on deliveries that is NOT the original "View assigned deliveries":
--   SELECT polname, polcmd, qual
--   FROM pg_policy
--   WHERE polrelid = 'public.deliveries'::regclass;
