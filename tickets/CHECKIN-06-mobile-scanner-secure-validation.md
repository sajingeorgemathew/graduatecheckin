CHECKIN-06: Mobile Staff Scanner and Secure Ticket Validation
Objective

Implement the secure mobile QR scanner and ticket-validation workflow for the Toronto Academy of Education Graduation Check-In application.

This ticket must:

Allow authorized staff to scan graduation-ticket QR codes using a phone camera.
Validate QR payload format and cryptographic signature server-side.
Verify the stored ticket-token hash.
Validate ticket, registration and active-event status.
Detect revoked and replaced tickets.
Resolve the latest ticket when an old replaced ticket is scanned.
Display existing registration-level attendance state without recording new attendance.
Support exact manual lookup using the human-readable ticket code.
Record privacy-safe ticket-validation attempts.
Provide a fast, mobile-first staff interface.
Avoid duplicate validation requests caused by continuous camera scanning.
Preserve all authentication, import and ticket-management functionality.

CHECKIN-06 validates tickets only.

Graduate, guest and child admission confirmation belongs to CHECKIN-07.

Project information

Application:

Graduation Check-In

Organization:

Toronto Academy of Education

Local path:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-06-mobile-scanner-validation

Hosted Supabase project reference:

rydqtotlhzgckdxiditt
Existing foundation

CHECKIN-02 created:

Graduation events
Registrations
Guests
Tickets
Check-in audit records
Mock registrations

CHECKIN-03 created:

Excel upload and preview
Safe registration upsert
Stable registration UUIDs

CHECKIN-04 created:

Staff login
Scanner, supervisor and administrator roles
Trusted server-side authorization
Staff application shell

CHECKIN-05 created:

Secure HMAC ticket tokens
Token-hash storage
QR payload format
Ticket codes
Ticket generation
Replacement
Revocation
Ticket-management pages
Ticket activity history

Preserve all completed work and migrations.

Deferred issues not included in this ticket

Do not redesign the ticket-management interface during CHECKIN-06.

The following are intentionally deferred:

Missing REPLACED watermark on an old ticket preview
Improved historical-ticket visibility in Ticket Management
Final event date, time and venue information
Additional RSVP workbook-header compatibility
Final PDF ticket generation
Ticket email distribution

However, scanner validation must correctly recognize replaced tickets and registration-level attendance.

Critical security rules
Never validate a ticket only in the browser.
Never trust a browser-parsed ticket ID without server verification.
Never expose TICKET_TOKEN_SECRET.
Never expose SUPABASE_SERVICE_ROLE_KEY.
Never store raw QR payloads.
Never store raw ticket tokens.
Never log QR payloads or ticket tokens.
Never send raw tokens back in API responses.
Never include tokens in URLs, query parameters, filenames or response headers.
Never expose token hashes to the browser.
Never store scanned values in local storage, session storage or browser databases.
Do not include student email, phone, payment details or guest names in validation responses.
Every scanner page and API route must authorize the staff user server-side.
Proxy is not sufficient authorization.
Inactive staff must be denied.
Staff requiring a password change must be redirected.
Do not access _reference.
Do not use real student data in tests.
Do not modify deployed migrations.
Do not use long hyphens or em dashes in UI text, comments or documentation.
Scanner dependency

Install:

npm install @zxing/browser

Use @zxing/browser only in a Client Component responsible for camera access.

Requirements:

Do not use browser BarcodeDetector as the only scanner.
Restrict decoding to QR codes when supported by the library.
Prefer the rear-facing camera.
Allow the user to switch cameras.
Do not initialize the camera during server rendering.
Stop the camera when leaving the page.
Stop active media tracks when the scanner is paused or unmounted.
Do not leave the camera active in the background.
New migration

Create one migration using:

npx supabase migration new create_ticket_scan_validation_audit

Do not modify previous migrations.

New enum: scan method

Create:

ticket_scan_method

Allowed values:

qr
manual_code
New enum: validation result

Create:

ticket_validation_result

Allowed values:

