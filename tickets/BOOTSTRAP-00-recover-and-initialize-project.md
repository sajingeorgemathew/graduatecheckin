# BOOTSTRAP-00: Recover and Initialize Graduation Check-In Project

## Objective

Inspect the current state of the Graduation Check-In project, safely clean up any incomplete Git or Next.js setup, protect the private registration workbook, complete the required application foundation, and push a clean working project to GitHub.

Claude must take responsibility for inspecting the current condition of the folder before making changes.

## Project Information

Local folder:

```text
C:\Users\USER\Desktop\Graduationcheckin
```

GitHub repository:

```text
https://github.com/sajingeorgemathew/graduatecheckin.git
```

Expected branch:

```text
main
```

Application name:

```text
Graduation Check-In
```

Organization:

```text
Toronto Academy of Education
```

## Important Safety Rules

1. Do not delete the Excel registration workbook.
2. Do not open, read, parse, summarize or display student information from the workbook.
3. Move any Excel, CSV or similar registration files into `_reference` if they are currently elsewhere in the project.
4. `_reference` must remain local-only and ignored by Git.
5. Never commit student information.
6. Never commit `.env.local`.
7. Never commit `node_modules`.
8. Never commit `.next`.
9. Never expose Supabase secret values.
10. Never use `SUPABASE_SERVICE_ROLE_KEY` in browser code.
11. Do not use force push.
12. Do not delete valid project work without first inspecting it.
13. Do not rewrite Git history automatically.
14. Do not use long hyphens or em dashes in application text, documentation or comments.

## Phase 1: Inspect the Current State

Before changing anything, inspect:

```powershell
Get-Location
Get-ChildItem -Force
git status
git branch
git remote -v
git log --oneline --all -10
git ls-files
```

Also inspect:

* `.gitignore`
* `package.json`
* `package-lock.json`
* `README.md`
* `src`
* `app`
* `.env.example`
* `.env.local`, without displaying its values
* Whether `node_modules` is tracked or only present locally
* Whether `.next` is tracked
* Whether spreadsheets are tracked
* Whether the GitHub remote already contains commits

Do not open files inside `_reference`.

Provide a short recovery plan before implementing.

## Phase 2: Protect Private Files

Ensure this folder exists:

```text
_reference
```

Move any project-root files with these extensions into `_reference`:

```text
.xlsx
.xls
.csv
```

Do not rename or modify the contents of those files.

Ensure `.gitignore` includes:

```gitignore
# Dependencies
node_modules/

# Next.js
.next/
out/

# Environment files
.env
.env.local
.env.development.local
.env.production.local
.env.*.local

# Keep the environment template
!.env.example

# Private registration data
_reference/
*.xlsx
*.xls
*.csv

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Operating system files
.DS_Store
Thumbs.db
```

If `node_modules`, `.next`, `.env.local`, `_reference` or spreadsheets were accidentally staged or tracked, remove them from the Git index without deleting the local files.

Use safe commands such as:

```powershell
git reset
git rm -r --cached --ignore-unmatch node_modules
git rm -r --cached --ignore-unmatch .next
git rm -r --cached --ignore-unmatch _reference
git rm --cached --ignore-unmatch .env.local
```

Also remove tracked Excel and CSV files from the Git index without deleting them locally.

If private registration information has already been committed and pushed to GitHub, stop before rewriting history and clearly report the affected filenames and commits.

## Phase 3: Repair or Create the Next.js Application

Determine whether a valid Next.js application already exists.

A valid application should have:

* `package.json`
* `next`
* `react`
* `react-dom`
* TypeScript configuration
* App Router structure
* `src/app` or `app`
* ESLint configuration

If the application is valid, preserve it and repair only what is necessary.

If the application is missing or incomplete:

1. Create a temporary lowercase Next.js project outside the target folder.
2. Use TypeScript.
3. Use App Router.
4. Use Tailwind CSS.
5. Use ESLint.
6. Use a `src` directory.
7. Use npm.
8. Copy the generated files into the existing `Graduationcheckin` folder.
9. Preserve `_reference`, `.git`, `.env.local` and any valid existing project files.
10. Delete the temporary setup folder after successful copying.

Do not create a nested Next.js project inside the existing project folder.

## Phase 4: Install Required Packages

Install these runtime dependencies:

```text
@supabase/supabase-js
@supabase/ssr
zod
xlsx
lucide-react
```

Install these development dependencies:

```text
vitest
@vitest/coverage-v8
tsx
```

Do not install a QR scanner library yet.

Do not install deprecated Supabase Auth Helpers packages.

## Phase 5: Environment Configuration

Create or update `.env.example`:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_ENV=development

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

TICKET_TOKEN_SECRET=
```

Create `.env.local` if it does not already exist.

Do not overwrite existing non-empty user values.

Ensure `.env.local` contains the same variable names.

If `TICKET_TOKEN_SECRET` is missing or blank, generate a secure random secret using Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Write the generated value into `.env.local`.

Do not print the final secret in Claude's summary.

The user will manually add:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Phase 6: Environment Validation

Create:

```text
src/lib/env/client.ts
src/lib/env/server.ts
```

Requirements:

### Client environment

May only access:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### Server environment

May access:

```text
APP_ENV
SUPABASE_SERVICE_ROLE_KEY
TICKET_TOKEN_SECRET
```

Use Zod validation.

Do not display secret values in errors.

Development errors should identify missing variable names only.

The project must still be able to build before the user adds real Supabase values.

## Phase 7: Supabase Clients

Create:

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/admin.ts
```

