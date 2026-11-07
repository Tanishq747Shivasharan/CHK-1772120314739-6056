# Extra-to-Essential Security Audit and Hardening

**Assessment date:** 7 November 2026  
**Scope:** React/Vite client, Express API, Supabase database policies and RPC migrations, Socket.IO, and the application’s email/geocoding paths.

## Summary

The review found access-control gaps in live tracking and listings, an unauthenticated email test endpoint, user-controlled HTML rendering, unbounded API inputs, and claim/delivery state changes that were not sufficiently constrained. Code fixes and a new Supabase migration are prepared in this workspace.

**The database migration has not been applied.** Until `E-to-E_backend/migrations/20261107_security_hardening.sql` is reviewed and applied to the correct Supabase project, the deployed database may still have the previous permissive RLS policies and claim RPC. API-side fixes are present in the source, but database-side controls should be treated as pending.

The supplied master prompt ends mid-sentence in its file-upload section. No upload implementation or Supabase Storage integration was found in the repository; the `proof_image_url` field is only a URL reference. Storage bucket configuration and any external upload service therefore remain outside the verified scope.

## Findings and changes

| Severity | Finding | Change / state |
|---|---|---|
| High | Delivery tracking had a permissive read policy, which could expose volunteer locations and delivery details to unrelated users. | Added participant-only Supabase RLS for the donor, NGO, and assigned volunteer. The migration is pending deployment. |
| High | Open food listings were publicly readable with pickup locations; verified NGO directory policy exposed complete NGO rows. | Added authenticated, role- and verification-aware listing policies and removed the broad NGO directory policy. Backend listing and donor endpoints now restrict roles, ownership, and returned fields. Migration pending deployment. |
| High | The old claim RPC and API fallback could delete earlier claim records; the failure trigger also deleted claim history. Data-returning RPC functions were callable directly through PostgREST by default. | Removed the destructive fallback; added a row-locking claim RPC, retained failed/completed claim history with an active-claim index, and restricted data RPCs to `service_role` in the pending migration. Historical one-off scripts that could reset claims were made no-op deprecation files. |
| High | Listing, donor, delivery, and volunteer endpoints allowed broad reads or weak ownership checks in some paths. | Added role checks, ownership filters, verification checks, field allowlists, result limits, and safer state transitions. Volunteer assignment now reserves availability conditionally and cannot be changed after pickup starts. |
| High | User-provided names and listing text were interpolated into HTML in React. | Removed the HTML rendering sinks and render values as text. Email template substitutions are HTML-escaped. |
| Medium | `/test-email` could send email to arbitrary addresses without authentication. | Removed the endpoint. Email recipient and subject inputs are validated and bounded. |
| Medium | Socket.IO clients could request arbitrary rooms without proving identity. | The server now validates the Supabase bearer token and joins only that user’s private room. The client sends its bearer token and no longer requests a room. |
| Medium | Login, registration, refresh, API payloads, and geocoding were not sufficiently bounded. | Added process-local rate limits, a 64 KB JSON body cap, URL-encoded limits, input validation, and bounded geocoding parameters against a fixed Nominatim host. |
| Medium | New registrations accepted six-character passwords. | Raised the new-registration minimum to 12 characters in the API and localized signup UI. Existing users can still log in with their current passwords. |
| Medium | Delivery status updates could regress or bypass assignment and pickup verification checks. | Added conditional state transitions, server-controlled timestamps, assignment checks, and OTP-verification requirements for linked volunteers. |
| Low | The backend installed Node.js itself as an npm package despite running on a host Node runtime. | Removed the unused `node` package and lockfile entries. |

## Remaining risks and deployment work

1. **Apply and verify the database migration.** Review it against the deployed schema and migration role first. Then confirm the frontend’s Realtime subscriptions still receive only participant-authorized rows. This audit did not connect to Supabase or make production database changes.
2. **Email ownership and recovery are incomplete.** Registration sets `email_confirm: true`; no email-verification or password-reset route was found. Add a verified signup and recovery flow with the matching Supabase settings before relying on email as an ownership factor.
3. **Tokens are stored in browser local storage.** A successful XSS attack can read access and refresh tokens. Consider moving sessions to secure, HttpOnly cookies and adding CSRF protection as a separate auth architecture change.
4. **Rate limiting is process-local.** Multiple API workers do not share counters. The server does not trust proxy headers by default, which is safe against spoofing but can group users behind one reverse proxy. Configure trusted proxy hops and a shared limiter store for the production topology.
5. **Frontend security headers are hosting-dependent.** The API adds response headers, but the deployed static frontend host must separately set an appropriate Content-Security-Policy and related headers.
6. **Uploads were not implemented.** No upload route or Storage integration was found. If added, use private buckets, authorization policies, content-type and size checks, and malware scanning. Restrict `proof_image_url` to the approved storage origin before displaying externally supplied URLs.
7. **No live penetration or database policy tests were run.** There is no backend test script in the repository, and no production service was contacted.

## Verification

- Frontend production build: **passed**. Vite reports a JavaScript chunk over 500 KB; consider code splitting separately.
- Backend JavaScript syntax: **passed**, 22 files parsed.
- Rate limiter smoke check: **passed** for an allowed request followed by a 429 response with `Retry-After`.
- `npm audit` (backend and frontend, including development dependencies): **0 known vulnerabilities** at assessment time.
- Focused ESLint on changed frontend files: **passed**.
- Full frontend ESLint: **still fails** with 15 errors and 10 warnings in existing untouched files, including `Sidebar.jsx`, `AlertCenter.jsx`, `SystemLogs.jsx`, `AuthContext.jsx`, `i18n/config.js`, and `NotificationToast.jsx`.
- `git diff --check`: **passed**.
- Supabase migration: **not executed**; no database connection was used.
