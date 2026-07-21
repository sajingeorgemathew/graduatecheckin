# Graduation Check-In

Secure ticket management and fast event check-in for graduates and registered guests of the Toronto Academy of Education.

## Purpose

This application manages graduation event ticketing and on-site check-in. It will generate secure QR tickets for graduates and their registered guests and provide a fast scanner workflow for event staff.

## Technology Stack

- Next.js (App Router) with TypeScript in strict mode
- Tailwind CSS
- Supabase (`@supabase/supabase-js` and `@supabase/ssr`)
- Zod for environment and data validation
- Vitest for automated tests
- lucide-react for icons

## Local Installation

1. Install Node.js 20 or newer and npm.
2. Clone the repository and install dependencies:

   ```powershell
   git clone https://github.com/sajingeorgemathew/graduatecheckin.git
   cd graduatecheckin
   npm install
   ```

3. Copy the environment template and fill in values:

   ```powershell
   Copy-Item .env.example .env.local
   ```

## Required Environment Variables

| Variable | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public | Base URL of the application. |
| `APP_ENV` | Server | `development`, `test` or `production`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL. Pending setup. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Supabase publishable key. Pending setup. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server secret | Supabase service-role key. Server-only. Never expose to the browser. |
| `TICKET_TOKEN_SECRET` | Server secret | Random secret used to sign ticket tokens. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. At least 32 bytes of entropy are required. |
| `TICKET_DISTRIBUTION_SECRET` | Server secret | CHECKIN-09B row-signing secret for ticket-distribution delivery rows. Server-only, minimum 32 random bytes, and **must be different from `TICKET_TOKEN_SECRET`**. Generate with `openssl rand -base64 32`. Set it in `.env.local` and in the Vercel server environment. Never use the `NEXT_PUBLIC_` prefix and never commit the value. |
| `ACTIVE_GRADUATION_EVENT_CODE` | Server | Event code that Excel imports and ticket operations target. Local development uses `GRAD-2026-DEV`. Never exposed as a `NEXT_PUBLIC_` variable and never accepted from the browser. |
| `ALLOW_DESTRUCTIVE_DEV_RESET` | Server | Must stay `false` except while intentionally running a development reset. |
| `DEV_RESET_CONFIRMATION` | Server | Must stay empty except while intentionally running a development reset. |
| `MOCK_EVENT_CODE` | Server | Fixed to `GRAD-2026-DEV`. The reset tooling refuses any other value. |

The application builds and runs before the Supabase values are added. Supabase-dependent features raise clear errors until configuration is complete.

`ENABLE_DEV_IMPORTS` was removed in CHECKIN-04. Excel imports now require an authenticated administrator in every environment and no development flag exists. No new environment variable is required for staff authentication.

## Development Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Create a production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run the TypeScript compiler with no output. |
| `npm run test` | Run the Vitest suite once. |
| `npm run test:watch` | Run tests in watch mode. |
| `npm run auth:verify-admin` | Read-only check that an active administrator exists. Prints counts and masked emails only and exits nonzero when none exist. |
| `npm run tickets:verify-config` | Read-only check of the ticket configuration: active event code, ticket-secret validity, a one-way secret fingerprint and eligibility counts only. Never prints the secret, names, emails, phones or tokens. Exits nonzero on unsafe configuration. |
| `npm run scanner:verify-config` | Read-only check of the scanner configuration: active event, ticket secret, Supabase server credentials, ticket status counts and whether the scan-attempt table is deployed. Prints no names, codes, UUIDs, tokens, hashes or contact information. Exits nonzero on unsafe configuration. |
| `npm run checkin:verify-config` | Read-only check of the check-in configuration: Supabase server credentials, active event, whether the CHECKIN-06 scan-attempt table and the CHECKIN-07 `apply_graduation_checkin` function are deployed and registration-level check-in counts only. Prints no names, codes, UUIDs, tokens, hashes or contact information. Exits nonzero on unsafe configuration. |

## Supabase CLI and Database

The Supabase CLI is installed as a project development dependency. Run it
with `npx supabase <command>`. The repository is initialized with
`supabase/config.toml`. Do not link or push to a remote project until a
dedicated development project is ready.

- Migrations live in `supabase/migrations/`. The initial check-in schema is
  `supabase/migrations/*_create_graduation_checkin_schema.sql`.
- The generated development seed lives in `supabase/seed.sql`. It contains
  fictional data only and is regenerated, never edited by hand.
- Database TypeScript types live in `src/types/database.ts`. After the
  migration is deployed to a linked Supabase project, regenerate them with
  the Supabase CLI type generator so they always match the live schema.

### Local Supabase commands (require Docker)

| Command | Description |
| --- | --- |
| `npm run supabase:start` | Start the local Supabase stack. |
| `npm run supabase:stop` | Stop the local Supabase stack. |
| `npm run supabase:status` | Show local stack status. |
| `npm run supabase:reset` | Recreate the local database from migrations and seed. |

### Mock-data commands

| Command | Description |
| --- | --- |
| `npm run db:generate:seed` | Regenerate `supabase/seed.sql` from `scripts/mock-data/fixtures.ts`. |
| `npm run db:generate:mock-import` | Generate the fictional import workbook at `tmp/mock-registration-import.xlsx` for import testing. |
| `npm run db:validate:mock` | Validate that the fixtures are fictional, consistent and complete. |
| `npm run db:seed:mock` | Idempotently upsert the mock event, 20 registrations and guests into the configured database. |
| `npm run db:reset:mock` | Guarded destructive reset: delete the `GRAD-2026-DEV` test event (cascades) and reseed. |
| `npm run db:reset:mock-checkins` | Guarded destructive reset of check-in rows for the test event only. |

All mock data is visibly fictional: `Test Graduate 001` style names,
`example.com` emails, `416555` test phone numbers and `MOCK-` source IDs.
Every mock record is marked `is_test: true`.