valid
partially_checked_in
already_checked_in
invalid
revoked
replaced
pending
wrong_event
registration_blocked
rate_limited
error
New table: ticket_scan_attempts

Create:

public.ticket_scan_attempts

Columns:

id
event_id
ticket_id
registration_id
staff_user_id
method
result
request_id
ticket_status_snapshot
registration_status_snapshot
graduate_arrived_snapshot
adult_guests_arrived_snapshot
children_0_4_arrived_snapshot
children_5_10_arrived_snapshot
created_at

Requirements:

UUID primary key.
event_id references graduation_events.
ticket_id may reference graduation_tickets.
registration_id may reference graduation_registrations.
staff_user_id references auth.users.
method is required.
result is required.
request_id is required.
Add a unique constraint across:
staff_user_id
request_id
Snapshot attendance counts must be non-negative.
Store no graduate name.
Store no ticket code.
Store no QR payload.
Store no raw token.
Store no token hash.
Store no email.
Store no phone.
Store no guest name.
Store no payment information.
Add indexes for:
staff user
event
ticket
registration
result
created time
Enable Row Level Security.
Revoke all privileges from anon.
Revoke all privileges from authenticated.
Create no public policies.
Access remains through trusted server-side code.

Add database comments explaining that scan attempts are privacy-safe validation audit records and do not represent admission.

Scan-attempt retention

Do not create an automatic deletion job in this ticket.

Document that scan-attempt retention should be reviewed after the event. The table must not become a source of ticket-token or student-contact data.

Rate limiting

Implement a server-side scan-validation limit using ticket_scan_attempts.

Default limit:

60 validation requests per staff user per rolling minute

Requirements:

Apply independently of client-side debounce.
Count attempts by authenticated staff user.
Return HTTP 429 when exceeded.
Record a rate_limited attempt without storing scanned data.
Do not use the client IP as the primary identity.
Do not block normal event scanning under reasonable use.
Place constants in a central scanner configuration module.
Tests must be able to override the clock or limit.
Scanner authorization

Scanner validation is available to:

scanner
supervisor
administrator

Use the existing role hierarchy and:

requireScanner()

or an equivalent trusted helper.

Requirements:

Anonymous users: denied
Inactive staff: denied
Missing profile: denied
Scanner: allowed
Supervisor: allowed
Administrator: allowed
Staff requiring password change: redirected or denied until changed
Every route and server operation must authorize independently
Scanner route

Create:

/staff/scanner

Add Scan Tickets to the protected staff navigation for all active roles.

Add a role-appropriate scanner card on /staff.

Mobile scanner design

The scanner page must be designed primarily for phones.

Use:

Navy
Gold
Cream
White
High-contrast status panels
Large touch targets
Clear camera permission instructions

Page sections:

Graduation Ticket Scanner
Camera scanner
Manual ticket code
Current result
Scan another ticket

Suggested supporting text:

Scan the graduate's QR ticket to verify the registration and registered party.

Include a visible notice:

This screen validates the ticket only. Attendance confirmation will be added in the next stage.
Camera workflow

The camera scanner must:

Request camera permission only after staff select Start Camera.
Prefer facingMode: environment.
Display a camera-selection control when multiple cameras exist.
Allow Stop Camera.
Allow Switch Camera.
Show a scanning frame or guide.
Pause decoding immediately after a QR result.
Prevent the same continuously visible QR from sending repeated requests.
Show a loading state while the server validates.
Require Scan Another Ticket before resuming after a result.
Stop camera tracks when the user navigates away.
Handle permission denial clearly.
Handle no-camera devices clearly.
Handle camera-in-use errors clearly.
Handle unsupported or insecure contexts clearly.
Never print decoded values to the browser console.
Never place decoded values into browser storage.
Keep the decoded payload only in component memory until validation completes.
Clear the payload from state after the response is processed.
Optionally use short vibration feedback when supported:
valid result
invalid result
do not rely on vibration for status communication
Client duplicate suppression

Implement client-side duplicate suppression in addition to the database request ID.

