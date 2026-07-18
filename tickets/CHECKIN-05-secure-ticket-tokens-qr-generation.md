CHECKIN-05: Secure Ticket Tokens, QR Codes and Ticket Generation
Objective

Implement secure graduation-ticket generation for the Toronto Academy of Education Graduation Check-In application.

This ticket must:

Generate one secure ticket for each eligible graduate registration.
Store only a cryptographic hash of the QR ticket token.
Reconstruct valid QR tokens server-side without storing raw tokens.
Generate scan-ready QR codes.
Create a branded digital graduation-ticket design.
Add administrator-only ticket-management pages.
Support bulk ticket generation.
Prevent duplicate active tickets.
Support secure ticket replacement and revocation.
Create an audit trail for ticket actions.
Prepare reusable ticket-rendering services for CHECKIN-09.
Preserve all registration, authentication and import functionality.

PDF generation and email delivery remain for CHECKIN-09.

Project information

Application:

Graduation Check-In

Organization:

Toronto Academy of Education

Local path:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-05-secure-ticket-generation

Hosted Supabase project reference:

rydqtotlhzgckdxiditt
Existing foundation

CHECKIN-02 created:

graduation_events
graduation_registrations
registration_guests
graduation_tickets
graduation_checkins
Secure server-only Supabase access
Test-event and mock-registration support
A partial uniqueness rule for active tickets, when present

CHECKIN-03 created:

Excel upload and validation
Safe registration upsert
Import history
Registration IDs that remain stable through later imports

CHECKIN-04 created:

Staff login
Scanner, supervisor and administrator roles
Server-side authorization
Administrator-protected imports
Staff management
Audit logging
Next.js Proxy session refresh

Preserve all existing migrations and functionality.

Critical security principles
Never store a raw QR ticket token in the database.
Never write a raw QR token to logs.
Never place a raw token in a page URL, API URL or query string.
Never return raw tokens in ticket-list responses.
Never place raw tokens in analytics or error tracking.
Never expose TICKET_TOKEN_SECRET.
Never expose the Supabase secret or service-role key.
All ticket-management operations require an active administrator.
Do not rely only on hidden navigation or Proxy authorization.
Every page, route handler and mutation must authorize server-side.
Ticket QR images must be rendered only through protected server-side routes.
Tickets must not contain student email addresses or phone numbers.
Ticket QR codes must not directly contain names, student IDs, guest names or payment data.
Do not open or read anything inside _reference.
Do not use real student data in tests.
Do not modify previously deployed migrations.
Do not use long hyphens or em dashes in UI text, documentation or comments.
Dependencies

Install:

npm install qrcode
npm install --save-dev @types/qrcode

Use qrcode only in server-side modules.

Do not import it into a browser Client Component.

Do not install a QR-scanning package. Scanning belongs to CHECKIN-06.

Active event configuration

Add this server-only environment variable:

ACTIVE_GRADUATION_EVENT_CODE=GRAD-2026-DEV

Update:

.env.example
server environment validation
.env.local, adding the variable name only when missing and without displaying existing values
README
import event resolution
ticket event resolution

Requirements:

Replace the hardcoded import event code with ACTIVE_GRADUATION_EVENT_CODE.
Do not accept the active event code from browser input.
Resolve the event server-side.
Reject missing, closed or archived events.
Ensure ticket operations and Excel imports target the same configured event.
Default local development documentation to GRAD-2026-DEV.
Do not expose this as a NEXT_PUBLIC_ variable.

When the real graduation event is ready, the event can be changed through configuration rather than a code change.

Ticket-secret validation

Continue using:

TICKET_TOKEN_SECRET=

Requirements:

Treat the secret as server-only.
Require at least 32 bytes of cryptographic entropy.
Accept the existing Base64-generated secret.
Validate the secret without printing it.
Do not silently generate a replacement during normal runtime.
Fail ticket operations with a safe configuration error when missing or invalid.
Do not break unrelated application pages during build when the secret is absent.
Document that changing this secret after tickets are issued invalidates existing QR tickets.
Never regenerate or rotate the secret automatically.

