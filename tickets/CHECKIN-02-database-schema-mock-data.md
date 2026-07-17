# CHECKIN-02: Database Schema, Mock Registrations and Protected Reset Scripts

## Objective

Create the secure Supabase database foundation for the Toronto Academy of Education Graduation Check-In application.

This ticket must:

1. Initialize the Supabase project structure in the repository.
2. Create version-controlled database migrations.
3. Create the core graduation event, registration, guest, ticket, staff and check-in tables.
4. Enable Row Level Security and prevent public data access.
5. Create fictional development registrations.
6. Create safe mock-data seed and reset commands.
7. Protect production and real student information from destructive development commands.
8. Document how the current registration Excel columns will map into the database during a later ticket.

Do not read or import the real registration workbook in this ticket.

## Project Information

Application:

```text
Graduation Check-In
```

Organization:

```text
Toronto Academy of Education
```

Repository:

```text
https://github.com/sajingeorgemathew/graduatecheckin.git
```

Local path:

```text
C:\Users\USER\Desktop\Graduationcheckin
```

Required branch:

```text
feat/checkin-02-database-mock-data
```

## Existing Foundation

BOOTSTRAP-00 has already established:

* Next.js 16
* TypeScript
* Tailwind CSS
* Supabase browser, server and admin clients
* Environment validation
* Vitest
* Health endpoint
* Git privacy protections
* `_reference` as a local-only directory
* A clean `main` branch

Preserve the existing foundation.

## Critical Privacy Rules

1. Do not open, read, parse, copy, summarize or modify files inside `_reference`.
2. Do not use the real Excel workbook.
3. Do not use real graduate names.
4. Do not use real email addresses.
5. Do not use real phone numbers.
6. Do not use real guest names.
7. Do not use real order IDs.
8. Do not use real payment information.
9. Do not commit `.env.local`.
10. Do not commit database credentials.
11. Do not print Supabase credentials in logs.
12. Do not print the ticket secret.
13. Do not create mock records inside a production event.
14. Destructive scripts must only target records clearly marked as test data.
15. Do not use long hyphens or em dashes in UI text, documentation or comments.

## Supabase CLI

Install the Supabase CLI as a project development dependency:

```powershell
npm install --save-dev supabase
```

Also install:

```powershell
npm install --save-dev dotenv
```

Confirm the installed CLI works:

```powershell
npx supabase --version
```

Initialize the repository if `supabase/config.toml` does not exist:

```powershell
npx supabase init
```

Do not link to a remote Supabase project in this ticket.

Do not run `supabase db push`.

Do not request a Supabase access token.

Do not modify a remote Supabase project.

## Supabase Folder Structure

Create and maintain:

```text
supabase/
  config.toml
  migrations/
  seed.sql
```

Create one migration for the complete initial check-in schema.

Use the Supabase migration command so the filename receives a valid timestamp:

```powershell
npx supabase migration new create_graduation_checkin_schema
```

Do not manually invent a migration timestamp when the CLI is available.

## Required PostgreSQL Extensions

The migration must safely enable:

```sql
create extension if not exists pgcrypto;
```

Use UUID primary keys generated with `gen_random_uuid()` unless a deterministic mock UUID is explicitly supplied by the seed data.

## Database Enum Types

Create database enum types or equally strict checked text columns for the following concepts.

### Graduation event status

Allowed values:

```text
draft
active
closed
archived
```

### Registration source

Allowed values:

```text
mock
registration_export
manual
```

### Registration status

Allowed values:

```text
eligible
review_required
cancelled
failed
```

### Payment status

Allowed values:

```text
unknown
amount_recorded
paid
pending
failed
refunded
waived
```

### Guest category

Allowed values:

```text
adult
child_0_4
child_5_10
```

The database and application must consistently use `child_5_10`.

Do not use `child_4_10`.

### Ticket status

Allowed values:

```text
pending
active
revoked
replaced
```