### Reset safeguards

```text
Never enable destructive reset variables in a production environment.
```

The destructive commands refuse to run unless every guard passes, and they
can only target the fictional `GRAD-2026-DEV` event after verifying in the
database that it is marked `is_test: true`. There is no delete-all command,
no arbitrary event reset and no production reset command.

To run a development reset, set exactly this configuration in `.env.local`:

```env
APP_ENV=development
ALLOW_DESTRUCTIVE_DEV_RESET=true
DEV_RESET_CONFIRMATION=RESET_GRADUATION_CHECKIN_DEV_DATA
MOCK_EVENT_CODE=GRAD-2026-DEV
```

Return the flags to their safe values immediately after reset testing:

```env
ALLOW_DESTRUCTIVE_DEV_RESET=false
DEV_RESET_CONFIRMATION=
```

Further detail: `docs/database/checkin-schema.md` and
`docs/database/registration-import-mapping.md`.

## Excel Registration Import (CHECKIN-03, protected by CHECKIN-04)

The application imports registration workbooks through a reviewed,
administrator-only workflow.

### Administrator access rule

The import pages under `/admin/imports` and every import API route require
an authenticated, active administrator in development, preview and
production. Anonymous users receive 401 responses, scanners and
supervisors receive 403 responses, and no spreadsheet parsing occurs for
unauthorized requests. The former `ENABLE_DEV_IMPORTS` development flag
has been removed; no development feature flag is required or honored.

The import target event comes from the server-only
`ACTIVE_GRADUATION_EVENT_CODE` variable (CHECKIN-05). Imports and ticket
operations always resolve the same configured event server-side, and
closed or archived events are rejected. Event codes are never accepted
from the browser. When the real graduation event is ready, change the
configuration value instead of the code.

### Import architecture

Logic lives in feature modules under `src/features/imports/`:

| Module | Responsibility |
| --- | --- |
| `constants.ts` | Expected headers, size limits, fixed event code. |
| `access.ts` | Administrator authorization rule for imports. |
| `workbook-parser.ts` | In-memory XLSX reading and file validation. |
| `header-mapper.ts` | Header matching and worksheet selection. |
| `normalizers.ts` | Strict per-cell normalization. |
| `validators.ts` | Row and workbook validation. |
| `comparison.ts` | New, update, unchanged and missing-row comparison. |
| `repository.ts` | Service-role database access. |
| `service.ts` | Upload, preview, row toggling and cancel workflows. |
| `apply.ts` | Confirmation and atomic apply invocation. |
| `summaries.ts` | Counts, snapshots and display masking. |

Route handlers in `src/app/api/admin/imports/` stay thin and delegate to
these modules. Import responses use `no-store` caching and structured
errors without stack traces.

### Expected Excel headers

The importer recognizes exactly these source headers, matched by trimmed
name and never by column position:

```text
order_id, order_date, status, Email, Full Name, Graduation Gown Size,
Name Pronunciation, Phone Number, Guest 1, Guest 2, Kids (0 to 4),
Kids (4 to 10), fee_total, fee_tax_total, tax_total, order_total
```

Only `.xlsx` files up to 10 MB are accepted. The first worksheet containing
all required headers is selected. Unexpected columns are reported as
notices and ignored. The source column `Kids (4 to 10)` is normalized into
the approved `children aged 5 to 10` category, and an import notice
explains this.

### Preview workflow

1. Upload a workbook at `/admin/imports/new`. The file is hashed
   (SHA-256), parsed entirely in memory and never retained. Only the
   filename, size and hash are stored.
2. Every row is normalized and validated. Each row receives one result:
   new, update, unchanged, warning, error or excluded.
3. The preview at `/admin/imports/[importId]` shows summary cards,
   filters, a paginated table (25 rows per page) with masked phone
   numbers, expandable row details, and existing registrations that are
   missing from the upload.
4. Rows with errors are automatically excluded and cannot be applied.
   Warning rows stay included unless explicitly excluded. Rows can be
   excluded and re-included before applying.
5. Applying requires typing the confirmation text `APPLY IMPORT`. The
   apply button prevents double submission and uses an idempotency key.

### Safe upsert behavior

Applying an import runs the atomic database function
`public.apply_registration_import`, which:

- Matches existing registrations by event, source system and source
  registration ID (the `order_id`). Name and email are never identifiers.
- Preserves existing registration UUIDs, tickets and check-in history.
- Updates only approved registration fields and replaces the optional
  adult guest-name rows with the imported values.
- Never deletes registrations or events and never creates tickets or
  check-ins.
- Marks the import applied. An applied import cannot be edited or
  reapplied.

### Duplicate file protection

The SHA-256 hash is calculated before parsing. If an identical file has
already been applied to the same event, the new attempt is recorded as a
duplicate, the previous application date and summary are shown and no
registration changes occur. Uploading a changed workbook with a different
hash remains allowed.

### Missing-row behavior

Existing registrations absent from the latest upload are listed as
"Missing from uploaded file" with a count. They are never deleted,
cancelled or changed and tickets are never revoked. No automatic action
occurs.

### Mock workbook generation

`npm run db:generate:mock-import` writes a fictional workbook to
`tmp/mock-registration-import.xlsx` with 27 rows covering valid rows,
update and unchanged candidates, failed status, missing email, invalid
phone, duplicate emails, a duplicate order ID, child count scenarios, a
tax mismatch, an unknown status, a multi-name guest cell and an extra
unexpected column. The `tmp/` folder is ignored by Git and generated
workbooks must never be committed.

### Manual migration deployment

The import schema lives in
`supabase/migrations/*_create_registration_import_pipeline.sql`. It has
not been pushed automatically. Deploy it manually when ready, for example
with `npx supabase db push` against the linked project, after reviewing
the migration. The migration only adds new objects and does not modify the
applied CHECKIN-02 schema.

