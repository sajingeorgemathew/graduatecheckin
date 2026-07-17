CHECKIN-04: Staff Authentication and Access Roles
Objective

Implement secure staff authentication and role-based access for the Toronto Academy of Education Graduation Check-In application.

This ticket must:

Add email and password login using Supabase Auth.
Prevent public account registration.
Protect all staff and administrator routes.
Implement scanner, supervisor and administrator roles.
Allow administrators to create and manage staff accounts.
Require newly created staff to change their temporary password.
Replace the CHECKIN-03 development-only import gate with administrator authentication.
Keep all registration and import data behind trusted server-side authorization.
Record important staff-account administration actions.
Provide a safe process for creating the first administrator.
Project information

Application:

Graduation Check-In

Organization:

Toronto Academy of Education

Local path:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-04-staff-authentication

Hosted Supabase project reference:

rydqtotlhzgckdxiditt
Existing foundation

CHECKIN-02 created:

Core graduation tables
staff_profiles
Staff roles:
scanner
supervisor
administrator
Row Level Security
Server-only Supabase administration client

CHECKIN-03 created:

Excel upload
Import preview
Import validation
Safe registration upsert
/admin/imports
Temporary APP_ENV and ENABLE_DEV_IMPORTS access protection

Preserve all existing migrations and functionality.

Authentication design

Use Supabase email and password authentication.

Requirements:

Use the existing @supabase/ssr package.
Use cookie-based sessions.
Use the existing browser and server clients.
Use signInWithPassword for login.
Use auth.getUser() on the server for trusted user verification.
Do not trust client-supplied user IDs or roles.
Do not trust role information stored in browser state.
Do not implement public signup.
Do not create a /signup route.
Do not expose auth.admin methods to browser code.
Use the server-only Supabase administration client for account management.
Do not add social login.
Do not add magic-link login.
Do not add multifactor authentication in this ticket.
Do not implement email invitations in this ticket.
Do not depend on email delivery for normal account creation.

Supabase password authentication supports signing in with an email address and password. Administrative user creation must be performed from trusted server code.

Account creation approach

Administrators create staff accounts from the application.

The system must:

Accept:
staff email
display name
role
Generate a cryptographically secure temporary password.
Create the Supabase Auth user server-side.
Mark the Auth email as confirmed.
Create the related staff_profiles row.
Set must_change_password to true.
Display the temporary password exactly once.
Never store the temporary password in the database.
Never write the temporary password to logs.
Never include it in analytics or error reporting.
Require the administrator to copy it before leaving the result screen.
Require the new staff member to change it after first login.

If Auth user creation succeeds but staff-profile creation fails:

Attempt to delete the newly created Auth user.
Return a structured error.
Do not leave an unapproved staff account behind.
Staff role hierarchy

Use this hierarchy:

scanner
supervisor
administrator

Role capabilities:

Scanner

May access:

/staff

Future capabilities:

QR scanning
Basic ticket validation
Standard check-in

Scanner functionality itself remains for CHECKIN-06 and CHECKIN-07.

A scanner may not access:

Excel imports
Staff management
Supervisor corrections
Administrative settings
Supervisor

May access:

/staff

Future capabilities:

All scanner functions
Manual search
Check-in corrections
Event dashboard

Those operational features remain for later tickets.

A supervisor may not access:

Excel imports
Staff-account management
Administrator settings
Administrator

May access:

/staff
/admin
/admin/imports
/admin/staff

Administrators may:

Upload and apply registration imports
View import history
Create staff accounts
Change staff roles
Activate or deactivate staff
Reset a staff member’s temporary password
Access all future supervisor and scanner functions
New migration

Create a new migration using:

npx supabase migration new extend_staff_authentication

Do not modify previously deployed migrations.

Extend staff_profiles

Add these columns when absent:

email_snapshot
must_change_password
last_login_at
created_by
updated_by

Requirements:

email_snapshot is required for new staff profiles.
Store normalized lowercase email.
must_change_password defaults to true.
last_login_at may be null.
created_by may reference auth.users.
updated_by may reference auth.users.
Preserve all existing rows.
Existing rows should receive a safe migration-compatible default.
Add an index for lowercase email.
Add an index for active status and role.
Do not store password hashes or passwords in staff_profiles.
New table: staff_access_audit_log