### Staff role

Allowed values:

```text
scanner
supervisor
administrator
```

### Check-in method

Allowed values:

```text
qr_scan
manual_search
supervisor_adjustment
system
```

### Check-in action

Allowed values:

```text
admission
correction
reversal
```

## Table 1: `graduation_events`

Create:

```text
public.graduation_events
```

Required columns:

```text
id
event_code
event_name
starts_at
ends_at
timezone
venue_name
venue_address
status
is_test
created_at
updated_at
```

Requirements:

* `id` is UUID primary key.
* `event_code` is required and unique.
* `event_name` is required.
* `timezone` defaults to `America/Toronto`.
* `status` defaults to `draft`.
* `is_test` defaults to `false`.
* `starts_at` must be before `ends_at` when both exist.
* Include created and updated timestamps.
* Create an index for `event_code`.
* Create an index for `status`.
* Create an index for `is_test`.

The fictional development event must use:

```text
event_code: GRAD-2026-DEV
event_name: Graduation Check-In Development Event
is_test: true
status: draft
timezone: America/Toronto
```

## Table 2: `graduation_registrations`

Create:

```text
public.graduation_registrations
```

Required columns:

```text
id
event_id
registration_code
source_system
source_registration_id
graduate_full_name
email
phone
gown_size
name_pronunciation
registered_adult_guests
registered_children_0_4
registered_children_5_10
expected_party_size
registration_status
payment_status
fee_total
tax_total
order_total
source_order_date
internal_notes
is_test
created_at
updated_at
```

Requirements:

* `id` is UUID primary key.
* `event_id` references `graduation_events`.
* Delete registrations automatically if their test event is deleted.
* `registration_code` is required and unique.
* `source_system` is required.
* `source_registration_id` may be null for manual registrations.
* Create a unique constraint across:

  * `event_id`
  * `source_system`
  * `source_registration_id`
* The uniqueness rule should apply when `source_registration_id` is present.
* `graduate_full_name` is required.
* Normalize email values to lowercase in mock fixtures and future application code.
* Normalize phone values to digits only in mock fixtures and future application code.
* `registered_adult_guests` must be between 0 and 2.
* `registered_children_0_4` must be between 0 and 2.
* `registered_children_5_10` must be between 0 and 2.
* The combined number of children must not exceed 2.
* `expected_party_size` must be generated or reliably calculated as:

  * one graduate
  * plus registered adult guests
  * plus children aged 0 to 4
  * plus children aged 5 to 10
* Monetary fields must not be negative.
* `registration_status` defaults to `review_required`.
* `payment_status` defaults to `unknown`.
* `is_test` defaults to `false`.
* Include created and updated timestamps.

Create indexes supporting:

* Event filtering
* Registration status
* Payment status
* Case-insensitive graduate-name search
* Case-insensitive email search
* Phone search
* Source registration lookup
* Test-record filtering

Do not store the QR token in this table.

## Table 3: `registration_guests`

Create:

```text
public.registration_guests
```

Required columns:

```text
id
registration_id
guest_category
guest_name
sort_order
is_test
created_at
updated_at
```

Requirements:

* `id` is UUID primary key.
* `registration_id` references `graduation_registrations`.
* Delete guest records automatically if the registration is deleted.
* `guest_category` is required.
* `guest_name` may be null because children may be registered without names.
* `sort_order` must be a positive integer.
* `is_test` defaults to `false`.
* Include created and updated timestamps.
* Create an index on `registration_id`.
* Create an index on `guest_category`.
* Create a unique constraint on registration, category and sort order.

The registration table remains the source of truth for registered party counts.

Guest rows provide optional individual names and categories.

## Table 4: `graduation_tickets`

Create:

```text
public.graduation_tickets
```

Required columns:

```text
id
registration_id
ticket_code
token_hash
status
issued_at
sent_at
revoked_at
replaced_by_ticket_id
is_test
created_at
updated_at
```