## Staff Authentication and Access Roles (CHECKIN-04)

### Authentication architecture

- Supabase email and password authentication with cookie-based sessions
  through `@supabase/ssr`.
- `src/proxy.ts` uses the Next.js 16 Proxy convention. It refreshes
  Supabase authentication cookies, redirects unauthenticated visitors of
  `/staff` and `/admin` pages to `/login` with a safe relative `next` path
  and bounces already authenticated users away from `/login`. The Proxy is
  a convenience layer only; it never performs final role authorization and
  never queries registration data.
- Every protected page, server action and route handler independently
  verifies the caller with `auth.getUser()` on the server, loads the staff
  profile with trusted server-only credentials and checks the required
  role. Guards live in `src/features/auth/guards.ts`. Roles are never
  accepted from forms, query parameters, headers or browser state.
- Public signup does not exist and must remain disabled. There is no
  `/signup` route, no magic links, no social login and no email-based
  password recovery in this ticket.

### Staff roles

| Role | Access |
| --- | --- |
| `scanner` | `/staff`. Future: QR scanning and standard check-in. |
| `supervisor` | `/staff`. Future: scanner functions plus corrections and dashboard. |
| `administrator` | `/staff`, `/admin`, `/admin/imports`, `/admin/staff`. Full staff management and imports. |

The hierarchy is an explicit ranking (`scanner` < `supervisor` <
`administrator`) defined in `src/features/auth/constants.ts`. Roles are
never compared alphabetically.

### Route authorization matrix

| Route | Required role |
| --- | --- |
| `/login`, `/access-denied`, `/` | Public |
| `/staff`, `/staff/change-password` | Any active staff role |
| `/admin`, `/admin/imports`, `/admin/imports/new`, `/admin/imports/[importId]`, `/admin/staff`, `/admin/staff/new` | `administrator` |
| `/api/admin/imports` and every import mutation | `administrator` |
| `/api/admin/staff` and every staff mutation | `administrator` |
| `/admin/tickets`, `/admin/tickets/generate`, `/admin/tickets/[ticketId]` | `administrator` |
| `/api/admin/tickets/*` including QR rendering and every ticket mutation | `administrator` |
| `POST /auth/signout` | Authenticated |

Failures use 401 (no valid authentication), 403 (authenticated but
insufficient or inactive), 404 (hidden resources), 409 (conflicting staff
state) and 422 (validation problems). Login failures always show one
generic message so the existence of a staff email is never revealed.

### Temporary password flow

Administrators create staff accounts at `/admin/staff/new` with an email,
display name and role. The server generates a cryptographically secure
temporary password (crypto-grade randomness, policy compliant), creates
the Supabase Auth user with a confirmed email, creates the staff profile
with `must_change_password = true` and shows the temporary password
exactly once with a copy control. The password is never stored, logged,
audited, emailed or placed in a URL. If profile creation fails, the new
Auth user is deleted so no unapproved account remains. No SMTP or email
delivery is required for account creation.

### Required password-change flow

Signing in with `must_change_password = true` redirects to
`/staff/change-password` and other protected pages stay blocked until the
change completes. The change form requires the current password
(reauthentication), applies the password policy (at least 12 characters,
at most 128, with uppercase, lowercase, number and symbol, no surrounding
whitespace, confirmation must match), updates the Supabase Auth password,
clears the flag and writes a `password_changed` audit event without any
password material.

### Staff management

`/admin/staff` lists staff with filters (all, active, inactive, scanner,
supervisor, administrator), pagination, a desktop table and mobile cards.
Administrators can change roles, deactivate, reactivate and reset a
temporary password. Deactivated staff are blocked on their next protected
request; their Auth user and audit history are never deleted. Safeguards:
self-deactivation and self-demotion are blocked, and the final active
administrator can never be demoted or deactivated. The safeguard runs in
the database function `public.apply_staff_access_change`, which locks the
active administrator rows so concurrent requests cannot bypass it. Staff
deletion is intentionally out of scope.

### Initial administrator setup

The application never promotes a user automatically and has no bootstrap
endpoint. Create the first administrator once, manually:

1. In the Supabase Dashboard open Authentication, then Users, and choose
   Add user. Enter the administrator's email and a strong temporary
   password and mark the email confirmed.
2. Copy the new user's UUID.
3. In the SQL editor insert the staff profile (replace the placeholders):

   ```sql
   insert into public.staff_profiles
     (user_id, display_name, role, is_active, email_snapshot, must_change_password)
   values
     ('THE-AUTH-USER-UUID', 'Administrator Name', 'administrator', true,
      'admin.email@example.com', true);
   ```

4. Verify with `npm run auth:verify-admin`. The script is read-only,
   prints counts and masked emails only and exits nonzero while no active
   administrator exists.
5. Sign in at `/login` and complete the required password change.

### Supabase Dashboard configuration

- Authentication provider: email authentication must remain enabled.
- Public signup: disable public email signup (Authentication, then
  Sign In / Up settings).
- Site URL: set to the production Vercel domain.
- Redirect URLs: include `http://localhost:3000/**` and
  `https://YOUR-PRODUCTION-DOMAIN/**`. This ticket sends no emails, but
  correct values are required for any future email-based flows.

### Production Vercel behavior

No new environment variable is required for CHECKIN-04. The same
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `TICKET_TOKEN_SECRET` values apply.
Imports and staff management are available to authenticated
administrators in production and denied to everyone else.

### Audit logging

Staff-account administration writes append-oriented rows to
`public.staff_access_audit_log` (actions: `staff_created`, `role_changed`,
`staff_activated`, `staff_deactivated`, `temporary_password_reset`,
`password_changed`, `login_blocked`). The JSON value columns contain
profile fields only; passwords, tokens and cookies are rejected by a
defensive check before writing. The table has RLS enabled with no
policies and all `anon` and `authenticated` privileges revoked, so it is
reachable only through trusted server-side code.