Create:

scripts/tickets/verify-config.ts

Add:

"tickets:verify-config": "tsx scripts/tickets/verify-config.ts"

The command may print:

Active event code
Whether the ticket secret is configured
Secret length validity
A short one-way SHA-256 fingerprint for administrative comparison

It must never print the secret itself.

Secure ticket-token format

Create a versioned ticket-token service.

Suggested module:

src/features/tickets/token.ts

Use:

Node.js crypto
HMAC SHA-256
Base64URL encoding
Constant-time signature comparison

Token structure:

v1.<ticket-id>.<signature>

Requirements:

The ticket UUID is included as the token identifier.
The signature is an HMAC over the version and ticket UUID.
The signing key is derived from TICKET_TOKEN_SECRET.
The token must be reproducible server-side for the same ticket row.
The token must change when the ticket UUID changes.
A replaced ticket therefore receives a completely different token.
Token verification must reject:
malformed tokens
unknown versions
invalid UUIDs
modified ticket IDs
modified signatures
signatures created with a different secret
Signature comparisons must use constant-time comparison.
Raw tokens must exist only in server memory while rendering or validating.
Raw tokens must never be persisted.
Stored token hash

For every ticket, calculate:

SHA-256(raw ticket token)

Store only the lowercase hexadecimal hash in:

graduation_tickets.token_hash

Requirements:

Hash length must be exactly 64 hexadecimal characters.
Add or preserve a database constraint enforcing that format.
The application must be able to compare a scanned token hash later.
No database column named raw_token, qr_token, token_value or similar may be created.
QR payload

The QR code must contain:

TAE-GRAD1:<raw-ticket-token>

Example structural format only:

TAE-GRAD1:v1.<ticket-id>.<signature>

Requirements:

Do not encode a student name.
Do not encode email.
Do not encode phone.
Do not encode guest details.
Do not encode payment details.
Do not encode the token in an HTTP URL.
Do not create a public ticket-validation route in this ticket.
CHECKIN-06 will read this payload using the staff scanner.
Use a clear versioned prefix so unrelated QR codes can be rejected quickly.
Provide a parser that validates the prefix before token verification.
Human-readable ticket code

Generate a unique backup ticket code such as:

GR26-ABCD-EFGH

Requirements:

Do not derive the code from the student’s name, email, phone or source order ID.
Use cryptographically secure randomness.
Avoid ambiguous characters such as:
0
O
1
I
L
Store the ticket code in graduation_tickets.ticket_code.
Enforce uniqueness in the database.
Retry safely after a rare collision.
Display the ticket code below the QR.
Future staff may use the code as a manual fallback.
Ticket codes are not a replacement for secure QR-token validation.
Eligible registration rules

A ticket may be generated only when:

registration_status = eligible

Requirements:

Do not generate tickets for failed.
Do not generate tickets for cancelled.
Do not generate tickets for review_required.
Do not generate tickets for a registration from another event.
Do not generate a second active ticket when one already exists.
Mirror the registration or event is_test value onto the ticket.
Preserve tickets when the registration is updated by a later Excel import.
A missing email or phone must not prevent generation when the registration remains eligible.
Payment status alone does not determine eligibility in this ticket.
New migration

Create a migration using:

npx supabase migration new extend_secure_ticket_generation

Do not modify previously deployed migration files.

New enum: ticket-generation batch status

Create:

ticket_generation_batch_status

Allowed values:

processing
completed
partial
failed
New enum: ticket activity action

Create:

ticket_activity_action

Allowed values:

generated
replaced
revoked
Extend graduation_tickets

Add:

token_version
generation_batch_id
issued_by
revoked_by
revocation_reason

Requirements:

token_version defaults to 1.
token_version must be positive.
generation_batch_id references ticket_generation_batches.
issued_by may reference auth.users.
revoked_by may reference auth.users.
revocation_reason may be null for active tickets.
Revocation or replacement reasons must be between 5 and 500 characters when provided.
Add indexes for:
generation batch
issued by
revoked by
registration and status
creation date
Preserve existing ticket rows.
Preserve the one-active-ticket-per-registration constraint.
Add a token-hash format constraint.
Never add a raw-token column.
New table: ticket_generation_batches