Requirements:

* `id` is UUID primary key.
* `registration_id` references `graduation_registrations`.
* Delete test tickets automatically if their registration is deleted.
* `ticket_code` is required and unique.
* `token_hash` is required and unique.
* Store only a secure hash of the QR ticket token.
* Never store the raw QR token.
* `status` defaults to `pending`.
* `replaced_by_ticket_id` may reference another graduation ticket.
* Create an index on `registration_id`.
* Create an index on `status`.
* Create an index on `token_hash`.
* Allow only one active ticket for a registration through a partial unique index where technically appropriate.
* Include created and updated timestamps.

Do not generate ticket rows in this ticket.

Ticket generation belongs to a later ticket.

## Table 5: `staff_profiles`

Create:

```text
public.staff_profiles
```

Required columns:

```text
user_id
display_name
role
is_active
created_at
updated_at
```

Requirements:

* `user_id` is the primary key.
* `user_id` references `auth.users`.
* `display_name` is required.
* `role` defaults to `scanner`.
* `is_active` defaults to `true`.
* Include created and updated timestamps.
* Create indexes for role and active status.

Do not create real or fictional Supabase Auth accounts in this ticket.

Staff authentication belongs to CHECKIN-04.

## Table 6: `graduation_checkins`

Create:

```text
public.graduation_checkins
```

This table must be an append-oriented check-in audit log.

Required columns:

```text
id
registration_id
ticket_id
staff_user_id
staff_name_snapshot
method
action
graduate_delta
adult_guest_delta
child_0_4_delta
child_5_10_delta
idempotency_key
notes
reverses_checkin_id
is_test
created_at
```

Requirements:

* `id` is UUID primary key.
* `registration_id` references `graduation_registrations`.
* `ticket_id` may reference `graduation_tickets`.
* `staff_user_id` may reference `auth.users`.
* `staff_name_snapshot` may be stored for audit readability.
* `method` is required.
* `action` is required.
* Delta fields default to zero.
* Graduate delta must be between negative one and one.
* Each guest or child delta must be between negative two and two.
* At least one delta must be non-zero.
* `idempotency_key` is required and unique.
* `reverses_checkin_id` may reference a previous check-in row.
* `is_test` defaults to `false`.
* Check-in rows should not normally be updated after creation.
* Create indexes for:

  * registration
  * ticket
  * staff user
  * created time
  * idempotency key
  * test status

Do not add mock check-in records in the standard seed.

## Updated Timestamp Function

Create one reusable PostgreSQL function that updates `updated_at` before update operations.

Attach it to mutable tables:

* `graduation_events`
* `graduation_registrations`
* `registration_guests`
* `graduation_tickets`
* `staff_profiles`

Do not add an updated timestamp to the append-oriented check-in log.

## Row Level Security

Enable Row Level Security on every table in the `public` schema created by this ticket.

The tables are:

```text
graduation_events
graduation_registrations
registration_guests
graduation_tickets
staff_profiles
graduation_checkins
```

Requirements:

1. Enable RLS.
2. Do not create public anonymous access.
3. Do not create authenticated access policies yet.
4. Revoke direct table privileges from `anon`.
5. Revoke direct table privileges from `authenticated`.
6. Preserve server-side service-role access.
7. Do not create a policy that returns all records.
8. Do not expose graduate information through an unsecured database view.
9. Do not expose a public RPC function.
10. Staff access policies will be implemented with authentication in CHECKIN-04.

Until CHECKIN-04, database access must occur only through trusted server-side code using the service-role client.

## Database Comments

Add concise SQL comments explaining:

* The purpose of each table
* That `token_hash` must never contain a raw QR token
* That check-ins form an audit log
* That test records must remain separated from production records
* That RLS policies will be added with staff authentication

Do not include real student information in comments.

## Database Type Definitions

Create or update:

```text
src/types/database.ts
```