Create:

public.staff_access_audit_log

Columns:

id
actor_user_id
target_user_id
action
previous_values
new_values
reason
request_id
created_at

Allowed actions:

staff_created
role_changed
staff_activated
staff_deactivated
temporary_password_reset
password_changed
login_blocked

Requirements:

UUID primary key.
Append-oriented table.
actor_user_id may reference auth.users.
target_user_id may reference auth.users.
previous_values is JSON.
new_values is JSON.
Never store a password in either JSON column.
Never store an access token, refresh token or session cookie.
request_id should support tracing without exposing secrets.
Add indexes for actor, target, action and created time.
Enable Row Level Security.
Revoke all privileges from anon.
Revoke all privileges from authenticated.
Do not create public policies.
Access must remain through trusted server-side code.
Database helper for the final active administrator

Create a safe database function or transactional service that determines whether a role change or deactivation would remove the final active administrator.

Requirements:

There must always be at least one active administrator.
An administrator cannot deactivate themselves.
An administrator cannot demote themselves.
The final active administrator cannot be demoted.
The final active administrator cannot be deactivated.
Concurrent requests must not bypass this protection.
Do not rely only on a client-side count.
Return a structured error when the action is blocked.
Session refresh and Next.js Proxy

Create:

src/proxy.ts

Use the Next.js 16 Proxy convention.

Responsibilities:

Refresh Supabase authentication cookies when needed.
Preserve request and response cookies correctly.
Redirect unauthenticated users from protected route groups to /login.
Preserve a safe relative next destination.
Redirect an already authenticated staff user away from /login.
Do not perform final role authorization only in Proxy.
Do not query registration data from Proxy.
Avoid redirect loops.
Exclude static assets, images and Next.js internals using a safe matcher.

Next.js 16 renamed the former Middleware convention to Proxy. Proxy may provide an early route check, but sensitive page and mutation authorization must still occur close to the protected data operation.

Authentication modules

Create a structure similar to:

src/features/auth/
  constants.ts
  types.ts
  schemas.ts
  password-policy.ts
  temporary-password.ts
  session.ts
  guards.ts
  permissions.ts
  repository.ts
  service.ts
  errors.ts
  redirects.ts

Create staff-administration modules similar to:

src/features/staff/
  types.ts
  schemas.ts
  repository.ts
  service.ts
  audit.ts
  components/

Keep route handlers and server actions thin.

Trusted session model

Create a trusted staff-session type containing only:

userId
email
displayName
role
isActive
mustChangePassword

Create:

getOptionalStaffSession()
requireStaffSession()
requireScanner()
requireSupervisor()
requireAdministrator()

Requirements:

Validate the Supabase Auth user using auth.getUser().
Look up the staff profile using trusted server-side access.
Reject missing staff profiles.
Reject inactive staff profiles.
Reject deleted or invalid Auth users.
Normalize email consistently.
Do not accept a role from form data, query parameters, headers or cookies.
Do not cache authorization decisions across users.
Use no-store for private staff information.
Required authorization matrix

Protect these existing routes:

/admin
/admin/imports
/admin/imports/new
/admin/imports/[importId]

Required role:

administrator

Protect these existing API routes:

