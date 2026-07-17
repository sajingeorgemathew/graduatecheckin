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

## Data-Protection Rules

Production student information must not be used during application development.

- Never commit student information.
- Never commit `.env.local` or any file containing secrets.
- Never commit Excel or CSV files. The `.gitignore` blocks `*.xlsx`, `*.xls` and `*.csv`.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in browser code. The admin client in `src/lib/supabase/admin.ts` is marked server-only.
- Environment validation errors report variable names only, never values.

## The `_reference` Folder

`_reference` holds private registration source files, including the registration workbook. It is local-only, ignored by Git and must never be committed, opened by tooling or copied into the application. Application code must not read from it.

## Supabase Setup Status

Supabase credentials have not been added yet. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` when the Supabase project is ready. The health endpoint at `/api/health` reports `supabaseConfigured` based on the presence of the public values.

## Current Implementation Status

- Project scaffolding, strict TypeScript, Tailwind CSS and ESLint: complete
- Environment validation (`src/lib/env`): complete
- Supabase browser, server and admin clients (`src/lib/supabase`): complete
- Landing page with development status: complete
- Health endpoint (`GET /api/health`): complete
- Automated tests: complete
- CHECKIN-02 database schema migration and mock-data tooling: complete
- Remote Supabase project connection and migration deployment: pending
- Real registration import (CHECKIN-03): not started
- Staff authentication and RLS policies (CHECKIN-04): not started
- QR ticket generation: not started
- Check-in scanner: not started

## Planned Next Ticket

CHECKIN-03: real registration import from the Excel export, including
preview and approval. Later tickets cover staff authentication (CHECKIN-04),
QR ticket generation and delivery, scanning and reporting.