Requirements:

Pause scanning after the first decode.
Generate a new UUID request ID per validation action.
Disable repeated form submission.
Ignore duplicate scanner callbacks while a request is active.
Do not compare or store raw payloads beyond the active request.
Do not use localStorage.
Do not automatically resume scanning after validation.
Validation API

Create:

POST /api/staff/scanner/validate

Request schema:

method: qr | manual_code
value: string
requestId: uuid

Requirements:

JSON body only.
Maximum QR value length: 512 characters.
Maximum manual ticket-code length: 32 characters.
Reject empty values.
Validate using Zod.
Require an active scanner-level staff session.
Set private no-store response headers.
Do not accept an event code from the client.
Resolve ACTIVE_GRADUATION_EVENT_CODE server-side.
Do not return stack traces.
Do not log request values.
Do not reflect invalid values in error responses.
QR validation sequence

For method = qr, perform this exact server-side process:

Authorize the staff user.
Apply server-side rate limiting.
Resolve the configured active event.
Parse the TAE-GRAD1: prefix.
Extract the versioned token.
Verify the HMAC signature.
Validate the embedded ticket UUID.
Calculate the SHA-256 token hash.
Load the ticket by UUID.
Compare the calculated hash with the stored hash.
Verify the ticket belongs to the configured event.
Verify the registration belongs to the same event.
Evaluate ticket status.
Evaluate registration status.
Calculate registration-level attendance.
Record the privacy-safe validation attempt.
Return a safe validation result.

A correctly signed token with a mismatched stored hash must be rejected as invalid.

Use constant-time comparison where appropriate.

Manual ticket-code validation

For method = manual_code:

Normalize the ticket code to uppercase.
Trim whitespace.
Require the exact ticket-code format.
Perform an exact database lookup.
Do not perform partial matching.
Do not perform broad search.
Do not reveal nearby or similar ticket codes.
Continue with the same ticket, event, registration and attendance validation.
Record manual_code as the scan method.
Do not show the code in server logs.

Manual lookup is a fallback for damaged QR codes or camera problems.

Ticket-status validation
Active

Continue to registration and attendance validation.

Revoked

Return:

revoked

Display:

Ticket Revoked
Ticket code
Graduate name
A clear instruction not to admit using this ticket
No QR payload or token information
Replaced

Return:

replaced

Display:

Ticket Replaced
Old ticket code
Graduate name
Clear instruction not to admit using the old ticket
Latest active replacement ticket code when one can be safely resolved
A message asking the graduate to present the latest ticket

Do not automatically treat the old ticket as valid.

Pending

Return:

pending

Display that the ticket is not ready for admission.

Unknown or missing ticket

Return:

invalid

Do not reveal whether the token signature or database lookup specifically failed.

Replacement-chain resolution

When a replaced ticket is scanned:

Follow replaced_by_ticket_id.
Continue through later replacements when necessary.
Stop at the newest ticket.
Use a maximum traversal depth of 10.
Detect cycles.
Return only the latest safe ticket code and status.
Never return its raw token or hash.
If the chain is invalid, show a generic replaced-ticket message.

This does not reactivate the old ticket.

Registration-status validation
Eligible

Continue to attendance-state calculation.

Failed

Return:

registration_blocked
Cancelled

Return:

registration_blocked
Review required

Return:

registration_blocked

Display the registration status in clear staff-facing language.

Do not show internal notes.

Active-event validation

A ticket must belong to the configured active event.

When it belongs to another event, return:

wrong_event

Display:

This ticket belongs to a different event.

Do not reveal private details from the other event.

If the configured event is closed or archived, scanning must fail safely.

Registration-level attendance calculation

Attendance must be calculated across:

all graduation_checkins for the registration

Do not calculate attendance from only the currently scanned ticket.

This requirement is critical.

Replacing a ticket must not reset attendance.

If an old ticket was used and later replaced, scanning the new ticket must still show the registration’s existing attendance.

Calculate cumulative deltas for:

graduate
adult guests
children age 0 to 4
children age 5 to 10

Clamp displayed totals between zero and the registered allowance.

Return:

No attendance recorded
valid
Some, but not all, registered people admitted
partially_checked_in
Graduate and full registered party already admitted
already_checked_in

CHECKIN-06 must not insert, reverse or modify check-in records.

Safe validation response

The response may contain:

result
validationAttemptId
graduateName
ticketCode
ticketStatus
registrationStatus
eventName
eventStartsAt
venueName
registeredAdultGuests
registeredChildren0To4
registeredChildren5To10
expectedPartySize
graduateArrived
adultGuestsArrived
children0To4Arrived
children5To10Arrived
remainingPartySize
latestReplacementTicketCode
latestReplacementStatus
validatedAt

Use only fields appropriate to the validation result.

Do not return:

Raw token
Token hash
QR payload
Email
Phone
Guest names
Payment information
Source order ID
Internal notes
Staff credentials
Database errors

Avoid returning database UUIDs unless required for a later trusted server operation. CHECKIN-06 should not require browser-visible ticket or registration UUIDs.

Scanner result design

Create accessible result panels.

Valid

Heading:

Valid Ticket

Show:

Graduate name
Ticket code
Event name
Registered party
Current attendance
Remaining party
Status message

Use:

Ticket verified. Attendance has not yet been confirmed on this screen.
Partially checked in

Heading:

Partial Arrival Recorded

Show registered, arrived and remaining counts.

Clearly explain that the registration already has attendance activity.

Already checked in

Heading:

Already Checked In

Display that the registered party has already been admitted.

Do not provide a second admission action in CHECKIN-06.

Revoked

Heading:

Ticket Revoked

Clearly mark it invalid.

Replaced

Heading:

Ticket Replaced

Clearly mark the old ticket invalid and show the latest backup ticket code when available.

Wrong event

Heading:

Different Event
Registration blocked

Heading:

Registration Requires Review
Invalid

Heading:

Invalid Ticket

Use a generic message:

This QR code could not be verified as an active graduation ticket.

Do not expose the exact security failure.

Rate limited

Heading:

Scanner Temporarily Paused

Tell staff to wait briefly before trying again.

Current-session scan history

The scanner page may show the last five validation results from the current browser session.

Requirements:

Keep them in React memory only.
Clear them on page refresh.
Do not use localStorage or sessionStorage.
Do not include raw payloads.
Do not include token hashes.
Show only:
time
result
graduate name when safely available
ticket code when safely available

This is a usability feature, not a permanent audit log.

Scanner audit behavior

Record one validation attempt for each server validation response.

Record:

Staff user
Event
Matched ticket when available
Matched registration when available
Method
Result
Status snapshots
Attendance-count snapshots
Time
Request ID

Do not record:

QR payload
Raw token
Token hash
Ticket code
Graduate name
Email
Phone
Guest names
Payment information

A validation attempt is not an admission record.

Feature structure

Create a modular structure similar to:

src/features/scanner/
  constants.ts
  types.ts
  schemas.ts
  errors.ts
  permissions.ts
  rate-limit.ts
  attendance-summary.ts
  replacement-chain.ts
  validation.ts
  repository.ts
  service.ts
  response.ts
  components/
    camera-scanner.tsx
    manual-code-form.tsx
    scanner-result.tsx
    scanner-shell.tsx
    camera-status.tsx
    recent-validations.tsx

Keep API handlers thin.

Do not place the complete validation workflow in a page or route file.

Staff navigation

Update the protected staff shell.

Show:

Scan Tickets

to:

Scanner
Supervisor
Administrator

Do not expose administrator-only ticket-management links to scanner or supervisor roles.

Update /staff role cards so the scanner is marked available.

Database types

Update:

src/types/database.ts

Include:

ticket_scan_method
ticket_validation_result
ticket_scan_attempts
Insert and row types

Do not use any.

Configuration verification

Update tickets:verify-config or add a scanner verification script.

Preferred new command:

scanner:verify-config

Create:

scripts/scanner/verify-config.ts

Add:

"scanner:verify-config": "tsx scripts/scanner/verify-config.ts"

The script must:

Load .env.local.
Verify active event configuration.
Verify ticket-secret configuration.
Verify Supabase server credentials.
Confirm the active event exists.
Confirm the CHECKIN-06 table exists after deployment when possible.
Print ticket status counts only.
Print no names, codes, UUIDs, tokens, hashes or contact information.
Modify nothing.
Exit nonzero on unsafe configuration.

Before migration deployment, it may safely report that the scan-attempt table is missing.

Tests

Add comprehensive automated tests.

Camera component tests
Camera does not start automatically.
Start Camera requests permission.
Rear-facing camera is preferred.
Camera tracks stop on pause.
Camera tracks stop on unmount.
Multiple-camera switching works.
Decode pauses after one result.
Duplicate callbacks do not trigger repeated requests.
Scan Another Ticket clears result and resumes only after user action.
Permission-denied state is clear.
No-camera state is clear.
No decoded payload is logged.
No payload is stored in browser storage.
QR validation tests
Correct prefix is accepted.
Invalid prefix is rejected.
Valid HMAC token is accepted.
Modified signature is rejected.
Modified ticket UUID is rejected.
Stored hash mismatch is rejected.
Missing ticket is generic invalid.
No exact cryptographic failure is exposed.
No token or hash appears in the response.
Manual-code tests
Correct code is accepted.
Lowercase input is normalized.
Surrounding whitespace is removed.
Invalid format is rejected.
Partial code is not searched.
Similar codes are not returned.
Manual code is not logged.
Ticket-status tests
Active ticket proceeds.
Revoked ticket is rejected.
Replaced ticket is rejected.
Latest replacement code is returned safely.
Multi-step replacement chain resolves.
Replacement cycles are detected.
Replacement depth is limited.
Pending ticket is rejected.
Wrong-event ticket is rejected.
Registration tests
Eligible registration proceeds.
Failed registration is blocked.
Cancelled registration is blocked.
Review-required registration is blocked.
Internal notes are not returned.
Attendance-state tests
No check-ins returns valid.
Partial attendance returns partially_checked_in.
Full registered party returns already_checked_in.
Negative reversals are calculated safely.
Displayed totals are clamped.
Attendance is calculated by registration, not ticket.
Replacing a previously used ticket does not reset attendance.
New replacement ticket still shows already checked in when the registration was fully admitted.
Scanner validation does not insert check-in rows.
Authorization tests
Anonymous denied.
Missing profile denied.
Inactive staff denied.
Password-change-required staff denied.
Scanner allowed.
Supervisor allowed.
Administrator allowed.
Server API authorizes independently from Proxy.
Rate-limit tests
Normal scanning allowed.
Sixty attempts within a minute allowed.
Excess attempts return 429.
Rate limit is per staff user.
A different staff user is not blocked.
Rate-limited attempt stores no scanned data.
Client debounce does not replace server rate limiting.
Response privacy tests
No email.
No phone.
No guest names.
No payment data.
No source registration ID.
No raw token.
No token hash.
No QR payload.
No database error details.
Audit tests
Valid attempt recorded.
Invalid attempt recorded.
Manual attempt recorded.
Staff and event are recorded.
Attendance snapshots are recorded.
No ticket code is stored.
No graduate name is stored.
Request ID is idempotent per staff user.
Migration-safety tests

Verify:

Previous migrations unchanged.
New enum types exist.
Scan-attempt table exists.
RLS enabled.
anon privileges revoked.
authenticated privileges revoked.
No public policies.
No raw-payload column.
No token column.
No token-hash column.
No student-contact columns.
Required indexes and constraints exist.
Regression tests
Ticket-generation tests pass.
Replacement tests pass.
Revocation tests pass.
Staff-authentication tests pass.
Excel-import tests pass.
No CHECKIN-07 admission operation exists.
Scanner validation creates no graduation_checkins.

Tests must not modify the hosted database.