It must contain strict TypeScript types matching the initial database schema.

Include:

* `Database`
* Row types
* Insert types
* Update types
* Enum union types

Do not use `any`.

Do not manually expose service-role credentials through the type file.

Add a README note that these types should later be regenerated from the linked Supabase project after migrations are deployed.

## Mock Data Source of Truth

Create:

```text
scripts/mock-data/fixtures.ts
```

This must contain the fictional development event and 20 fictional registrations.

All records must be visibly fictional.

Use names such as:

```text
Test Graduate 001
Test Graduate 002
Test Graduate 003
```

Use emails only under:

```text
example.com
```

Example:

```text
graduate001@example.com
```

Use fictional phone numbers in a reserved-looking test range such as:

```text
4165550101
4165550102
```

Use deterministic mock source IDs:

```text
MOCK-001
MOCK-002
MOCK-003
```

Use deterministic UUIDs so seeding is repeatable.

Every mock event, registration and guest record must have:

```text
is_test: true
```

## Mock Scenarios

The 20 mock registrations must cover at least:

1. Graduate attending alone
2. One adult guest
3. Two adult guests
4. One child aged 0 to 4
5. Two children aged 0 to 4
6. One child aged 5 to 10
7. Two children aged 5 to 10
8. One child in each age group
9. One adult guest and one child
10. Two adult guests and two children
11. Payment status unknown
12. Amount recorded
13. Payment pending
14. Payment paid
15. Registration requiring review
16. Failed registration
17. Cancelled registration
18. Missing gown size
19. Name pronunciation provided
20. Shared fictional contact email for duplicate-review testing

The fixture must respect:

```text
Maximum adult guests: 2
Maximum combined children: 2
Age groups: 0 to 4 and 5 to 10
```

Do not generate active QR tickets.

Do not generate check-ins.

Do not generate Supabase Auth users.

## Seed SQL Generation

Create:

```text
scripts/mock-data/generate-seed-sql.ts
```

The script must generate:

```text
supabase/seed.sql
```

Requirements:

* Use `fixtures.ts` as the source of truth.
* Generate deterministic SQL.
* Escape SQL values safely.
* Insert or upsert the fictional event.
* Insert or upsert fictional registrations.
* Insert or upsert fictional guest details.
* Do not include schema creation statements.
* Do not insert ticket rows.
* Do not insert check-in rows.
* Do not insert Auth users.
* Do not contain real data.
* Running the generator twice without fixture changes must produce identical output.

Add:

```json
"db:generate:seed": "tsx scripts/mock-data/generate-seed-sql.ts"
```

Generate and commit the resulting `supabase/seed.sql`.

## Remote Development Seed Script

Create:

```text
scripts/mock-data/seed.ts
```

Requirements:

* Load `.env.local` safely.
* Use the server-only Supabase admin client.
* Require:

  * `NEXT_PUBLIC_SUPABASE_URL`
  * `SUPABASE_SERVICE_ROLE_KEY`
* Do not require the publishable key.
* Validate every record is marked `is_test: true`.
* Upsert the development event.
* Upsert the 20 mock registrations.
* Upsert mock guest details.
* Be idempotent.
* Do not create tickets.
* Do not create check-ins.
* Do not delete real records.
* Print counts only.
* Do not print names, emails, phones, IDs or credentials.
* Return a clear error when the database migration has not yet been applied.

Add:

```json
"db:seed:mock": "tsx scripts/mock-data/seed.ts"
```

## Destructive Reset Protection

Add these environment placeholders to `.env.example`:

```env
ALLOW_DESTRUCTIVE_DEV_RESET=false
DEV_RESET_CONFIRMATION=
MOCK_EVENT_CODE=GRAD-2026-DEV
```

Add missing names to `.env.local` without overwriting existing values.

Default local values must remain:

```env
ALLOW_DESTRUCTIVE_DEV_RESET=false
DEV_RESET_CONFIRMATION=
MOCK_EVENT_CODE=GRAD-2026-DEV
```

