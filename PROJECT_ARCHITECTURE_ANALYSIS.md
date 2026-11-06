# Extra-to-Essential architecture and tracking upgrade

## Existing architecture

- **Frontend:** React 19 + Vite, React Router, Leaflet/React-Leaflet, GSAP, and a small fetch-based API layer. Donor pages live under `src/DonorDashboard`; NGO operations live under `src/modules/NGODashboard`. The donor dashboard already contains a Leaflet map, but it currently plots listing and donor-profile coordinates rather than live delivery locations.
- **Backend:** Express 5 on Node, with route modules under `E-to-E_backend/routes`, authentication middleware that validates Supabase access tokens, and services for notifications, geographic matching, volunteer lookup, email, and impact calculations.
- **Persistence and authentication:** Supabase Auth/Postgres. The backend uses the service-role client for database access. The frontend has an anon-key Supabase client and a Supabase Realtime dependency, although existing dashboard data is primarily fetched through the Express API. The checked-in base schema and migration scripts are under `E-to-E_backend/migrations`; the live Supabase project was not inspected.
- **Map and styling:** Leaflet 1.9 with OpenStreetMap tiles. The design system uses Inter and Playfair Display with the `tundora` (`#443c3c`), `swiss-coffee` (`#d4ccca`), and pale-sky palette in `src/styles/global.css`.

## Existing data relationships and workflow

`profiles` is the authenticated user record. `donors.profile_id` and `ngos.profile_id` connect donor and NGO records to it. `food_listings.donor_id` owns a donation. An NGO's `ngo_claims` row connects `listing_id` to `ngo_id`; `deliveries.claim_id` connects a claim to an optional `volunteer_id`. In `01_Schema.sql`, volunteers have no login link, and `user_role` contains only donor, NGO, and admin. The later `05_migration_org_name_nullable.sql` mentions volunteer profiles but does not add the enum value or volunteer account column; the tracking migration adds both.

The checked-in `02_triggers.sql` already changes volunteer availability on delivery status changes, updates listing status, creates impact records, and maintains `updated_at`. The base schema also defines a quoted delivery SELECT policy, `"View assigned deliveries"`, with `USING (TRUE)`. Because PostgreSQL combines permissive policies with OR, the tracking migration drops that broad policy and replaces it with a participant check for donor, owning NGO, or assigned volunteer.

Donors create listings through `POST /api/listings`. NGO approval/claiming happens through `POST /api/claims` (using the `claim_listing` RPC when available). Before this upgrade, the claim handler auto-selected the first available volunteer. NGOs can also manage volunteers, assign deliveries, and update delivery status. The legacy completion path sets a delivery to `delivered` and calls `impactService.processCompletedDelivery`; that service keeps the existing impact-points formula and carbon-credit minting behavior.

## Implemented in this change

- Preserve NGO claim approval, but leave the resulting delivery open for an eligible volunteer to accept.
- Add a Supabase migration for the volunteer role and account link, GPS fields, protected OTP hashes and an encrypted donor-display copy, indexes, and atomic accept/verify/resend functions. Its participant-only delivery policy replaces the checked-in `USING (TRUE)` policy.
- Add authenticated volunteer endpoints for approved pickups, atomic acceptance and pre-collection cancellation, throttled GPS updates, immediate location clearing when availability sharing stops, and six-digit OTP verification. Cancelling releases the pickup to the available queue, invalidates its old code, and restores volunteer availability. NGO volunteer management can link an existing volunteer login by email.
- Add a volunteer dashboard with an opt-in availability location share, accepted pickup tracking, GPS permission/error handling, and OTP entry.
- Add a donor delivery feed. The existing Leaflet experience now shows the approved pickup, recently shared available volunteer locations, assigned volunteer location and freshness, route/ETA, pickup progress, and the current six-digit code for the owning donor with a copy action. The volunteer dashboard uses the dark-brown `E` mark from the supplied logo reference and shows the linked volunteer name and NGO. Supabase Realtime updates active delivery rows; the dashboard refreshes candidate locations every 30 seconds.
- Keep existing NGO completion and impact processing. Newly tracked deliveries cannot move to `in_transit` or `delivered` until the assigned volunteer verifies the collection code. The status transition is conditional so only the first completion request triggers existing impact processing.

## Important setup and repository limits

- The migration is prepared but has not been applied. When ready to enable the workflow, apply `E-to-E_backend/migrations/20261106_live_donation_tracking.sql` after the checked-in base schema and existing migrations. The live Supabase project was not inspected, so confirm it matches those scripts before applying.
- Volunteer acceptance requires an existing `volunteer` account linked to its NGO volunteer row. In NGO Volunteer Management, add the account email or edit an existing volunteer to link it. Old contact-only volunteer rows remain intact but cannot sign in or share GPS until linked.
- The backend needs `OTP_HASH_SECRET` set to a random secret of at least 32 characters. OTPs are scrypt-hashed and AES-GCM encrypted with separate derived keys, expire after 10 minutes, allow five attempts, and are emailed to the donor. The hash and encrypted donor-display copy live outside Realtime-visible delivery rows; only the authenticated owner receives the decrypted code through the donor API.
- Browser location sharing requires HTTPS in production and volunteer consent. Available volunteer coordinates are shown to the donor who owns the NGO-approved donation only while they are marked available and their GPS update is under five minutes old. Assigned locations are marked stale after 90 seconds.
- `VITE_ROUTING_URL` can point to an OSRM-compatible route endpoint; the default is the public OSRM demo service. `VITE_MAP_TILE_URL` optionally overrides the existing OpenStreetMap tile template. Both remain Leaflet-compatible.
- Supabase Realtime requires the `deliveries` table in the `supabase_realtime` publication. The migration adds it where permitted; if the database role cannot update publications, add it through Supabase configuration. The frontend subscribes with the authenticated Supabase token, and the replacement RLS policy limits tracking-row reads to donors, assigned volunteers, and the owning NGO.
- No profile-picture field or image flow exists in the repository, so volunteer markers use initials rather than fabricated photos.
- If the migration reports duplicate volunteer profile links, resolve those duplicate links before using volunteer dashboards; it preserves the existing volunteer rows and does not delete them.
- Existing SMTP variables (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`) must be configured to deliver collection codes.
- **Build:** `npm run build` succeeds (Vite transforms 1,954 modules). The main minified JavaScript chunk is about 1.07 MB and triggers Vite's existing 500 KB chunk-size warning.
- **Lint:** Focused ESLint on the new tracking components and changed UI files passes. `AuthContext.jsx` still reports its existing React Fast Refresh export error and two hook dependency warnings. Full `npm run lint` reports 45 errors and 27 warnings across the repository, mostly in unrelated existing files.
- **Backend syntax:** `node --check` passes for all changed backend route, middleware, email, and tracking service files.
- **Diff check:** `git diff --check` passes. No Supabase-backed end-to-end flow was run because no live database connection was available. Existing migration files were reviewed and left unchanged; no SQL was executed against Supabase.