### Browser client

Use:

```text
@supabase/ssr
createBrowserClient
```

Use:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### Server client

Use:

```text
@supabase/ssr
createServerClient
```

Use Next.js cookies correctly.

It must work in Server Components, Route Handlers and Server Actions.

### Admin client

Use:

```text
@supabase/supabase-js
createClient
```

Use:

```text
SUPABASE_SERVICE_ROLE_KEY
```

Requirements:

* Mark the module as server-only.
* Disable session persistence.
* Do not export it through a client-accessible barrel file.
* Do not initialize it during a build when the required secret is absent.
* Never expose it to Client Components.

## Phase 8: Initial Application Screen

Replace the default Next.js page with a professional project foundation screen.

Use:

* Navy
* Gold
* Cream
* White

Show:

```text
Toronto Academy of Education
Graduation Check-In
```

Include a short explanation:

```text
Secure ticket management and fast event check-in for graduates and registered guests.
```

Include development status cards:

* Project configured
* Supabase credentials pending
* Mock data not loaded
* QR tickets not generated
* Scanner not implemented

Include a visible development-mode notice.

Do not include real student information.

The page must be responsive.

Do not use long hyphens or em dashes in user-facing text.

## Phase 9: Health Endpoint

Create:

```text
GET /api/health
```

Example response:

```json
{
  "status": "ok",
  "application": "graduation-checkin",
  "environment": "development",
  "supabaseConfigured": false
}
```

Requirements:

* Do not return environment-variable values.
* Do not return secrets.
* The endpoint must work before Supabase credentials are added.
* `supabaseConfigured` should only indicate whether the public URL and publishable key are present.
* Do not require the service-role key.
* Return an appropriate JSON content type.
* Return HTTP 200 while the application itself is healthy.

## Phase 10: Package Scripts

Ensure `package.json` includes:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Preserve other valid scripts.

## Phase 11: Tests

Add automated tests for:

* Health endpoint application name
* Health endpoint environment value
* Public Supabase configuration detection
* Missing public Supabase credentials
* Configured public Supabase credentials
* Secret values are not returned
* Environment validation does not expose secret values

Tests must use fictional values only.

Tests must not require a real Supabase project.

## Phase 12: README

Update the root `README.md` with:

* Project title
* Project purpose
* Technology stack
* Local installation
* Required environment variables
* Development commands
* Data-protection rules
* `_reference` folder explanation
* Supabase setup status
* Current implementation status
* Planned next features

Clearly state:

```text
Production student information must not be used during application development.
```

## Phase 13: Git Recovery and Validation

Ensure the Git remote is:

```text
https://github.com/sajingeorgemathew/graduatecheckin.git
```

If `origin` does not exist, add it.

If `origin` points somewhere else, correct it after reporting the previous value.

Ensure the branch is:

```text
main
```

Do not force push.

Run:

```powershell
git status
git remote -v
git branch
git diff --check
git ls-files
```

Run this privacy check:

```powershell
git ls-files | Select-String -Pattern "^node_modules/|^\.next/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"
```

The privacy check must return no results.

Also check for staged unsafe files:

```powershell
git diff --cached --name-only | Select-String -Pattern "^node_modules/|^\.next/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"
```

That check must also return no results.

## Phase 14: Quality Checks

Run:

```powershell
npm install
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

Perform a local smoke test without leaving a development server running.

Confirm:

* Home page loads
* Health endpoint responds
* No secrets appear
* No student data appears
* Build completes

## Phase 15: Commit and Push

After all checks pass:

```powershell
git add .
```

Run the staged privacy check again.

Then commit:

```powershell
git commit -m "chore: initialize graduation check-in application"
```

Push:

```powershell
git push -u origin main
```

If the remote contains an existing non-sensitive commit, integrate it safely without force pushing.

If authentication prevents the push, leave the clean commit locally and report the exact push command the user must run.

## Acceptance Criteria

1. The folder contains a valid Next.js application.
2. Required packages are installed.
3. `node_modules` is not tracked.
4. `.next` is not tracked.
5. `.env.local` is not tracked.
6. `_reference` is not tracked.
7. Excel and CSV files are not tracked.
8. The registration workbook remains safely stored locally.
9. Supabase environment placeholders exist.
10. A secure ticket token secret exists locally.
11. Supabase client modules exist.
12. The initial application page is complete.
13. The health endpoint works.
14. Tests pass.
15. ESLint passes.
16. Type checking passes.
17. Production build passes.
18. Git status is clean after commit.
19. The project is pushed to the correct GitHub repository.
20. No student information or secret values are committed.

## Final Report

At completion, report:

1. Initial problems found
2. Recovery actions completed
3. Files moved for privacy
4. Files created
5. Files modified
6. Packages installed
7. Tests added
8. Lint result
9. Type-check result
10. Test result
11. Build result
12. Privacy-check result
13. Commit hash
14. Push result
15. Any issue requiring user action

Do not include secret values or student information in the report.