Create:

```text
scripts/mock-data/reset-guards.ts
```

The reusable guard must reject destructive operations unless all of these conditions are true:

```text
APP_ENV is exactly development
ALLOW_DESTRUCTIVE_DEV_RESET is exactly true
DEV_RESET_CONFIRMATION is exactly RESET_GRADUATION_CHECKIN_DEV_DATA
MOCK_EVENT_CODE is exactly GRAD-2026-DEV
```

The guard must also verify through the database that the target event has:

```text
event_code: GRAD-2026-DEV
is_test: true
```

If the target event does not exist, the reset command may report that there is nothing to reset.

If the event exists with `is_test: false`, abort immediately.

Do not provide any command capable of deleting all database records.

Do not provide any command capable of resetting an arbitrary event code.

## Full Mock Reset Script

Create:

```text
scripts/mock-data/reset.ts
```

Requirements:

1. Apply all destructive reset guards.
2. Resolve only the `GRAD-2026-DEV` event.
3. Verify the event is marked as test data.
4. Delete that test event.
5. Allow foreign-key cascades to remove its mock registrations, guest details, tickets and check-ins.
6. Reinsert the fictional event and 20 registrations.
7. Print record counts only.
8. Do not print personal-looking fixture values.
9. Abort on any unexpected non-test record.
10. Never target a production event.

Add:

```json
"db:reset:mock": "tsx scripts/mock-data/reset.ts"
```

## Check-In-Only Reset Script

Create:

```text
scripts/mock-data/reset-checkins.ts
```

Requirements:

1. Apply the same destructive reset guards.
2. Resolve only registrations belonging to the test event.
3. Verify the event and registrations are marked as test data.
4. Delete only check-in rows related to those mock registrations.
5. Preserve:

   * the mock event
   * registrations
   * guests
   * tickets
6. Print only the number of check-in rows deleted.
7. Do not affect any non-test check-in record.

Add:

```json
"db:reset:mock-checkins": "tsx scripts/mock-data/reset-checkins.ts"
```

## Local Supabase Scripts

Add package scripts:

```json
{
  "supabase:start": "supabase start",
  "supabase:stop": "supabase stop",
  "supabase:status": "supabase status",
  "supabase:reset": "supabase db reset"
}
```

These commands operate on the local Supabase stack.

Do not create a package script that automatically pushes migrations to a remote project.

Do not create a production reset command.

## Mock Data Validation

Create:

```text
scripts/mock-data/validate.ts
```

Validate:

* Exactly one fictional development event
* Exactly 20 registrations
* All event and registration records are test records
* All emails use `example.com`
* All phones use the fictional test format
* All source IDs begin with `MOCK-`
* All UUIDs are unique
* All registration codes are unique
* No adult guest count exceeds 2
* No combined child count exceeds 2
* No negative monetary value exists
* No raw ticket token exists
* No ticket record exists
* No check-in record exists
* The failed and cancelled scenarios exist
* The review-required scenario exists
* All three payment test conditions exist
* The age group is always `child_5_10`, never `child_4_10`

Add:

```json
"db:validate:mock": "tsx scripts/mock-data/validate.ts"
```

## Tests

Add automated tests covering:

### Fixture tests

* Exactly 20 registrations
* Unique IDs
* Unique registration codes
* Unique mock source IDs
* All data is fictional
* All emails use `example.com`
* All phone numbers use test values
* Adult guest limits
* Child limits
* Expected party-size calculations
* Payment-status scenarios
* Registration-status scenarios
* No ticket or check-in records

### Reset guard tests

Test that the guard rejects:

* Production environment
* Missing reset permission
* False reset permission
* Missing confirmation
* Incorrect confirmation
* Wrong event code
* A database event marked as non-test

Test that the guard accepts only the complete approved development configuration.

### Seed generation tests