Create:

public.ticket_generation_batches

Columns:

id
event_id
requested_by
idempotency_key
status
candidate_count
generated_count
skipped_count
error_count
is_test
created_at
completed_at

Requirements:

UUID primary key.
event_id references graduation_events.
requested_by references auth.users.
idempotency_key is required and unique.
Counts must be non-negative.
status defaults to processing.
is_test mirrors the event.
Add indexes for:
event
requested user
status
created date
Enable RLS.
Revoke all privileges from anon.
Revoke all privileges from authenticated.
Do not create public policies.

Do not store names, emails, phone numbers or tokens in this table.

New table: ticket_activity_log

Create:

public.ticket_activity_log

Columns:

id
ticket_id
registration_id
actor_user_id
action
previous_ticket_id
replacement_ticket_id
reason
request_id
metadata
created_at

Requirements:

UUID primary key.
Append-oriented.
ticket_id references graduation_tickets.
registration_id references graduation_registrations.
actor_user_id references auth.users.
previous_ticket_id and replacement_ticket_id may reference tickets.
metadata defaults to an empty JSON object.
Metadata must never contain:
raw tokens
token hashes
ticket secrets
email
phone
guest names
access tokens
cookies
Add indexes for ticket, registration, actor, action and creation time.
Enable RLS.
Revoke privileges from anon.
Revoke privileges from authenticated.
Do not create public policies.
Atomic bulk ticket-generation function

Create:

public.apply_ticket_generation_batch(...)

The exact argument structure may use typed parameters and JSONB items.

Requirements:

Use security definer.
Use an explicit safe search_path.
Verify the actor is an active administrator.
Lock the active event and candidate registrations appropriately.
Require a non-empty idempotency key.
Return the previous result when the same idempotency key was already completed.
Accept only server-generated:
ticket UUID
registration UUID
ticket code
token hash
token version
Reject any JSON item containing a raw token field.
Require every registration to belong to the selected event.
Generate tickets only for eligible registrations.
Skip registrations that already have an active ticket.
Insert tickets as active.
Set issued_at.
Set issued_by.
Set generation_batch_id.
Mirror is_test.
Write one generated activity-log row per inserted ticket.
Update batch counts.
Return:
batch ID
candidate count
generated count
skipped count
error count
Do not create check-ins.
Do not alter registration counts.
Do not alter payment status.
Revoke function execution from:
public
anon
authenticated
Allow trusted server-side invocation only.

The batch must be idempotent and safe against double submission.

Atomic ticket-replacement function

Create:

public.replace_graduation_ticket(...)

Requirements:

Use security definer.
Use a fixed safe search_path.
Verify the actor is an active administrator.
Lock the current ticket and registration.
Require the current ticket to be active.
Require a reason between 5 and 500 characters.
Verify the registration remains eligible.
Accept a server-generated new:
ticket UUID
ticket code
token hash
token version
Create the new ticket as active.
Mark the previous ticket as replaced.
Set replaced_by_ticket_id.
Set the old ticket’s revoked_at.
Set revoked_by.
Store the replacement reason.
Write a replaced activity row.
Ensure the previous QR can no longer be accepted by CHECKIN-06.
Return only ticket IDs, codes and statuses.
Never return a raw token.
Revoke public, anonymous and authenticated execution.
Atomic ticket-revocation function

Create:

public.revoke_graduation_ticket(...)

Requirements:

Use security definer.
Use a fixed safe search_path.
Verify the actor is an active administrator.
Lock the ticket.
Require the ticket to be active.
Require a reason between 5 and 500 characters.
Mark the ticket as revoked.
Set revoked_at.
Set revoked_by.
Store the reason.
Write a revoked activity row.
Do not automatically generate a replacement.
Return status information only.
Revoke public, anonymous and authenticated execution.
Database types

Update:

src/types/database.ts

Include:

ticket_generation_batch_status
ticket_activity_action
New ticket columns
ticket_generation_batches
ticket_activity_log
Database-function argument and return types