### Security limitations

- No multifactor authentication or passkeys yet.
- No self-service password recovery; an administrator must reset a
  temporary password.
- Deactivation blocks the next protected request; it does not force-expire
  an already issued Supabase session token before its refresh.
- Rate limiting relies on Supabase Auth defaults.

## Secure Ticket Generation (CHECKIN-05)

```text
Never change TICKET_TOKEN_SECRET after tickets have been issued unless
every existing ticket will be replaced.

Never expose raw ticket tokens in logs, URLs, database records or
analytics.
```

### Ticket-token architecture

- Each ticket QR token has the versioned structure
  `v1.<ticket-id>.<signature>`. The signature is an HMAC SHA-256 over the
  version and the ticket UUID, encoded as Base64URL. The signing key is
  derived from `TICKET_TOKEN_SECRET` with HKDF.
- Raw tokens are never stored. Because the token depends only on the
  ticket UUID and the server secret, the server reconstructs the exact
  token on demand (for QR rendering) and discards it immediately.
  Signature verification uses constant-time comparison.
- Only the SHA-256 hash of the token (64 lowercase hexadecimal
  characters) is stored in `graduation_tickets.token_hash`, enforced by a
  database format constraint. The CHECKIN-06 scanner will hash a scanned
  token and compare hashes; the database never sees a raw token.
- Changing `TICKET_TOKEN_SECRET` invalidates every issued QR ticket. The
  secret is never regenerated or rotated automatically.

### QR payload format

The QR code contains exactly `TAE-GRAD1:` followed by the raw token, for
example `TAE-GRAD1:v1.<ticket-id>.<signature>`. It is not an HTTP URL and
contains no name, email, phone number, guest detail or payment data. The
versioned prefix lets the CHECKIN-06 scanner reject unrelated QR codes
before token verification. QR images are rendered server-side only, by
the administrator-protected route
`GET /api/admin/tickets/[ticketId]/qr`, with `private, no-store` caching.
The route URL contains only the ticket UUID, never a token.

### Human-readable backup codes

Each ticket also receives a unique code such as `GR26-ABCD-EFGH`,
generated from cryptographically secure randomness with ambiguous
characters (0, O, 1, I, L) excluded. Codes are never derived from student
information, are unique in the database and exist as a manual staff
fallback only; they never replace secure QR-token validation.

### Bulk generation, replacement and revocation

- `/admin/tickets` shows summary cards and a searchable, paginated,
  registration-centric ticket table (25 rows per page, desktop table and
  mobile cards). Search covers graduate name, ticket code and source
  registration ID only.
- `/admin/tickets/generate` previews eligible registrations without
  active tickets, supports select-all and individual selection, requires
  the exact confirmation text `GENERATE TICKETS` and a server-issued
  idempotency key, and calls the atomic database function
  `public.apply_ticket_generation_batch`. Double submission returns the
  previous batch result instead of generating twice. Tickets are only
  generated for `eligible` registrations of the configured event that do
  not already hold an active ticket.
- `/admin/tickets/[ticketId]` shows the digital ticket preview, issue
  details, the activity timeline and the Replace Ticket and Revoke
  Ticket actions (exact confirmations `REPLACE TICKET` and
  `REVOKE TICKET`, each with a required 5 to 500 character reason).
  Replacement issues a completely new ticket UUID, code and token via
  `public.replace_graduation_ticket`; the old QR can never validate
  again. Revocation via `public.revoke_graduation_ticket` invalidates a
  ticket without generating a replacement.
- Every ticket action writes an append-oriented row to
  `public.ticket_activity_log` with the acting administrator, timestamp,
  reason and an opaque request ID. Raw tokens, token hashes and contact
  details are never audited.
- All ticket pages and mutations independently require an active
  administrator server-side. Scanners, supervisors, anonymous callers and
  inactive staff are denied; staff requiring a password change are
  redirected to the password-change flow.

### Ticket-design privacy

The digital ticket shows the graduate name, event date, venue, registered
party counts, ticket code and QR only. Emails, phone numbers, source
order IDs, guest names, payment data, database UUIDs, token hashes and
raw tokens are never displayed. Revoked and replaced tickets render with
a large watermark and their QR is only available as an explicitly
watermarked historical preview.

### Print-preview limitations

The ticket detail page includes print CSS so the ticket preview prints
cleanly from the browser (navigation hidden, ticket kept on one page).
This is a convenience only; CHECKIN-09 creates the controlled PDF files
and email distribution. No PDF or ticket email exists in CHECKIN-05.

### Dependencies on later tickets

- CHECKIN-06 adds the staff scanner that reads the `TAE-GRAD1:` payload
  and validates token hashes. See the CHECKIN-06 section below.
- CHECKIN-09 adds PDF generation and email delivery of tickets.

### Manual deployment steps

- The migration
  `supabase/migrations/*_extend_secure_ticket_generation.sql` awaits
  manual review and deployment (for example `npx supabase db push`
  against the linked project). It only adds new objects and constraints
  and never modifies previously deployed migrations.
- Vercel requires the existing variables plus
  `ACTIVE_GRADUATION_EVENT_CODE`. No other new variable is needed.

## Mobile Staff Scanner and Secure Ticket Validation (CHECKIN-06)

CHECKIN-06 adds the mobile staff scanner at `/staff/scanner` and the
server-side ticket validation API. It validates tickets only.

Ticket validation is not the same as recording attendance. The scanner
verifies a ticket and shows the registration's current attendance state;
admission confirmation (the Confirm Arrival action) is added in CHECKIN-07
and described in the CHECKIN-07 section below.

### Mobile scanner architecture

- `/staff/scanner` is a server-guarded page available to scanner,
  supervisor and administrator roles. The page itself renders no camera
  code; all camera work happens in Client Components.