* SQL generation is deterministic
* Seed SQL does not contain schema creation
* Seed SQL contains only mock event, registration and guest data
* Seed SQL does not create tickets
* Seed SQL does not create check-ins
* Seed SQL does not create Auth users
* Seed SQL does not contain raw secrets
* Generated SQL matches the committed `supabase/seed.sql`

### Migration safety tests

Read the migration as text and verify:

* All six required tables exist
* RLS is enabled on all six tables
* Anonymous privileges are revoked
* Authenticated privileges are revoked
* No unrestricted anonymous policy exists
* `token_hash` exists
* No raw `token` column exists in `graduation_tickets`
* Registration count constraints exist
* Child count constraints exist
* Check-in idempotency uniqueness exists

Tests must not connect to the real Supabase database.

## Optional Local Database Validation

Check whether Docker is installed and running.

If Docker is available:

```powershell
npx supabase start
npx supabase db reset
npx supabase status
npx supabase stop
```

Confirm:

* Migration applies
* Seed executes
* 20 mock registrations exist
* No ticket rows exist
* No check-in rows exist

Do not leave Supabase containers running after validation unless they were already running before the ticket began.

If Docker is unavailable, do not install Docker and do not fail the ticket.

Report that local database execution was skipped and that migration deployment remains a manual step after the user connects a Supabase development project.

## Excel Mapping Documentation

Create:

```text
docs/database/registration-import-mapping.md
```

Document the planned future mapping without opening the real workbook:

| Registration export field | Database field                                                            |
| ------------------------- | ------------------------------------------------------------------------- |
| `order_id`                | `source_registration_id`                                                  |
| `Full Name`               | `graduate_full_name`                                                      |
| `Email`                   | `email`                                                                   |
| `Phone Number`            | `phone`                                                                   |
| `Graduation Gown Size`    | `gown_size`                                                               |
| `Name Pronunciation`      | `name_pronunciation`                                                      |
| `Guest 1` and `Guest 2`   | `registration_guests`                                                     |
| `Kids (0 to 4)`           | `registered_children_0_4`                                                 |
| `Kids (4 to 10)`          | Normalize to `registered_children_5_10` after administrative confirmation |
| `status`                  | `registration_status` and payment review                                  |
| `fee_total`               | `fee_total`                                                               |
| `tax_total`               | `tax_total`                                                               |
| `order_total`             | `order_total`                                                             |
| `order_date`              | `source_order_date`                                                       |

Clearly state that the actual workbook will be handled only in CHECKIN-03.

Document that:

* `order_id` will be the external upsert key.
* Name and email will not be used as unique identifiers.
* Failed orders will require review.
* Existing records will be updated rather than duplicated.
* Removed rows will be flagged instead of automatically deleted.
* Child age wording requires normalization from 4 to 10 into the approved 5 to 10 category.

## Schema Documentation

Create:

```text
docs/database/checkin-schema.md
```

Explain:

* Purpose of each table
* Table relationships
* Why the registration stores expected party counts
* Why guest names are stored separately
* Why ticket tokens are hashed
* Why check-ins use an append-oriented audit log
* Why mock and production records must remain separated
* How reset protections work
* Which features remain for later tickets

Do not include real student information.

## Homepage Status

Update the project foundation screen to show:

```text
Application configured
Database migration ready
Mock data tools ready
Supabase project connection pending
QR scanner not implemented
```

Do not claim the remote database is deployed unless it has actually been deployed.

Do not display fixture names or contact details on the homepage.

## README Update

Update the root README with:

* Supabase CLI setup
* Migration location
* Seed location
* Mock-data command descriptions
* Local Supabase commands
* Environment requirements
* Reset safeguards
* Clear production warning
* Current ticket status
* Next planned ticket

Include this warning prominently:

```text
Never enable destructive reset variables in a production environment.
```

Document the exact development reset configuration:

```env
APP_ENV=development
ALLOW_DESTRUCTIVE_DEV_RESET=true
DEV_RESET_CONFIRMATION=RESET_GRADUATION_CHECKIN_DEV_DATA
MOCK_EVENT_CODE=GRAD-2026-DEV
```

Explain that the flags should be returned to safe values after reset testing:

```env
ALLOW_DESTRUCTIVE_DEV_RESET=false
DEV_RESET_CONFIRMATION=
```

## Package Scripts

At completion, `package.json` must include:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "supabase:start": "supabase start",
  "supabase:stop": "supabase stop",
  "supabase:status": "supabase status",
  "supabase:reset": "supabase db reset",
  "db:generate:seed": "tsx scripts/mock-data/generate-seed-sql.ts",
  "db:validate:mock": "tsx scripts/mock-data/validate.ts",
  "db:seed:mock": "tsx scripts/mock-data/seed.ts",
  "db:reset:mock": "tsx scripts/mock-data/reset.ts",
  "db:reset:mock-checkins": "tsx scripts/mock-data/reset-checkins.ts"
}
```

Preserve other valid scripts.

## Out of Scope

Do not implement:

* Real Excel parsing
* Real registration import
* Admin Excel upload
* Import preview
* Import approval
* Remote Supabase deployment
* Production records
* Staff login
* Staff invitation
* Staff RLS policies
* QR token generation
* QR images
* Ticket PDFs
* Ticket emailing
* QR scanning
* Check-in UI
* Dashboard
* Manual student search
* Partial party arrival UI
* Vercel deployment

## Required Quality Checks

Run:

```powershell
npm run db:generate:seed
npm run db:validate:mock
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

Run:

```powershell
git status
git diff --stat
git diff
```

## Privacy Checks

Run:

```powershell
git ls-files |
    Select-String -Pattern "^node_modules/|^\.next/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"
```

Expected result:

```text
No output
```

Run:

```powershell
git diff --name-only |
    Select-String -Pattern "^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"
```

Expected result:

```text
No output
```

Search source-controlled files for accidental real data or secrets.

Do not search inside `_reference`.

## Acceptance Criteria

1. The Supabase CLI is installed as a project dependency.
2. The repository contains `supabase/config.toml`.
3. A valid migration defines all six required tables.
4. All public tables have RLS enabled.
5. Anonymous and authenticated direct access is blocked.
6. The schema contains strong count and monetary constraints.
7. The ticket table stores only token hashes.
8. Check-ins use an append-oriented audit structure.
9. Exactly 20 fictional registrations exist in fixtures.
10. No real student data is used.
11. Seed SQL is deterministic.
12. Seed SQL contains only data statements.
13. Mock seed is idempotent.
14. Full mock reset is strongly protected.
15. Check-in-only reset is strongly protected.
16. No command can delete arbitrary events.
17. No production reset script exists.
18. Database TypeScript definitions exist.
19. Excel mapping documentation exists.
20. Schema documentation exists.
21. Mock validation passes.
22. Tests pass.
23. ESLint passes.
24. Type checking passes.
25. Production build passes.
26. Privacy checks pass.
27. `_reference` remains untouched.
28. No database credentials are committed.
29. The homepage accurately reflects the project status.
30. No commit or push is performed by Claude.

## Final Report

Report:

1. Current branch
2. Files created
3. Files modified
4. Packages installed
5. Database tables created in migration
6. Constraints and indexes added
7. RLS protections added
8. Number of mock events
9. Number of mock registrations
10. Number of mock guests
11. Seed-generation result
12. Mock-validation result
13. Reset protections implemented
14. Tests added
15. Test result
16. Lint result
17. Type-check result
18. Build result
19. Local Supabase database test result
20. Privacy-check result
21. Manual Supabase steps remaining
22. Assumptions
23. Any issue requiring review

Do not report fixture names, emails, phone numbers, UUIDs or secrets.

Do not commit or push.