Do not use any.

Ticket feature structure

Create a modular structure similar to:

src/features/tickets/
  constants.ts
  types.ts
  schemas.ts
  token.ts
  qr-payload.ts
  qr-renderer.ts
  ticket-code.ts
  eligibility.ts
  permissions.ts
  repository.ts
  service.ts
  generation.ts
  replacement.ts
  revocation.ts
  summaries.ts
  errors.ts
  components/
    ticket-card.tsx
    ticket-status-badge.tsx
    ticket-list.tsx
    ticket-filters.tsx
    generation-preview.tsx
    activity-timeline.tsx

Keep route handlers and server actions thin.

Do not put all ticket logic in a page or route file.

Administrator permissions

Add:

canManageTickets()

Requirements:

Administrator: allowed
Supervisor: denied
Scanner: denied
Anonymous: denied
Inactive staff: denied
Staff requiring a password change: redirected to password-change flow

Every ticket page and every ticket mutation must independently require administrator authorization.

Administrator ticket routes

Create:

/admin/tickets
/admin/tickets/generate
/admin/tickets/[ticketId]

Add Ticket Management to the administrator navigation and administrator landing page.

Do not show the ticket-management link to scanners or supervisors.

Ticket-management page

Route:

/admin/tickets

Display summary cards:

Eligible registrations
Active tickets
Eligible without tickets
Revoked tickets
Replaced tickets
Blocked registrations

Display a searchable and paginated ticket table.

Columns:

Graduate
Ticket code
Party size
Registration status
Ticket status
Issued date
Actions

Search must support:

Graduate name
Ticket code
Source registration ID

Do not search by email or phone by default.

Filters:

All
Active
Not generated
Revoked
Replaced
Blocked
Test
Production

Requirements:

25 rows per page.
Desktop table.
Mobile card layout.
Status badges.
No raw tokens.
No token hashes.
No private contact information.
Link to ticket detail.
Link to bulk generation.
Bulk-generation preview page

Route:

/admin/tickets/generate

Display:

Active event
Event test or production status
Eligible registrations without active tickets
Registrations already holding active tickets
Failed registrations
Cancelled registrations
Review-required registrations
Selected candidate count

Allow:

Select all eligible registrations
Select individual eligible registrations
Search by graduate name or source registration ID
Pagination
Clear selection

Requirements:

Only eligible registrations without active tickets may be selected.
Recheck eligibility server-side at submission.
Require exact confirmation text:
GENERATE TICKETS
Require an idempotency key.
Disable repeated submission while processing.
Do not generate QR tokens in the browser.
Generate ticket IDs, ticket codes, token hashes and batch data server-side.
Do not return raw tokens after the operation.
Redirect to a generation result summary.
Show generated and skipped counts.
Ticket-detail page

Route:

/admin/tickets/[ticketId]

Display:

Digital ticket preview
Graduate name
Event information
Registered party counts
Ticket code
Ticket status
Issued date
Issued-by staff display name, when available
Replacement or revocation details
Ticket activity timeline
Replace Ticket action
Revoke Ticket action
Return to Ticket Management

Do not display:

Email
Phone
Source order payment details
Raw token
Token hash
Secret values
Protected QR image route

Create:

GET /api/admin/tickets/[ticketId]/qr

Requirements:

Require an authenticated active administrator.
Accept only a validated ticket UUID.
Load the ticket server-side.
Reconstruct the ticket token server-side.
Build the versioned QR payload.
Render a QR image using qrcode.
Return SVG or PNG.
Prefer SVG for the on-screen preview.
Use black modules on a white background.
Use error-correction level Q.
Use a quiet margin.
Do not embed a logo inside the QR.
Set:
Cache-Control: private, no-store
Do not put the token in:
response headers
filename
URL
alt text
logs
Reject revoked or replaced tickets from ordinary active-ticket rendering unless an administrator is viewing an explicitly watermarked historical preview.
The route URL must contain only the ticket UUID, never the raw token.
Digital ticket design

Create a polished and reusable ticket component.

Suggested component:

src/features/tickets/components/ticket-card.tsx

The visual style must use:

Navy
Gold
Cream
White
Standard black-and-white QR code

Use the existing Toronto Academy logo or branding asset when available in public.

Do not invent or duplicate logo files.

Ticket format

Create a landscape digital-ticket layout suitable for:

Desktop preview
Mobile viewing
Future PDF export
Future email attachment
Future office printing

Suggested approximate ratio:

1.7:1 landscape

Do not create a final PDF in this ticket.

Required ticket content

Display:

Toronto Academy of Education
Graduation Ceremony
Graduate Admission Ticket
Graduate name
Event date and time
Venue name
Venue address
Registered adult guests
Children age 0 to 4
Children age 5 to 10
Total registered party
Ticket code
QR code
Present this ticket at the entrance

Use the event values from the database.

Do not hardcode venue or ceremony time.

Ticket privacy

Do not display:

Email
Phone number
Source order ID
Guest names
Payment amount
Payment status
Internal notes
Database UUIDs
Token hash
Raw token
Ticket messaging

Use wording similar to:

Present this ticket at the entrance. Event staff will scan the QR code and confirm attendance for the graduate and registered party.

Include:

This ticket is unique to this registration. Do not share or duplicate it.

Do not claim that a ticket can be used only once because CHECKIN-07 may allow partial party arrivals.

QR section

Place the QR code inside a plain white card with sufficient whitespace.

Display the human ticket code directly below it.

Do not place decorative elements inside the QR quiet zone.

Status treatments

Active:

Normal ticket design
Status label Active

Revoked:

Large REVOKED watermark
Reduced QR emphasis
QR must not be presented as usable

Replaced:

Large REPLACED watermark
Show replacement notice
Link administrators to the current ticket

Pending:

Pending status label
Not considered ready for use
Accessibility
Use semantic headings.
Ensure high contrast.
Provide useful QR-image alt text without including the token.
Ensure status is not communicated by colour alone.
Maintain readable text when zoomed.
Preserve keyboard navigation for administrative actions.
Print preparation

Add print-oriented CSS so the ticket preview prints cleanly from the browser.

Requirements:

Hide administrator navigation during print.
Print only the ticket.
Preserve the QR.
Avoid splitting the ticket across pages.
Do not claim this is the final PDF system.
CHECKIN-09 will create controlled PDF files and email distribution.
Ticket replacement interface

On the ticket-detail page:

Show a Replace Ticket action for active tickets.
Require a reason.
Require exact confirmation:
REPLACE TICKET
Generate a new ticket ID, code and token hash server-side.
Call the atomic database replacement function.
Redirect to the new ticket.
Clearly show that the previous ticket is replaced.
Do not expose the new raw token.
Do not allow replacement of revoked, replaced or pending tickets.
Prevent double submission.
Ticket revocation interface

On the ticket-detail page:

Show a Revoke Ticket action for active tickets.
Require a reason.
Require exact confirmation:
REVOKE TICKET
Call the atomic database revocation function.
Clearly mark the ticket as revoked.
Do not automatically generate a replacement.
Do not permit the revoked ticket to return to active status.
A new ticket must be created through the replacement process when needed.
Prevent double submission.
Ticket-generation audit behavior

Record:

Generated ticket
Replaced ticket
Revoked ticket
Acting administrator
Timestamp
Reason for replacement or revocation
Request ID

Never record:

Raw token
Token hash in audit metadata
Student contact information
Passwords
Auth tokens
Cookies
API or server-action requirements

Implement protected operations for:

Ticket-list retrieval
Candidate preview
Bulk ticket generation
Ticket detail
Ticket QR rendering
Ticket replacement
Ticket revocation

Requirements:

Validate user session.
Require administrator role.
Validate all inputs with Zod.
Determine actor ID from the trusted session.
Resolve the active event server-side.
Use the server-only Supabase administration client.
Return structured errors.
Do not return stack traces.
Do not return raw tokens.
Do not return token hashes.
Do not accept an event code from the browser.
Use no-store for private ticket data.
Do not log QR payloads.
Do not place ticket tokens in redirect URLs.
Ticket generation configuration script