- `src/features/scanner/` holds the feature: pure validation, attendance
  and replacement-chain modules, a server-only repository and service,
  and the camera components.
- `POST /api/staff/scanner/validate` performs every validation
  server-side. The browser never decides whether a ticket is valid and
  never receives token hashes or raw tokens.
- `@zxing/browser` provides QR decoding and is imported only by the
  camera Client Component. `BrowserQRCodeReader` decodes QR codes only.

### Camera permission behavior

- The camera never starts during server rendering or on page load. It
  starts only after staff press Start Camera, which triggers the browser
  permission prompt.
- The rear-facing camera is preferred (`facingMode: environment`) and a
  camera selector plus a Switch Camera control appear when the device
  has more than one camera.
- Media tracks are stopped when scanning pauses, when the camera is
  stopped or switched and when the page unmounts. The camera is never
  left active in the background.
- Permission denial, missing cameras, camera-in-use conflicts and
  insecure contexts show clear staff-facing messages with the manual
  code entry as fallback.
- Camera access requires a secure context (HTTPS or localhost). On plain
  HTTP the scanner explains the problem and manual entry still works.

### QR validation sequence

For each QR scan the server: authorizes the staff user, applies rate
limiting, resolves the configured `ACTIVE_GRADUATION_EVENT_CODE` event,
parses the `TAE-GRAD1:` prefix, verifies the HMAC token signature,
validates the embedded ticket UUID, computes the SHA-256 token hash,
loads the ticket, compares the computed hash against the stored hash
with a constant-time comparison, verifies the ticket and registration
belong to the configured event, evaluates ticket and registration
status, calculates registration-level attendance, records a
privacy-safe scan attempt and returns a safe result. A correctly signed
token with a mismatched stored hash is rejected as a generic invalid
ticket; responses never reveal which verification step failed.

### Manual-code fallback

Staff can type the printed ticket code (for example `GR26-ABCD-EFGH`)
when a QR code is damaged or the camera is unavailable. Codes are
normalized to uppercase, trimmed and must match the exact format before
any lookup. The lookup is exact only: no partial matching, no broad
search and no similar-code suggestions. Validation then continues with
the same ticket, event, registration and attendance checks.

### Ticket-status results

- Active tickets continue to registration and attendance validation.
- Revoked tickets return `revoked` with a clear do-not-admit message.
- Replaced tickets return `replaced`, mark the old ticket invalid and
  show the latest replacement ticket code when it can be resolved.
- Pending tickets return `pending`; they are not ready for admission.
- Unknown tickets, bad prefixes, bad signatures and hash mismatches all
  return the same generic `invalid` result.
- Tickets from another event return `wrong_event` without revealing
  details from the other event.
- Non-eligible registrations return `registration_blocked`.

### Replacement-chain handling

When an old replaced ticket is scanned, the server follows
`replaced_by_ticket_id` to the newest ticket, with a maximum depth of
ten and cycle detection, and returns only the latest ticket code and
status. Broken, cyclic or cross-registration chains fall back to a
generic replaced-ticket message. Resolution never reactivates the old
ticket and never exposes tokens or hashes.

### Registration-level attendance behavior

Attendance belongs to the registration. Replacing a ticket does not
reset previous check-in activity.

The scanner sums the delta columns of every `graduation_checkins` row of
the registration (admissions, corrections and reversals), clamps the
totals between zero and the registered allowance and reports:

- `valid` when no attendance is recorded,
- `partially_checked_in` when part of the party has been admitted,
- `already_checked_in` when the graduate and full party were admitted.

Because attendance is keyed by registration, scanning a replacement
ticket after the old ticket was used still shows the existing
attendance. CHECKIN-06 never inserts, reverses or modifies check-in
rows.

### Scan-attempt audit privacy

Every server validation response records one row in
`ticket_scan_attempts`: staff user, event, matched ticket and
registration when available, method, result, status snapshots, clamped
attendance-count snapshots, time and the client request UUID (unique
per staff user, which keeps retried requests idempotent). The table
never stores QR payloads, raw tokens, token hashes, ticket codes,
graduate names, emails, phones, guest names or payment information. A
scan attempt is not an admission record. Retention should be reviewed
after the event; no automatic deletion job exists in this ticket.

### Server-side rate limiting

Each staff user may make 60 validation requests per rolling minute,
counted from `ticket_scan_attempts` by the authenticated user, never by
client IP. Excess requests receive HTTP 429 and a `rate_limited`
attempt is recorded without any scanned data. This limit is independent
of the client-side duplicate suppression, which pauses decoding after
each result and requires Scan Another Ticket before resuming.

### CHECKIN-07 separation

CHECKIN-06 contains no admission action: no Confirm Check-In button, no
graduate, guest or child admission, no partial-arrival submission, no
reversal and no attendance dashboard. The scanner page states that it
validates tickets only.

### Manual migration deployment (CHECKIN-06)

The migration `supabase/migrations/*_create_ticket_scan_validation_audit.sql`
awaits manual review and deployment (for example `npx supabase db push`
against the linked project). It only adds the two scanner enums and the
`ticket_scan_attempts` table with RLS enabled and anon and authenticated
privileges revoked. `npm run scanner:verify-config` safely reports the
table as missing until the migration is deployed. No new Vercel
environment variable is required.

### Testing the scanner

- `npm run test` covers camera-controller behavior, QR and manual-code
  validation, ticket and registration status handling, replacement
  chains, attendance calculation, authorization, rate limiting, audit
  privacy and migration safety with fictional data only.
- Manual browser testing requires a signed-in staff account, a deployed
  CHECKIN-06 migration and a phone or laptop camera on HTTPS or
  localhost. Generate test tickets in Ticket Management, open
  `/staff/scanner`, press Start Camera and scan a ticket QR shown on
  another screen, or type its backup code.