Homepage status update

Update public project-status cards:

Application configured
Complete

Registration imports
Administrator protected

Staff authentication
Complete

Secure ticket generation
Complete

Mobile ticket scanner
Ready for protected testing

Attendance check-in
Not implemented

Do not expose scanner activity publicly.

README updates

Document:

Mobile scanner architecture
Camera permission behavior
QR validation sequence
Manual-code fallback
Ticket-status results
Replacement-chain handling
Registration-level attendance behavior
Why ticket replacement does not reset attendance
Scan-attempt audit privacy
Server-side rate limiting
Secure-context requirement for camera access
CHECKIN-07 separation
Manual migration deployment
Testing instructions

Prominently state:

Ticket validation is not the same as recording attendance.

Also state:

Attendance belongs to the registration. Replacing a ticket does not reset previous check-in activity.
Environment variables

No new Vercel environment variables are required.

Continue using:

NEXT_PUBLIC_APP_URL
APP_ENV
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
TICKET_TOKEN_SECRET
ACTIVE_GRADUATION_EVENT_CODE
Out of scope

Do not implement:

Confirm Check-In button
Graduate admission
Guest admission
Child admission
Partial-arrival submission
Check-in reversal
Supervisor correction
Attendance dashboard
Public scanner
Public QR validation
Ticket PDF generation
Ticket emailing
Event information redesign
Ticket watermark corrections
Excel-header compatibility updates
Payment verification
Assigned seating
Required checks

Run:

npm run scanner:verify-config
npm run tickets:verify-config
npm run db:validate:mock
npm run db:generate:mock-import
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

scanner:verify-config may report that the new migration is not deployed. It must modify nothing.

Privacy checks

Run:

git ls-files |
    Select-String -Pattern "^node_modules/|^\.next/|^tmp/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"

Run:

git diff --name-only |
    Select-String -Pattern "^tmp/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"

Both must return no unsafe files.

Search tracked source files, excluding _reference, for accidental:

QR payloads
Raw ticket tokens
Hardcoded ticket secrets
Supabase secret values
Token hashes in UI responses
Student contact data
Access tokens
Refresh tokens
Session cookies
Acceptance criteria
Mobile camera scanning works.
Camera does not start without user action.
Camera resources are cleaned up.
Scanner, supervisor and administrator roles may scan.
Anonymous and inactive users are denied.
QR payload validation occurs server-side.
HMAC verification is enforced.
Stored token hash is verified.
Raw payloads and tokens are never persisted.
Manual ticket-code validation works.
Partial code lookup is prohibited.
Active tickets are recognized.
Revoked tickets are rejected.
Replaced tickets are rejected.
Latest replacement code can be shown safely.
Pending tickets are rejected.
Wrong-event tickets are rejected.
Blocked registrations are rejected.
Registration-level attendance is calculated.
Replacing a ticket does not reset attendance.
Already checked-in status is recognized.
Partial attendance status is recognized.
Scanner creates no admission records.
Server-side rate limiting works.
Validation attempts are audited safely.
Scanner UI is mobile responsive.
No contact or payment data is exposed.
No new Vercel variable is required.
Previous functionality remains working.
Tests pass.
ESLint passes.
Type checking passes.
Build passes.
Privacy checks pass.
_reference remains untouched.
Claude does not run supabase db push.
Claude does not commit or push.
Final report

Report:

Current branch
Migration filename
Scanner dependency
Camera workflow
QR validation workflow
Manual-code validation
Ticket-status behavior
Replacement-chain behavior
Registration-status behavior
Attendance-state calculation
Rate limiting
Scan-attempt audit
Authorization
Scanner UI
Routes and APIs
Files created
Files modified
Tests added
Test result
Lint result
Type-check result
Build result
Configuration-verification result
Privacy-check result
Manual Supabase steps remaining
Manual browser tests remaining
Assumptions
Issues requiring review

Do not include:

raw tokens
token hashes
QR payload values
full staff emails
UUIDs
student contact information
real student information

Do not commit or push.