Create:

scripts/tickets/verify-config.ts

Add:

"tickets:verify-config": "tsx scripts/tickets/verify-config.ts"

The script must:

Load .env.local.
Verify the active event code is present.
Verify the ticket secret is valid.
Verify Supabase server credentials exist.
Optionally confirm the configured event exists.
Print test or production event status.
Print registration eligibility counts only.
Print no names, emails, phone numbers or tokens.
Modify nothing.
Exit nonzero on unsafe configuration.
Tests

Add comprehensive automated tests.

Ticket-token tests
Token is reproducible for the same ticket ID and secret.
Different ticket IDs produce different tokens.
Different secrets produce different signatures.
Valid token verifies.
Modified ticket ID fails.
Modified signature fails.
Unknown token version fails.
Invalid UUID fails.
Malformed token fails.
Constant-time comparison path is used.
Token hash is deterministic.
Token hash is 64 lowercase hexadecimal characters.
Raw tokens are never placed in persistence objects.
QR payload tests
Correct TAE-GRAD1: prefix.
Valid token can be extracted.
Unknown prefixes are rejected.
Blank payload is rejected.
Personal information is not included.
QR renderer returns valid SVG.
QR renderer uses a white background and black modules.
Raw payload is not printed as visible text in the SVG.
QR route has private, no-store.
QR route requires administrator access.
Ticket-code tests
Correct format.
Allowed character set only.
Ambiguous characters excluded.
Cryptographically secure randomness source.
Collision retry behavior.
No student information is used.
Eligibility tests
Eligible registration may receive a ticket.
Failed registration is blocked.
Cancelled registration is blocked.
Review-required registration is blocked.
Wrong-event registration is blocked.
Existing active ticket is skipped.
Revoked ticket does not count as active.
Replaced ticket does not count as active.
Test status mirrors the event or registration.
Bulk-generation tests
Selected eligible registrations generate tickets.
Existing active-ticket registrations are skipped.
Double submission returns the same batch result.
Duplicate active tickets are prevented.
Generated tickets are active.
Issued time and actor are recorded.
No check-ins are created.
No registration values are changed.
No raw tokens are returned.
No token hashes are returned to browser-facing responses.
Replacement tests
Active ticket can be replaced.
New ticket receives a different ticket ID.
New ticket receives a different token.
Old ticket becomes replaced.
Replacement link is recorded.
Old QR becomes invalid by status.
Reason is required.
Non-administrator is denied.
Double replacement is blocked.
Revoked ticket cannot be replaced through the active-ticket flow.
Revocation tests
Active ticket can be revoked.
Reason is required.
Actor is recorded.
Revoked ticket cannot be revoked again.
Revocation does not create a replacement.
Scanner and supervisor are denied.
Authorization tests
Anonymous denied.
Scanner denied.
Supervisor denied.
Administrator allowed.
Inactive administrator denied.
Password-change-required administrator is redirected.
Proxy is not the only authorization layer.
Every mutation performs a server-side role check.
Ticket-design tests
Graduate name is displayed.
Event date is database-driven.
Venue is database-driven.
Party counts are displayed.
Ticket code is displayed.
Email is not displayed.
Phone is not displayed.
Payment data is not displayed.
Source order ID is not displayed.
Active status is visible.
Revoked watermark appears.
Replaced watermark appears.
QR image URL contains ticket ID only.
Migration-safety tests

Verify:

Previous migrations are unchanged.
Batch table exists.
Activity table exists.
New ticket columns exist.
RLS is enabled on new tables.
Anonymous privileges are revoked.
Authenticated privileges are revoked.
No public policies exist.
No raw-token column exists.
Token-hash format constraint exists.
One-active-ticket uniqueness remains.
Bulk function is security definer.
Replacement function is security definer.
Revocation function is security definer.
Safe search paths exist.
Public function execution is revoked.
Functions verify an active administrator.
Regression tests
Staff authentication tests continue to pass.
Import tests continue to pass.
Mock-data tests continue to pass.
Existing check-in tables remain unchanged.
Existing import upsert does not remove tickets.