## Graduate and Guest Arrival Check-In (CHECKIN-07)

CHECKIN-07 adds the arrival-confirmation workflow. After a valid or partial
scan on `/staff/scanner`, staff confirm who is arriving now and the server
records an append-only attendance entry.

### Attendance belongs to the registration

Attendance belongs to the registration. Replacing a ticket does not reset
or duplicate attendance. Every current total is recomputed across all
`graduation_checkins` rows of the registration inside the database
transaction, so a replacement ticket sees the attendance recorded through
the old ticket, an already-admitted party cannot be admitted a second time
through a replacement, and partial arrivals stay visible regardless of
which active ticket is scanned next.

### Validation-to-check-in flow

- The scanner validates a ticket (CHECKIN-06) and returns a trusted
  validation-attempt id. The browser keeps that id only in current React
  memory: never in a URL, query string, cookie, `localStorage`,
  `sessionStorage`, console or analytics.
- A `valid` or `partially_checked_in` result shows the arrival form below
  the result. `already_checked_in`, `revoked`, `replaced`, `pending`,
  `invalid`, `wrong_event`, `registration_blocked`, `rate_limited` and
  `error` never show the form.
- The form posts to `POST /api/staff/checkin/confirm` with only the
  validation-attempt id, a request id and the arriving-now counts. It never
  sends an event, ticket, registration or actor id. The acting user comes
  from the trusted session and the active event is resolved server-side.

### Partial and guest-first arrivals, child categories

- Partial arrivals are supported: the graduate, adult guests, children age
  0 to 4 and children age 5 to 10 can each arrive separately across
  multiple scans. A new scan is required before recording each arrival.
- Guests may arrive before the graduate. The graduate is never required to
  arrive first.
- The two child categories are tracked and enforced independently.

### One-time validation attempts and the 15-minute lifetime

- A successful validation may confirm attendance for 15 minutes. After that
  the ticket must be scanned again. Refreshing the browser also requires a
  new validation.
- A validation attempt may be consumed only once. A unique index on
  `validation_attempt_id` and a recheck inside the transaction enforce this.

### Idempotency and network retry

- The browser generates one request id per confirmation action and reuses
  it while retrying a failed network request. It never generates a new
  request id for an automatic retry.
- A unique index on `(recorded_by, request_id)` plus an idempotency check
  in the function return the original successful result for a duplicate
  submission, so a duplicate click or a lost-response retry never creates a
  second attendance row.

### Concurrency protection

The `apply_graduation_checkin` function locks the validation attempt, the
event, the ticket and the registration, then recalculates attendance and
enforces the registered allowance under the registration lock. Two staff
confirming the same remaining seats cannot over-admit: the losing request
receives a safe `conflict` with refreshed totals. Attendance is never
recorded above the registered allowance.

### Append-only check-in records

CHECKIN-07 records positive arrivals only. Each confirmation inserts one
`graduation_checkins` row and never updates, deletes or reverses an earlier
row, never inserts a negative delta and never changes registration
allowances, ticket status or payment status. Corrections and reversals
require the supervisor workflow in CHECKIN-08.

### Event and registration revalidation

