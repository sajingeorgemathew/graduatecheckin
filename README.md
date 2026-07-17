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
| `TICKET_TOKEN_SECRET` | Server secret | Random secret used to sign ticket tokens. Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. |
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

The import target event is fixed server-side to `GRAD-2026-DEV` until a
later event-management ticket. Event codes are never accepted from the
browser.

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

### Next ticket

CHECKIN-05 adds QR ticket generation. Scanning, check-in processing and
dashboards follow in CHECKIN-06 through CHECKIN-08.

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
- QR ticket generation: not started
- Check-in scanner: not started

## Planned Next Ticket

CHECKIN-05: QR ticket generation. Later tickets cover ticket delivery,
scanning, check-in processing and reporting.