Tests must not modify the hosted Supabase project.

Homepage and administrator status updates

Update the public homepage cards:

Application configured
Complete

Database and mock data
Complete

Excel import workflow
Administrator protected

Staff authentication
Complete

Secure ticket generation
Ready for protected testing

QR scanner
Not implemented

Update /admin with:

Ticket Management
Generate, preview, replace and revoke secure graduation tickets.

Do not display ticket counts publicly.

README updates

Document:

Ticket-token architecture
Why raw tokens are never stored
HMAC token reconstruction
Token-hash storage
Human-readable backup codes
QR payload format
Active event configuration
Bulk generation
Replacement and revocation
Ticket-design privacy
Print-preview limitations
CHECKIN-06 scanner dependency
CHECKIN-09 PDF and email dependency
Manual migration deployment
Vercel environment requirements

Prominently include:

Never change TICKET_TOKEN_SECRET after tickets have been issued unless every existing ticket will be replaced.

Also include:

Never expose raw ticket tokens in logs, URLs, database records or analytics.
Environment variables

Continue using:

NEXT_PUBLIC_APP_URL
APP_ENV
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TICKET_TOKEN_SECRET

Add:

ACTIVE_GRADUATION_EVENT_CODE

No other new Vercel variable should be required.

Package scripts

Add:

{
  "tickets:verify-config": "tsx scripts/tickets/verify-config.ts"
}

Preserve all existing scripts.

Out of scope

Do not implement:

QR camera scanning
Ticket-validation API for scanners
Graduate check-in
Guest check-in
Partial party arrival
Manual entry
Attendance dashboard
Supervisor corrections
Public ticket portal
Ticket PDF generation
Email ticket distribution
Google Apps Script integration
Assigned seating
Payment collection
Event selection UI
Multiple simultaneous active events
Public QR validation
QR logos
Auth changes unrelated to ticket access
Required quality checks

Run:

npm run tickets:verify-config
npm run db:validate:mock
npm run db:generate:mock-import
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

tickets:verify-config may report that the new migration is not yet deployed. It must not modify hosted data.

Do not run:

npx supabase db push
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

Search tracked project files for accidental:

raw QR tokens
hardcoded ticket secrets
Supabase secret values
token hashes in UI responses
access tokens
refresh tokens
session cookies
real student data

Do not search inside _reference.

Acceptance criteria
A new migration extends secure ticket generation.
Previous migrations remain unchanged.
Active event resolution is server-configured.
Imports use the same configured event.
Raw ticket tokens are never stored.
Raw ticket tokens are never logged.
Raw ticket tokens are never placed in URLs.
Ticket tokens use versioned HMAC signatures.
Token verification rejects tampering.
Token hashes are stored securely.
QR payload contains no personal information.
QR images are generated server-side.
QR image routes require administrator access.
Human ticket codes are unique and non-personal.
Failed, cancelled and review-required registrations are blocked.
Eligible registrations can receive tickets.
Duplicate active tickets are prevented.
Bulk generation is idempotent.
Replacement invalidates the old ticket.
Revocation invalidates the ticket.
Ticket actions are audited.
Administrator ticket pages are complete.
Scanner and supervisor access is denied.
Digital ticket design is complete.
Ticket privacy rules are enforced.
Print-preview styling exists.
No PDF is created in this ticket.
No ticket email is sent.
No scanning workflow is created.
Database types are updated.
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
Migration filename
Active-event configuration
Ticket-token architecture
Token-hash behavior
QR payload and rendering
Human ticket-code format
Database changes
Generation-batch behavior
Replacement behavior
Revocation behavior
Ticket audit behavior
Administrator routes
Ticket design
Files created
Files modified
Packages added
Tests added
Test result
Lint result
Type-check result
Build result
Configuration-verification result
Privacy-check result
Manual Supabase steps remaining
Manual Vercel steps remaining
Assumptions
Issues requiring review

Do not include:

raw ticket tokens
token hashes
secrets
full staff emails
UUIDs
student contact details
real student information

Do not commit and do not push.