/api/admin/imports
/api/admin/imports/*

Required role:

administrator

Every route handler and every mutation must perform its own server-side authorization.

Do not depend exclusively on:

Proxy
Hidden navigation
Disabled buttons
Client-side role checks
Development environment flags
Replace the CHECKIN-03 development gate

Remove ENABLE_DEV_IMPORTS as the primary authorization requirement.

Requirements:

Imports must be available to authenticated administrators in development, preview and production.
Imports must be denied to anonymous users.
Imports must be denied to scanners.
Imports must be denied to supervisors.
Existing workbook privacy, validation and safe-upsert protections must remain unchanged.
The event remains fixed to GRAD-2026-DEV until a later event-management ticket.
Do not expose real registration data publicly.

Remove or deprecate:

ENABLE_DEV_IMPORTS

from:

.env.example
import authorization logic
README instructions

Do not remove the general production-safe protections around workbook parsing and applying imports.

Public login page

Create:

/login

Design:

Toronto Academy of Education branding
Navy, gold, cream and white
Mobile responsive
Email field
Password field
Show-password control
Sign In button
Clear loading state
Generic authentication error
Contact-administrator message for password assistance
No public signup link

Suggested heading:

Staff Sign In

Suggested supporting text:

Authorized staff may sign in to manage graduation registration and event check-in.

Security requirements:

Normalize email to lowercase.
Do not reveal whether an email account exists.
Use the same visible error for invalid email, invalid password, missing profile or inactive account.
Do not log passwords.
Do not place credentials in a URL.
Redirect successful logins to the validated next path or /staff.
Reject external redirect destinations.
Update last_login_at after a fully authorized login.
If the profile is inactive or missing, sign out immediately.
If must_change_password is true, redirect to /staff/change-password.
Password policy

Require:

At least 12 characters
At least one uppercase letter
At least one lowercase letter
At least one number
At least one symbol
Maximum 128 characters
No leading or trailing whitespace
New password and confirmation must match

Apply the policy to:

Temporary password generation
Required first-login password change
Administrator-triggered temporary-password reset

Do not store passwords.

Change-password page

Create:

/staff/change-password

Requirements:

Requires an authenticated active staff account.
Available while must_change_password is true.
Also accessible later from the account menu.
Accept:
current password
new password
confirm new password
Reauthenticate using the current password before changing it.
Update the Auth password.
Set must_change_password to false.
Write a password-changed audit event without storing any password.
Redirect to the correct authorized landing page.
Display clear validation messages.
Do not expose Supabase internal errors.
Do not permit access to normal protected application pages until the required change is completed.

Supabase supports password updates and can verify the current password when changing credentials with recent client versions.

Sign-out action

Implement secure sign out:

POST /auth/signout

or an equivalent server action.

Requirements:

Sign out through Supabase.
Clear the application session cookies correctly.
Redirect to /login.
Do not use a GET request for a state-changing sign-out operation.
Make the action available from the protected navigation.
Staff application shell

Create a protected layout for staff routes.

Display:

Toronto Academy of Education
Graduation Check-In
Signed-in staff display name
Current role badge
Navigation permitted for the role
Change Password
Sign Out

Do not show links the user cannot access.

Hidden navigation is only a usability feature. Server authorization must remain authoritative.

Staff landing page

Create:

/staff

Display:

Welcome message
Staff name
Role
Current authorized tools
Event system status

Role-specific cards:

Scanner
QR scanner
Available in CHECKIN-06
Supervisor
QR scanner
Available in CHECKIN-06

Dashboard and corrections
Available in CHECKIN-08
Administrator
Registration imports
Available now

Staff accounts
Available now

QR ticket generation
Available in CHECKIN-05

Do not display private registration information on the landing page.

Administrator landing page

Create or update:

/admin

Required role:

administrator

Display links to:

Registration Imports
Staff Accounts
Future Ticket Management
Future Event Dashboard
Staff management page

Create:

/admin/staff

Display:

Display name
Email
Role
Active or inactive status
Password-change requirement
Last login date
Created date
Actions

Filters:

All
Active
Inactive
Scanner
Supervisor
Administrator

Requirements:

Pagination
Responsive desktop table
Responsive mobile cards
No passwords
No tokens
No session information
No Auth provider internals
Create-staff page

Create:

/admin/staff/new

Fields:

Email
Display name
Role

On success, show:

Account created
Staff email
Role
Temporary password
Copy button
Warning that the password will not be shown again
Done button

Do not include the temporary password in:

Query strings
redirect parameters
database rows
server logs
audit-log JSON
browser storage
analytics
Staff-account actions

Administrators may:

Change role
Scanner to supervisor
Scanner to administrator
Supervisor to scanner
Supervisor to administrator
Administrator to scanner
Administrator to supervisor

Apply final-administrator safeguards.

Deactivate staff
Set is_active to false.
Existing sessions must be blocked on their next protected request.
Do not delete the Auth user.
Do not delete historical audit information.
Prevent self-deactivation.
Prevent deactivation of the final active administrator.
Reactivate staff
Set is_active to true.
Preserve the existing role.
Write an audit event.
Reset temporary password
Generate a secure new temporary password.
Update the Supabase Auth password server-side.
Set must_change_password to true.
Show the new temporary password exactly once.
Write an audit event without the password.
Delete staff

Out of scope.

Do not implement destructive Auth-user deletion through the staff UI.

Initial administrator state

The system must handle this situation:

No administrator profile exists yet

Requirements:

Do not create a public bootstrap endpoint.
Do not create a browser form that promotes an arbitrary user.
Do not allow the first authenticated user to become administrator automatically.
Document the one-time manual Supabase setup.
Provide a verification script that checks whether an active administrator exists.
The verification script must print counts and masked email only.

Add:

scripts/auth/verify-administrator.ts

Package script:

"auth:verify-admin": "tsx scripts/auth/verify-administrator.ts"

The script must:

Load .env.local.
Use server-only credentials.
Count active administrators.
Exit nonzero when none exist.
Never create or modify an administrator.
Never print credentials.
Never print a full email address.
API and server-action security

Every protected operation must:

Validate the Supabase Auth user.
Validate an active staff profile.
Validate the required role.
Validate input using Zod.
Use server-only database or Auth administration clients.
Return structured errors.
Avoid exposing stack traces.
Avoid returning secret values.
Avoid open redirects.
Avoid accepting actor IDs from the browser.
Determine the acting user from the authenticated session.
Create audit events for staff-account changes.
Role checks

Create reusable helpers such as:

hasMinimumRole()
canAccessAdmin()
canManageStaff()
canImportRegistrations()

Do not compare roles alphabetically.

Use an explicit hierarchy or permissions map.

Error behavior

Use:

401 for no valid authentication
403 for authenticated but insufficient or inactive access
404 when hiding sensitive resource existence is appropriate
409 for conflicting staff state
422 for validation problems

Do not display whether a particular staff email exists during login.

Auth configuration documentation

Document these Supabase Dashboard settings:

Authentication provider

Email authentication must remain enabled.

Public signup

Disable public email signup.

Site URL

Set to the production Vercel domain.

Redirect URLs

Include:

http://localhost:3000/**
https://YOUR-PRODUCTION-DOMAIN/**

This ticket does not use invitation or password-reset email delivery, but correct Site URL and redirect settings should still be documented for future flows. Supabase uses configured Site URLs and redirect allowlists for email-based confirmation and recovery flows.

Homepage status

Update the public homepage status cards:

Application configured
Complete

Database migration deployed
Complete

Mock data loaded
Complete

Supabase project connected
Complete

Excel import workflow
Administrator protected

Staff authentication
Ready for setup

QR ticket generation
Not implemented

Do not display staff identities publicly.

TypeScript database types

Update:

src/types/database.ts

Include:

New staff_profiles columns
staff_access_audit_log
Audit action union types
Insert and update types

Do not use any.

Tests

Add comprehensive tests.

Authentication tests
Valid email and password login
Invalid credentials return a generic error
Missing profile is rejected
Inactive profile is rejected
Scanner login succeeds
Supervisor login succeeds
Administrator login succeeds
Required password change redirects correctly
Safe next redirect
External redirect rejection
Sign-out clears the session
Password tests
Temporary password meets policy
Temporary passwords are non-deterministic
Minimum length
Uppercase requirement
Lowercase requirement
Number requirement
Symbol requirement
Maximum length
Password confirmation
No passwords appear in logs or audit values
Authorization tests
Anonymous user cannot access /staff
Anonymous user cannot access /admin
Scanner cannot access imports
Scanner cannot manage staff
Supervisor cannot access imports
Supervisor cannot manage staff
Administrator can access imports
Administrator can manage staff
Proxy is not the only authorization layer
Every import mutation requires administrator access
Staff administration tests
Administrator creates scanner
Administrator creates supervisor
Administrator creates administrator
Duplicate staff email is rejected safely
Auth-user cleanup occurs after profile-creation failure
Role change writes an audit event
Deactivation writes an audit event
Reactivation writes an audit event
Password reset writes an audit event
Temporary password is returned only once
Self-deactivation is blocked
Self-demotion is blocked
Final administrator deactivation is blocked
Final administrator demotion is blocked
Inactive staff session is blocked
Migration safety tests

Verify:

Existing migration files are unchanged
New staff columns exist
Audit table exists
Audit RLS is enabled
anon privileges are revoked
authenticated privileges are revoked
No public policies exist
No password column exists
No token column exists in staff tables
Final-administrator database safeguard exists
Import regression tests
Administrator can access import history
Administrator can upload and preview
Administrator can apply an import
Scanner cannot upload
Supervisor cannot upload
Anonymous user cannot upload
Existing import validation tests continue to pass
No development feature flag is required after login

Tests must not connect to or modify the hosted Supabase project.

README updates

Document:

Authentication architecture
Staff roles
Route authorization matrix
Temporary password flow
Required password-change flow
Staff management
Initial administrator setup
Supabase Dashboard configuration
Production Vercel behavior
Audit logging
Security limitations
Next ticket

Remove outdated language stating that imports are development-only.

Add:

Public signup must remain disabled.

Add:

Never expose Supabase administrative credentials to client components.
Package scripts

Add:

{
  "auth:verify-admin": "tsx scripts/auth/verify-administrator.ts"
}

Preserve all existing scripts.

Environment variables

Do not add a new authentication secret.

Continue using:

NEXT_PUBLIC_APP_URL
APP_ENV
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TICKET_TOKEN_SECRET

Remove or deprecate:

ENABLE_DEV_IMPORTS

No new Vercel environment variable should be required for CHECKIN-04.

Out of scope

Do not implement:

Public signup
Magic links
Email invitations
Custom SMTP
Email password recovery
Social login
Multifactor authentication
Passkeys
Auth-user deletion
Event selection
Multiple active events
QR generation
Ticket design
QR scanning
Check-in processing
Live attendance dashboard
Supervisor correction tools
Ticket PDFs
Ticket email distribution
Required quality checks

Run:

npm run db:validate:mock
npm run db:generate:mock-import
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

Run:

npm run auth:verify-admin

Before the initial administrator is created, this command may exit nonzero with a clear message. That expected result must not fail the implementation ticket.

The script must never modify hosted data.

Privacy checks

Run:

git ls-files |
    Select-String -Pattern "^node_modules/|^\.next/|^tmp/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"

Expected:

No output

Run:

git diff --name-only |
    Select-String -Pattern "^tmp/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"

Expected:

No output

Search tracked project files for:

Temporary passwords
Full secrets
Service-role values
Access tokens
Refresh tokens
Session cookies

Do not search inside _reference.

Acceptance criteria
Email and password staff login works.
Public signup does not exist.
Next.js Proxy refreshes authentication cookies.
Sensitive authorization occurs server-side.
Scanner, supervisor and administrator roles are enforced.
Anonymous users cannot access protected routes.
Scanner and supervisor users cannot access Excel imports.
Administrators can access Excel imports.
Import routes no longer depend on the development flag.
Administrators can create staff accounts.
Temporary passwords are securely generated.
Temporary passwords are displayed once only.
Temporary passwords are never stored.
New staff must change their temporary password.
Staff can securely change their password.
Administrators can change staff roles.
Administrators can activate and deactivate staff.
Administrators can reset a temporary password.
Self-deactivation is blocked.
Self-demotion is blocked.
The final active administrator is protected.
Important staff changes are audited.
Inactive accounts are blocked.
Existing import functionality remains working.
Existing migrations remain unchanged.
New migration is complete.
TypeScript database types are updated.
Tests pass.
ESLint passes.
Type checking passes.
Production build passes.
Privacy checks pass.
_reference remains untouched.
Claude does not run supabase db push.
Claude does not commit or push.
Final report

Report:

Current branch
Migration created
Staff-profile changes
Audit table and safeguards
Authentication flow
Proxy implementation
Password policy
Staff role enforcement
Import authorization changes
Staff administration features
Files created
Files modified
Packages added
Tests added
Test result
Lint result
Type-check result
Build result
Privacy-check result
Administrator verification result
Manual Supabase steps remaining
Manual Vercel steps remaining
Assumptions
Issues requiring review

Do not report temporary passwords, full staff emails, UUIDs, sessions or secrets.

Do not commit or push.