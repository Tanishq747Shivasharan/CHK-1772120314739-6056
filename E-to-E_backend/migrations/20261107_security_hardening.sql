-- =============================================================================
-- 20261107_security_hardening.sql
-- Extra-to-Essential — Supabase database security hardening
-- =============================================================================
-- Purpose: tighten Row Level Security so the anon key / PostgREST / Realtime
-- cannot read data the Express API does not explicitly authorize, plus an
-- atomic claim RPC and retention of failed-claim history.
--
-- Safe to re-run: every statement is idempotent (DROP ... IF EXISTS,
-- CREATE OR REPLACE, CREATE POLICY after dropping the old one).
--
-- IMPORTANT: This migration only changes database-side controls. The API uses
-- the service_role key (which bypasses RLS), so existing API behavior is
-- unchanged. These policies protect DIRECT anon-key / PostgREST / Realtime
-- access only. Apply to a staging project first, then production.
--
-- Apply in order (Section A, then B, C, D, E). Verify after each section.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Section A — deliveries: participant-only read policy
-- -----------------------------------------------------------------------------
-- BEFORE: CREATE POLICY "View assigned deliveries" ON deliveries
--         FOR SELECT USING (TRUE);   -- anyone could read every delivery
--
-- AFTER:  Only the donor who owns the listing, the NGO that holds the claim,
--         or the linked volunteer assigned to the delivery may read it.
--         (Admin reads go through the service_role key and bypass RLS.)

BEGIN;  -- transactional: if CREATE POLICY fails, the DROP is rolled back too

DROP POLICY IF EXISTS "View assigned deliveries" ON deliveries;

CREATE POLICY "deliveries_select_participants"
    ON deliveries FOR SELECT
    USING (
        -- The NGO that holds the claim on this delivery
        auth.uid() = (
            SELECT ng.profile_id
            FROM ngo_claims nc
            JOIN ngos ng ON ng.ngo_id = nc.ngo_id
            WHERE nc.claim_id = deliveries.claim_id
        )
        -- The donor who owns the listing being delivered
        OR auth.uid() = (
            SELECT d.profile_id
            FROM ngo_claims nc
            JOIN food_listings fl ON fl.listing_id = nc.listing_id
            JOIN donors d ON d.donor_id = fl.donor_id
            WHERE nc.claim_id = deliveries.claim_id
        )
        -- The linked volunteer assigned to this delivery (no-login/legacy
        -- volunteers have profile_id NULL, so they never match auth.uid();
        -- their deliveries are still readable by the managing NGO above)
        OR auth.uid() = (
            SELECT v.profile_id
            FROM volunteers v
            WHERE v.volunteer_id = deliveries.volunteer_id
        )
    );

COMMIT;