The function rechecks ticket, registration and event status at confirmation
time. A ticket revoked or replaced after validation returns
`ticket_not_active` ("Ticket status changed. Scan the current ticket
again."). A registration that becomes cancelled or review-required returns
`registration_blocked`. A closed, archived or missing event returns
`configuration_error`.

### Manual migration deployment (CHECKIN-07)

The migration
`supabase/migrations/*_create_graduate_guest_checkin_workflow.sql` awaits
manual review and deployment (for example `npx supabase db push` against
the linked project). It is additive only: it adds the nullable
`request_id`, `validation_attempt_id` and `recorded_by` metadata columns to
the existing `graduation_checkins` table, adds the uniqueness and lookup
indexes and creates the security-definer `apply_graduation_checkin`
function with a fixed empty `search_path` and execution revoked from
`public`, `anon` and `authenticated`. It never modifies previously deployed
migrations and never creates duplicate attendance columns.
`npm run checkin:verify-config` safely reports the function as missing until
the migration is deployed. No new Vercel environment variable is required.

### Browser testing procedure

- Requires a signed-in staff account, the deployed CHECKIN-06 and
  CHECKIN-07 migrations and at least one active test ticket.
- Open `/staff/scanner`, validate a ticket, then in the arrival form use the
  count controls or the Full Remaining Party, Graduate Only and Clear quick
  actions, review the summary and press Confirm Arrival.
- Confirm a partial arrival, press Scan Next Ticket, scan the same active
  ticket again and admit the remaining party to reach Full Party Checked In.
  Attendance never exceeds the registered allowance.

## Live Attendance Dashboard and Supervisor Corrections (CHECKIN-08)

CHECKIN-08 adds the event-day attendance management system for supervisors
and administrators: a live dashboard, manual registration search, manual
arrival without a QR ticket, supervisor corrections and exact reversals.
Scanner-role users are always denied; every dashboard page and API
authorizes supervisor-level staff server-side and never trusts a role,
event id or actor id from the browser.

### Append-only audit history

Attendance records are append-only. Corrections and reversals create new
records and never edit or delete the original attendance entry. A manual
arrival inserts one positive row, a correction inserts one row with positive
or negative deltas, and a reversal inserts one row holding the exact negative
of an eligible original entry, linked to it through `reverses_checkin_id`.

### Attendance belongs to the registration

Attendance belongs to the registration. Ticket replacement does not reset,
duplicate or transfer attendance. Every dashboard total, search result,
correction and reversal recomputes attendance across all
`graduation_checkins` rows of the registration, clamped between zero and the
registered allowance, so a replacement ticket never double-counts and totals
never exceed the registered allowance or display negative attendance.

### Live dashboard calculations and refresh

- `/staff/attendance` shows eligible registrations, graduates arrived, fully
  and partially checked-in counts, not-yet-arrived, expected total
  attendance, total people arrived, remaining expected attendance and each
  category as arrived out of registered, using accessible CSS progress bars
  with no charting dependency.
- Blocked, failed, cancelled and review-required registrations are excluded
  from eligible attendance expectations. A registration is complete only when
  the graduate and every registered guest and child have arrived; a
  registration with guests present but the graduate absent is partial.
- The dashboard polls `GET /api/staff/attendance/summary` every 15 seconds
  while the tab is visible, pauses when the tab is hidden, prevents
  overlapping requests, offers a manual Refresh button, shows the last-updated
  time and a refreshing status, and warns when data is more than 60 seconds
  stale. The summary response is private and `no-store`; no Supabase
  subscription is exposed to the browser.

### Manual search and signed registration references

- Search is limited to the active event and supports graduate name (minimum
  two characters), exact ticket code and source registration id (exact or
  prefix). Email and phone search are not supported. Results are capped at 25.
- Search is live: results update while typing after a 300 ms debounce, a
  complete ticket code searches immediately, and pressing Enter or the Search
  button searches at once. Only the newest request wins; a slow, stale
  response is discarded, and clearing the field clears the results.
- Results can be narrowed with server-enforced filters that combine with the
  term and update automatically: attendance status (not arrived, partially
  arrived, fully checked in), registration status (eligible, review required,
  cancelled, failed), ticket status (active, no active ticket, replaced,
  revoked, pending) and test or production. Reset Filters restores the
  defaults. With no term and an active filter, the filters browse the event,
  for example to list signed-up registrations.
- RSVP status offers All and Signed up. Signed up means a matching RSVP
  registration exists. Not signed up is intentionally unavailable: an accurate
  not-signed-up list requires the complete invited-graduate roster, which this
  schema does not contain today (there is no invitation or roster table;
  `graduation_registrations` holds only RSVP responses). A not-signed-up list
  must never be fabricated from missing registration rows and awaits importing
  the complete invitation roster in a later ticket.
- Search never returns a database UUID. Each result carries a short-lived,
  server-signed registration reference (`ra1.<id>.<expiry>.<signature>`,
  HMAC SHA-256, event-bound, at most 15 minutes). Reversible history entries
  carry a signed entry reference (`en1.<id>.<expiry>.<signature>`). References
  are kept only in current React memory and are never placed in a URL, query
  string, cookie, `localStorage` or `sessionStorage`, never logged and never
  stored in the database.

### Manual arrival, correction and reversal

- Manual arrival, correction and reversal all require a reason between 5 and
  500 characters. Corrections require typing `APPLY CORRECTION` and reversals
  require typing `REVERSE ENTRY` to confirm.
- Manual arrival inserts positive deltas only and never exceeds the
  registered allowance. Corrections permit positive or negative deltas and
  keep the graduate total between 0 and 1 and every guest and child total
  between 0 and its registered allowance. A reversal is blocked when it would
  create negative attendance; staff are directed to a correction instead.
- Reversing a reversal and reversing an already-reversed entry are blocked,
  both in the interface and by a partial unique index on
  `reverses_checkin_id` in the database.

### Concurrency and idempotency

Every write locks the registration and recalculates totals inside the
database transaction, so two supervisors submitting attendance for the same
registration cannot over-admit: the losing request receives a safe conflict
with refreshed totals. Each action uses one request id; a unique index on
`(recorded_by, request_id)` and an idempotency check return the original
result for a duplicate submission, so a retry never creates a second row.

### Role restrictions

The dashboard, search, manual arrival, correction and reversal are available
to supervisor and administrator roles only. Scanner-role users continue to
see only the scanner workflow and are denied at the page, API and database
levels. The three database functions are `security definer` with a fixed
empty `search_path`, independently verify an active supervisor or
administrator, and have execution revoked from `public`, `anon` and
`authenticated`.

### Manual migration deployment (CHECKIN-08)

The migration
`supabase/migrations/*_create_attendance_supervisor_workflow.sql` awaits
manual review and deployment (for example `npx supabase db push` against the
linked project). It is additive only: it adds the `attendance_entry_kind`
enum, the `entry_kind` and `reason` columns, the entry-kind, reversal-link
and double-reversal indexes and the three security-definer functions. It
reuses `reverses_checkin_id` as the reversal link and `recorded_by` as the
acting supervisor, never creates duplicate attendance columns, never modifies
previously deployed migrations and never updates or deletes any existing row.
`npm run attendance:verify-config` safely reports the new functions as
missing until the migration is deployed. No new Vercel environment variable
is required.

### Event-day testing procedure

- Requires a signed-in supervisor or administrator, the deployed CHECKIN-07
  and CHECKIN-08 migrations and at least one eligible test registration.
- Open `/staff/attendance`, confirm the summary loads and refreshes, search
  for a registration by name, open View Attendance, and try Manual Arrival
  and Correct Attendance. Reverse an eligible entry from the attendance
  history. Confirm totals never exceed the registered allowance and never go
  negative, and that the original entry stays visible next to its reversal.

CHECKIN-08 does not generate ticket PDFs or send ticket emails; those remain
for CHECKIN-09.

## Ticket Distribution via Google Apps Script (CHECKIN-09B)

CHECKIN-09B adds the pipeline that emails the branded PDF tickets from
CHECKIN-09A. **The application never sends email and never connects to Gmail.**
It prepares signed delivery rows, a Google Apps Script bound to a Google Sheet
sends them, and the per-attempt results are imported back into a permanent,
append-only delivery history. See
[`tickets/CHECKIN-09B-google-apps-script-ticket-distribution.md`](tickets/CHECKIN-09B-google-apps-script-ticket-distribution.md)
for the full design and
[`google-apps-script/graduation-ticket-sender/README.md`](google-apps-script/graduation-ticket-sender/README.md)
for the sender.

### Production event separation

`GRAD-2026-DEV` is the test event and is never reused. CHECKIN-09B creates a
distinct **`CONVOCATION-2026`** production event as a non-test, draft event
(activation belongs to CHECKIN-10):

```bash
npm run events:create-production -- --dry-run   # report only, no writes
npm run events:create-production                # create or converge (idempotent)
npm run events:verify-production                # read-only verification
```

The create script copies no registrations, tickets, PDFs, check-ins,
attendance, imports or delivery records, never changes
`ACTIVE_GRADUATION_EVENT_CODE`, and never modifies `GRAD-2026-DEV`.

### Required environment variable

`TICKET_DISTRIBUTION_SECRET` — server-only, ≥ 32 random bytes, **separate from
`TICKET_TOKEN_SECRET`**. Generate with `openssl rand -base64 32`; set it in
`.env.local` and the Vercel server environment; never commit it and never use
the `NEXT_PUBLIC_` prefix. It signs delivery rows so the Sheet cannot alter a
recipient, PDF checksum or mode without the app detecting it on import.

### Migration

Additive migration
`supabase/migrations/20260721120000_create_ticket_distribution_delivery.sql`
adds the delivery batch, delivery, append-only attempt and result-import
tables plus two hardened security-definer functions. Apply it with the manual
deployment procedure used for earlier tickets (not run as part of this
ticket). RLS denies all `anon`/`authenticated` access, including scanner and
supervisor staff.

### Administrator workflow

`/admin/tickets/distribution` (linked from ticket management) shows delivery
counts, prepares a delivery batch from a completed PDF document batch (test or
production mode), downloads the signed `send-queue.csv`, and cancels unsent
batches. `/admin/tickets/distribution/import-results` previews and applies an
Apps Script results CSV; re-importing the same file is idempotent.

### Google Apps Script and Drive

Install the sender from `google-apps-script/graduation-ticket-sender/` into a
Sheet owned by `office@torontoacademy.ca`, run **Setup Workbook**, fill
**Configuration**, and place the batch PDFs in a Drive folder referenced by
`DRIVE_BATCH_FOLDER_ID`. In test mode all mail goes only to
`TEST_RECIPIENT_EMAIL` with a `[TEST]` subject; production sending requires the
authorized sender and the exact confirmation phrase
`SEND CONVOCATION 2026 TICKETS`.

### Test pilot, results and resend

Prepare a test batch, load the CSV in the Sheet, Send Test for one row, Export
Results, and import them to confirm the round trip. To resend a corrected
registration, update it in the app and prepare a new `resend` batch — never
hand-edit the intended recipient in the Sheet, because the app rejects an
altered row on import. `Scan Bounce Messages` is a manual, office-account-only
review that never marks a message delivered.

### Guest flexibility blocker

The distribution workflow imposes no adult-guest cap, but an approved upstream
schema rule still caps each guest count at 2
(`graduation_registrations_adults_range` and related constraints in the
CHECKIN-02 migration). This is reported as a production blocker and left
unchanged; raising it is a CHECKIN-10 decision.

### CHECKIN-10 handoff

CHECKIN-09B does not import the final real registration report and does not
activate production check-in. CHECKIN-10 imports the real report, generates
real PDFs, runs the real distribution, decides on the two-guest limit, and
activates `CONVOCATION-2026` for live check-in.

## Data-Protection Rules

Production student information must not be used during application development.

- Never commit student information.
- Never commit `.env.local` or any file containing secrets.
- Never commit Excel or CSV files. The `.gitignore` blocks `*.xlsx`, `*.xls` and `*.csv`.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in browser code. The admin client in `src/lib/supabase/admin.ts` is marked server-only.
- Never expose Supabase administrative credentials to client components.
- Public signup must remain disabled.
- Environment validation errors report variable names only, never values.

## The `_reference` Folder

`_reference` holds private registration source files, including the registration workbook. It is local-only, ignored by Git and must never be committed, opened by tooling or copied into the application. Application code must not read from it.

## Supabase Setup Status

The application connects to a hosted Supabase project through
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The health endpoint at
`/api/health` reports `supabaseConfigured` based on the presence of the
public values. The CHECKIN-02 schema migration is deployed; the CHECKIN-03
import migration awaits manual deployment.

## Current Implementation Status

- Project scaffolding, strict TypeScript, Tailwind CSS and ESLint: complete
- Environment validation (`src/lib/env`): complete
- Supabase browser, server and admin clients (`src/lib/supabase`): complete
- Landing page with development status: complete
- Health endpoint (`GET /api/health`): complete
- Automated tests: complete
- CHECKIN-02 database schema migration and mock-data tooling: complete
- Remote Supabase project connection: complete
- Excel import workflow (CHECKIN-03): complete, administrator protected;
  the import migration awaits manual deployment
- Staff authentication and access roles (CHECKIN-04): implemented; the
  staff authentication migration and the one-time first-administrator
  bootstrap await manual completion
- Secure ticket generation (CHECKIN-05): implemented; the ticket
  migration awaits manual deployment
- Mobile ticket scanner and secure validation (CHECKIN-06): implemented;
  the scan-attempt migration awaits manual deployment
- Graduate and guest arrival check-in (CHECKIN-07): implemented; the
  check-in workflow migration awaits manual deployment. Records positive
  arrivals only; corrections and reversals belong to CHECKIN-08
- Live attendance dashboard, manual search and supervisor corrections
  (CHECKIN-08): implemented; the attendance supervisor-workflow migration
  awaits manual deployment. Manual arrival, corrections and reversals are
  append-only and supervisor protected

## Planned Next Ticket

CHECKIN-09: ticket PDF generation and email delivery. CHECKIN-10 covers
production readiness and final quality testing.
