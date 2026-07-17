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
- Supabase credentials: pending
- Mock data: not loaded
- QR ticket generation: not started
- Check-in scanner: not started

## Planned Next Features

1. Supabase schema and mock development data
2. Graduate and guest registration views
3. Secure QR ticket generation and delivery
4. Staff scanner and check-in dashboard
5. Reporting for event attendance
