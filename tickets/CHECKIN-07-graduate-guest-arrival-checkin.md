CHECKIN-07: Graduate and Guest Arrival Check-In
Objective

Implement the actual attendance-confirmation workflow for the Toronto Academy of Education Graduation Check-In application.

CHECKIN-06 verifies whether a ticket is authentic and active.

CHECKIN-07 must allow authorized staff to record who is arriving now after a successful ticket validation.

This ticket must:

Record graduate attendance.
Record adult guest attendance.
Record attendance for children age 0 to 4.
Record attendance for children age 5 to 10.
Support partial party arrivals.
Support guests arriving separately from the graduate.
Prevent admission beyond the registered allowance.
Prevent duplicate submissions.
Prevent reuse of the same validation attempt.
Calculate attendance across the registration, not the ticket.
Preserve attendance after ticket replacement.
Prevent revoked or replaced tickets from being admitted.
Record append-only attendance entries.
Provide a fast mobile workflow for event staff.
Preserve CHECKIN-02 through CHECKIN-06 functionality.

Supervisor corrections, reversals and overrides remain for CHECKIN-08.

Project information

Application:

Graduation Check-In

Organization:

Toronto Academy of Education

Local path:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-07-arrival-checkin-workflow

Hosted Supabase project reference:

rydqtotlhzgckdxiditt
Existing foundation

CHECKIN-02 created:

graduation_events
graduation_registrations
registration_guests
graduation_tickets
graduation_checkins
Mock registrations

CHECKIN-03 created:

Excel import
Stable registration IDs
Safe registration updates

CHECKIN-04 created:

Scanner, supervisor and administrator roles
Trusted staff sessions
Server-side authorization

CHECKIN-05 created:

Secure tickets
Ticket replacement and revocation
Ticket activity history
Ticket codes and QR codes

CHECKIN-06 created:

Mobile QR scanner
Manual ticket-code validation
Secure server-side validation
Registration-level attendance calculations
ticket_scan_attempts
Validation-attempt audit records
Valid, partial and already-checked-in states

Preserve all previous migrations and behavior.

Deferred quality-review items

Do not address these during CHECKIN-07:

Ticket event information redesign
Missing replaced-ticket watermark
Historical-ticket list improvements
RSVP Excel-header compatibility
PDF ticket generation
Ticket email delivery
Final event information
General visual quality cleanup

These will be handled after the core event workflow is complete.

Critical attendance rule

Attendance belongs to:

graduation_registrations

Attendance does not belong only to:

graduation_tickets

All current attendance totals must be calculated across every applicable graduation_checkins row for the registration.

Therefore:

Replacing a ticket must not reset attendance.
Revoking a ticket must not delete attendance already recorded.
Scanning a replacement ticket must show attendance previously recorded through the old ticket.
An already admitted registration must not receive a second full admission through a replacement ticket.
Partial arrivals must remain visible regardless of which active ticket is later scanned.

This rule must be enforced by the database transaction and automated tests.

Critical security rules
Never trust attendance counts calculated only in the browser.
Never trust browser-provided remaining counts.
Never accept a registration ID from the browser.
Never accept a ticket ID from the browser.
Never accept an event ID or event code from the browser.
Never accept a staff user ID or role from the browser.
Use the trusted validation-attempt ID to identify the registration.
Recheck ticket status during attendance submission.
Recheck registration status during attendance submission.
Recheck event status during attendance submission.
Recalculate attendance inside the database transaction.
Lock the registration before calculating remaining attendance.
Never permit counts beyond the registered allowance.
Never store raw QR payloads or raw ticket tokens.
Never log QR payloads, tokens or token hashes.
Never expose student email or phone.
Never expose payment information.
Never expose guest names.
Never expose internal registration notes.
Never use localStorage or sessionStorage for check-in data.
Do not access _reference.
Do not use real student data in tests.
Do not modify deployed migrations.
Do not use long hyphens or em dashes in UI, documentation or comments.
No new dependency required

Do not add a new package unless technically necessary.

Use the existing:

React
Next.js
Zod
Supabase
Node crypto utilities
Existing authentication helpers
Existing scanner components
New migration

Create exactly one migration:

npx supabase migration new create_graduate_guest_checkin_workflow

Do not modify earlier migrations.

Inspect the existing check-in schema

Before writing the new migration, inspect the current:

graduation_checkins

Determine the exact existing column names for:

Event
Registration
Ticket
Staff user
Graduate attendance delta
Adult guest attendance delta
Children age 0 to 4 attendance delta
Children age 5 to 10 attendance delta
Timestamp
Action or entry type, when present

Reuse the existing delta columns.

Do not rename or recreate the table.

Do not create duplicate attendance columns.

Extend graduation_checkins

Add only the metadata columns that are missing.

Required behavior:

request_id
validation_attempt_id
recorded_by

The exact migration may add:

request_id uuid
validation_attempt_id uuid
recorded_by uuid

Requirements:

validation_attempt_id references ticket_scan_attempts.
recorded_by references auth.users.
Legacy rows must remain valid.
Do not make new metadata columns NOT NULL if that would break legacy rows.
New CHECKIN-07 application inserts must provide all required metadata.
Add a unique partial index on validation_attempt_id where it is not null.
Add a unique partial index on (recorded_by, request_id) where both values are not null.
Add indexes for:
registration and created time
ticket
recorded staff user
validation attempt
Preserve existing attendance records.
Preserve future support for negative correction deltas in CHECKIN-08.
CHECKIN-07 itself may insert positive attendance deltas only.

Do not store:

QR payload
Raw token
Token hash
Ticket code
Graduate name
Email
Phone
Guest names
Payment data
Validation-attempt lifetime

A successful ticket validation may be used for attendance confirmation for:

15 minutes

Requirements:

The validation attempt must belong to the authenticated staff user submitting the check-in.
The attempt must belong to the configured active event.
The attempt must reference a ticket and registration.
The attempt must have resulted in:
valid
partially_checked_in
An already_checked_in attempt cannot create another positive admission.
Invalid, revoked, replaced, pending, wrong-event or blocked attempts cannot be used.
The attempt may be used only once.
Expired attempts must require the ticket to be scanned again.
Refreshing the browser must require a new validation.
Do not place the validation-attempt ID in a URL.
Keep it only in current React memory until submission.
Atomic database function

Create:

public.apply_graduation_checkin(...)

Use a security definer PostgreSQL function with a fixed safe search_path.

Suggested inputs:

p_actor_user_id
p_event_id
p_validation_attempt_id
p_request_id
p_graduate_arriving
p_adult_guests_arriving
p_children_0_4_arriving
p_children_5_10_arriving

The exact types must match the existing schema.

Atomic function sequence

The database function must perform the following sequence in one transaction:

Verify the acting user has an active staff profile.
Verify the role is scanner, supervisor or administrator.
Validate the request ID.
Check whether the same actor and request ID already completed successfully.
Return the existing result for an idempotent retry.
Lock the validation-attempt row.
Verify the attempt belongs to the acting staff user.
Verify the attempt is no more than 15 minutes old.
Verify the attempt result is valid or partially_checked_in.
Verify no prior check-in already references the validation attempt.
Lock the configured event.
Reject a missing, closed or archived event.
Lock the ticket.
Require the ticket to remain active.
Lock the registration.
Require the registration to remain eligible.
Verify ticket, registration, validation attempt and active event all match.
Sum attendance deltas across all check-in records for the registration.
Clamp current displayed totals between zero and registered allowances.
Validate all arriving-now values.
Require the graduate value to be 0 or 1.
Require guest and child values to be non-negative integers.
Require at least one arriving person.
Prevent the graduate from being admitted more than once.
Prevent adult guests from exceeding the registered adult-guest allowance.
Prevent children age 0 to 4 from exceeding their allowance.
Prevent children age 5 to 10 from exceeding their allowance.
Insert one append-only attendance row.
Link the row to the validation attempt.
Link the row to the ticket used for validation.
Link the row to the registration and event.
Record the acting staff user.
Return safe attendance totals.
Do not update or delete earlier check-in records.
Do not change registration allowances.
Do not change ticket status.
Do not change payment status.

Any failure must roll back the complete transaction.

Concurrency protection

Registration locking is required.

Example race condition to prevent:

Two staff members validate the same ticket.
Both see two remaining guests.
Both attempt to admit two guests.
Only one request may admit the final two guests.
The second request must receive a safe conflict with refreshed attendance totals.

The system must never record attendance above the registered allowance.

Idempotency

The browser must generate one UUID request ID for each confirmation action.

Requirements:

Keep the same request ID while retrying a failed network request.
Do not create a new request ID for an automatic retry.
The database must return the existing successful result when the same actor and request ID are submitted again.
A duplicate browser click must not create duplicate attendance.
The same validation attempt cannot be used with a different request ID after successful admission.
Arrival input rules

The form must support:

Graduate arriving now
Adult guests arriving now
Children age 0 to 4 arriving now
Children age 5 to 10 arriving now
Graduate

Use a checkbox or clear Yes or No control.

Requirements:

Maximum value is one.
Disable it when the graduate has already arrived.
Do not require the graduate to arrive before guests.
Guests may arrive separately from the graduate.
Adult guests

Allow values from:

0

through the current remaining adult-guest count.

Children age 0 to 4

Allow values from zero through the current remaining allowance.

Children age 5 to 10

Allow values from zero through the current remaining allowance.

Zero arrival

Reject a submission where every arriving-now value is zero.

Display:

Select at least one arriving person.
Quick-fill controls

Add event-friendly quick actions:

Full Remaining Party
Graduate Only
Clear
Full Remaining Party

Select:

Graduate, when not already arrived
All remaining adult guests
All remaining children
Graduate Only

Select only the graduate when not already arrived.

Disable this action when the graduate has already arrived.

Clear

Reset all arriving-now selections to zero.

Quick actions must not bypass server validation.

Scanner integration

Continue using:

/staff/scanner

After a result of:

valid

or:

partially_checked_in

display an arrival-confirmation form below the validation result.

Do not display the form for:

already checked in
revoked
replaced
pending
invalid
wrong event
registration blocked
rate limited
error

The browser receives the validation-attempt ID from CHECKIN-06 and keeps it only in current component memory.

Do not put it in:

URL
Query string
localStorage
sessionStorage
Cookie
Console logs
Analytics
Arrival confirmation API

Create:

POST /api/staff/checkin/confirm

Request body:

validationAttemptId
requestId
graduateArriving
adultGuestsArriving
children0To4Arriving
children5To10Arriving

Requirements:

JSON only.
Validate with Zod.
UUID validation for IDs.
Counts must be integers.
Graduate must be zero or one.
Other counts must be between zero and a conservative input limit such as 20.
Require scanner-level authorization.
Determine acting user from the trusted session.
Resolve the active event server-side.
Do not accept event ID from the browser.
Do not accept ticket or registration IDs.
Set:
Cache-Control: private, no-store
Do not log the request body.
Do not return database errors or stack traces.
Do not return token information.
Keep the route handler thin.
Safe API response

The response may include:

result
graduateName
ticketCode
registeredGraduate
registeredAdultGuests
registeredChildren0To4
registeredChildren5To10
expectedPartySize
graduateArrivedBefore
adultGuestsArrivedBefore
children0To4ArrivedBefore
children5To10ArrivedBefore
graduateArrivingNow
adultGuestsArrivingNow
children0To4ArrivingNow
children5To10ArrivingNow
graduateArrivedTotal
adultGuestsArrivedTotal
children0To4ArrivedTotal
children5To10ArrivedTotal
remainingAdultGuests
remainingChildren0To4
remainingChildren5To10
remainingPartySize
recordedAt

Possible successful results:

partial
complete

Safe failure results may include:

already_complete
validation_expired
validation_used
ticket_not_active
registration_blocked
wrong_event
invalid_counts
allowance_exceeded
conflict
unauthorized
configuration_error

Do not return:

Validation-attempt ID after completion
Check-in database ID
Registration UUID
Ticket UUID
Raw ticket token
Token hash
QR payload
Email
Phone
Guest names
Payment data
Source order ID
Internal notes
Staff credentials
PostgreSQL details
HTTP status behavior

Use:

200 for successful partial or complete check-in
200 for an idempotent retry returning the earlier successful result
400 for malformed request data
401 for unauthenticated
403 for unauthorized or inactive staff
409 for:
validation already used
ticket no longer active
attendance conflict
registration already complete
410 for expired validation
422 for:
zero arrival
invalid counts
allowance exceeded
blocked registration
503 for missing or unsafe event configuration
500 only for unexpected failures

Messages must be safe and staff-readable.

Check-in form design

Create reusable components such as:

src/features/checkin/
  constants.ts
  types.ts
  schemas.ts
  errors.ts
  permissions.ts
  attendance.ts
  repository.ts
  service.ts
  response.ts
  components/
    arrival-form.tsx
    arrival-count-control.tsx
    arrival-review.tsx
    arrival-confirmation.tsx
    attendance-progress.tsx

Do not place the complete workflow in the API route or scanner page.

Mobile check-in design

The check-in form must be optimized for phones.

Use:

Large controls
High contrast
Clear labels
Large number buttons
Minimum touch target around 44 pixels
Navy, gold, cream and white
Clear error states
No horizontal scrolling

Display four sections:

Registered
Already Arrived
Arriving Now
Remaining After

Each section must clearly show:

Graduate
Adult guests
Children age 0 to 4
Children age 5 to 10
Total party
Count controls

For guest and child counts, use:

Minus button
Current selected number
Plus button

Requirements:

Minus cannot go below zero.
Plus cannot exceed the current browser-visible remaining value.
Server validation remains authoritative.
Controls must be keyboard accessible.
Controls must have descriptive accessible labels.
Confirmation review

Before submission, display a clear summary:

Arriving now
Graduate: Yes or No
Adult guests: number
Children age 0 to 4: number
Children age 5 to 10: number
Total arriving now: number

Primary button:

Confirm Arrival

Do not require typed confirmation text. Event entry must remain fast.

Disable the button:

While submitting
When no one is selected
After success
When the validation result is no longer eligible for check-in
Successful partial arrival

Heading:

Partial Arrival Confirmed

Display:

Graduate name
Arriving-now counts
Total attendance
Remaining party counts
Confirmation time

Display:

Additional registered party members may be checked in when they arrive.

Require a new scan before recording another arrival.

Button:

Scan Next Ticket

Do not keep the same validation attempt active.

Successful full arrival

Heading:

Full Party Checked In

Display:

Graduate name
Arriving-now counts
Final attendance totals
Confirmation time

Display:

The graduate and full registered party have now been recorded as arrived.

Button:

Scan Next Ticket
Already fully checked in

When validation reports the full registered party has already arrived:

Heading:

Already Checked In

Do not show a confirmation form.

Display the recorded totals.

Do not provide another positive attendance action.

Partial arrival flow example

Registered party:

Graduate: 1
Adult guests: 2
Children age 0 to 4: 1
Children age 5 to 10: 0

First arrival:

Graduate: 1
Adult guests: 1
Children age 0 to 4: 0
Children age 5 to 10: 0

Current totals:

Graduate: 1 of 1
Adult guests: 1 of 2
Children age 0 to 4: 0 of 1

Second arrival after a new scan:

Graduate: 0
Adult guests: 1
Children age 0 to 4: 1
Children age 5 to 10: 0

Final status:

Full Party Checked In
Guest-first arrival example

Registered party:

Graduate: 1
Adult guests: 2

First arrival:

Graduate: 0
Adult guests: 2

Result:

Partial Arrival Confirmed

Later, the graduate scans the same active ticket:

Graduate: 1
Adult guests: 0

Result:

Full Party Checked In

Do not require graduate admission before guests.

Ticket replacement behavior

This behavior is mandatory.

Scenario:

A graduate and guests are checked in using Ticket A.
Ticket A is later replaced by Ticket B.
Ticket B is scanned.

Expected:

Attendance remains attached to the registration.
Existing attendance is displayed.
If the full party was admitted, Ticket B shows Already Checked In.
If part of the party was admitted, Ticket B shows the remaining allowance.
Ticket B must not permit the full party to be admitted again.
Ticket A remains rejected as replaced.
Ticket status changed after validation

Scenario:

Staff validate an active ticket.
Before staff press Confirm Arrival, an administrator replaces or revokes the ticket.
Staff press Confirm Arrival.

Expected:

The database function rechecks the ticket.
Attendance is not recorded.
The staff member sees:
Ticket status changed. Scan the current ticket again.
Registration changed after validation

Scenario:

Staff validate an eligible registration.
Before confirmation, the registration becomes cancelled or review required.
Staff press Confirm Arrival.

Expected:

Attendance is not recorded.
Staff see that the registration requires review.
Network retry behavior

Scenario:

Staff press Confirm Arrival.
The server records attendance.
The browser loses the response.
Staff retry the same request.

Expected:

The same request ID is reused.
No second attendance row is created.
The earlier successful result is returned.
Browser state

Keep in React memory only:

Current validation result
Validation-attempt ID
Current count selections
Current request ID
Current confirmation response
Last five current-session results

Clear sensitive workflow state when:

Staff select Scan Next Ticket
Camera scanning restarts
A different ticket is validated
The page reloads
The component unmounts
The user signs out

Do not use browser storage.

Staff authorization

CHECKIN-07 check-in is available to:

scanner
supervisor
administrator

Requirements:

Anonymous denied
Missing profile denied
Inactive staff denied
Password-change-required staff denied
Scanner allowed
Supervisor allowed
Administrator allowed
API authorizes independently from Proxy
Database function verifies the actor independently from the API
Append-only attendance

CHECKIN-07 must only insert check-in records.

It must not:

Update an earlier attendance row
Delete an attendance row
Reverse an attendance row
Add a negative attendance delta
Correct an earlier mistake
Override the registered allowance

CHECKIN-08 will implement supervisor corrections and reversals using additional append-only entries.

Audit behavior

The check-in row itself is the attendance audit entry.

Record:

Event
Registration
Ticket used
Acting staff user
Validation attempt
Request ID
Graduate delta
Adult guest delta
Child category deltas
Timestamp

Do not record:

Raw QR payload
Raw ticket token
Token hash
Graduate name
Ticket code
Email
Phone
Guest names
Payment data
Free-text notes

Do not add free-text notes during event check-in.

Database types

Update:

src/types/database.ts

Include:

New graduation_checkins metadata columns
apply_graduation_checkin arguments
apply_graduation_checkin result type

Do not use any.

Configuration verification

Create:

scripts/checkin/verify-config.ts

Add:

"checkin:verify-config": "tsx scripts/checkin/verify-config.ts"

The script must:

Load .env.local.
Verify Supabase server configuration.
Verify active event configuration.
Confirm the active event exists.
Confirm the CHECKIN-06 scan table exists.
Confirm the CHECKIN-07 function exists after deployment.
Print registration-level attendance counts only.
Print no names.
Print no ticket codes.
Print no UUIDs.
Print no QR payloads.
Print no tokens or hashes.
Modify nothing.
Exit nonzero on unsafe configuration.

Before migration deployment, it may safely report that apply_graduation_checkin is missing.

Automated tests

Add comprehensive tests.

Input validation tests
Graduate value accepts zero or one.
Graduate value rejects numbers above one.
Counts reject negative values.
Counts reject decimals.
Counts reject excessive input.
Zero total arrival is rejected.
Invalid UUIDs are rejected.
Browser cannot submit event ID.
Browser cannot submit ticket ID.
Browser cannot submit registration ID.
Browser cannot submit actor ID.
Authorization tests
Anonymous denied.
Missing profile denied.
Inactive staff denied.
Password-change-required staff denied.
Scanner allowed.
Supervisor allowed.
Administrator allowed.
API authorizes independently from Proxy.
Database function verifies active scanner-level staff.
Validation-attempt tests
Valid attempt may be used.
Partially checked-in attempt may be used.
Already-checked-in attempt is blocked.
Invalid attempt is blocked.
Revoked attempt is blocked.
Replaced attempt is blocked.
Pending attempt is blocked.
Wrong-event attempt is blocked.
Registration-blocked attempt is blocked.
Attempt must belong to acting staff user.
Attempt expires after 15 minutes.
Attempt may be consumed only once.
Attempt ID is never placed in a URL or browser storage.
Attendance tests
Graduate-only arrival works.
Guest-only arrival works.
Child-only arrival works when registered.
Full party arrival works.
Partial arrival works.
A second scan admits remaining party.
Graduate cannot be admitted twice.
Adult guests cannot exceed allowance.
Children age 0 to 4 cannot exceed allowance.
Children age 5 to 10 cannot exceed allowance.
Zero arrival is blocked.
Registered zero-count categories cannot be increased.
Current totals include every check-in row for the registration.
Current totals are not calculated only from the scanned ticket.
Negative correction entries from future workflows are included in totals.
Displayed totals are clamped safely.
Replacement tests
Attendance recorded through an old ticket remains on the registration.
Replacement ticket sees existing partial attendance.
Replacement ticket sees already-complete attendance.
Replacement ticket cannot readmit the full party.
Replaced old ticket cannot create attendance.
Ticket replaced after validation is blocked at confirmation.
Registration tests
Eligible registration may check in.
Failed registration is blocked.
Cancelled registration is blocked.
Review-required registration is blocked.
Registration changed after validation is rechecked.
Event tests
Configured event is resolved server-side.
Closed event is blocked.
Archived event is blocked.
Wrong-event validation is blocked.
Browser cannot select another event.
Idempotency tests
Same actor and request ID returns the original success.
Duplicate click creates one attendance row.
Network retry creates one attendance row.
Same validation attempt with a new request ID is blocked after success.
Different staff requests are isolated.
Concurrency tests
Registration row is locked before attendance totals are calculated.
Two simultaneous full-party requests cannot over-admit.
Allowance is checked inside the transaction.
Failed insert rolls back all changes.
Only one request consumes the validation attempt.
Append-only tests
CHECKIN-07 inserts one attendance row.
It does not update earlier attendance rows.
It does not delete rows.
It does not insert negative deltas.
It does not change registration allowances.
It does not change ticket status.
It does not change payment status.
Response privacy tests
No email returned.
No phone returned.
No guest names returned.
No payment data returned.
No source order ID returned.
No raw token returned.
No token hash returned.
No QR payload returned.
No database UUID returned after completion.
No PostgreSQL error details returned.
UI tests
Arrival form appears for valid result.
Arrival form appears for partial result.
Arrival form is hidden for already checked in.
Arrival form is hidden for revoked.
Arrival form is hidden for replaced.
Graduate control disables after graduate arrival.
Plus controls stop at remaining allowance.
Minus controls stop at zero.
Full Remaining Party works.
Graduate Only works.
Clear works.
Confirmation is disabled for zero arrival.
Confirmation is disabled during submission.
Successful partial result is displayed.
Successful full result is displayed.
Scan Next Ticket clears workflow state.
No check-in workflow state uses browser storage.
Migration tests

Verify:

Previous migrations remain unchanged.
Existing graduation_checkins table is reused.
No duplicate attendance columns are created.
New metadata columns exist.
Validation-attempt uniqueness exists.
Actor and request idempotency exists.
Required indexes exist.
Function is security definer.
Function has a fixed safe search_path.
Public, anon and authenticated execution is revoked.
Function verifies scanner-level staff.
Function locks validation attempt, ticket and registration.
Function recalculates attendance inside the transaction.
Function inserts only positive attendance.
No raw-token or contact columns are added.
Regression tests
Scanner validation continues to work.
Manual ticket-code validation continues to work.
Ticket generation continues to work.
Ticket replacement continues to work.
Ticket revocation continues to work.
Staff authentication continues to work.
Excel imports continue to work.
CHECKIN-07 does not implement corrections.
CHECKIN-07 does not implement dashboard overrides.

Tests must not modify hosted Supabase.

Homepage update

Update the public status cards:

Application configured
Complete

Registration imports
Administrator protected

Staff authentication
Complete

Secure ticket generation
Complete

Mobile ticket scanner
Complete

Graduate and guest check-in
Ready for protected testing

Live attendance dashboard
Not implemented

Do not display attendance counts publicly.

Staff page update

Update /staff so all active roles see:

Scan and Check In
Validate tickets and record graduate and registered-party arrivals.

Administrator-only links must remain hidden from scanner and supervisor roles.

README updates

Document:

Validation-to-check-in flow
Registration-level attendance
Partial arrivals
Guest-first arrivals
Separate child categories
One-time validation attempts
Fifteen-minute validation lifetime
Idempotency
Concurrency protection
Append-only check-in records
Ticket replacement behavior
Event and registration revalidation
Network retry behavior
CHECKIN-08 correction separation
Manual migration deployment
Browser testing procedure

Prominently include:

Attendance belongs to the registration. Replacing a ticket does not reset or duplicate attendance.

Also include:

CHECKIN-07 records positive arrivals only. Corrections and reversals require the supervisor workflow in CHECKIN-08.
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

Supervisor corrections
Attendance reversal
Negative adjustment UI
Admission beyond registered allowance
Walk-in guest registration
Additional guest payment
Registration editing
Guest-name confirmation
Live attendance dashboard
Export attendance report
Historical ticket redesign
Replaced watermark correction
Event information redesign
Excel-header compatibility
PDF ticket generation
Ticket email delivery
Assigned seating
Required checks

Run:

npm run checkin:verify-config
npm run scanner:verify-config
npm run tickets:verify-config
npm run db:validate:mock
npm run db:generate:mock-import
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

checkin:verify-config may report that the new migration is not deployed.

It must modify nothing and expose no personal information.

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
Token hashes in UI responses
Supabase secrets
Student contact information
Guest names in check-in records
Payment data
Browser storage of check-in state
Database IDs exposed after confirmation
Acceptance criteria
Validated tickets may proceed to arrival confirmation.
Scanner, supervisor and administrator roles may record arrivals.
Anonymous and inactive users are denied.
The browser sends no registration, ticket or event ID.
The validation attempt identifies the registration securely.
Validation attempts expire after 15 minutes.
A validation attempt may be consumed once.
Graduate attendance can be recorded.
Adult guest attendance can be recorded.
Both child categories can be recorded.
Partial party arrivals work.
Guests may arrive before the graduate.
Graduate may arrive separately.
Attendance cannot exceed registration allowances.
Registration locking prevents race-condition over-admission.
Duplicate submissions are idempotent.
Network retries do not duplicate attendance.
Check-in records are append-only.
CHECKIN-07 inserts positive deltas only.
Attendance is calculated by registration.
Replacing a ticket does not reset attendance.
A replacement ticket cannot readmit an already admitted party.
Revoked and replaced tickets cannot create attendance.
Ticket status is rechecked during confirmation.
Registration status is rechecked during confirmation.
Event status is rechecked during confirmation.
Full arrival is clearly displayed.
Partial arrival is clearly displayed.
Already-complete registration has no admission action.
No personal contact or payment information is exposed.
No raw token or QR payload is stored or logged.
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
Existing check-in schema reused
Check-in metadata added
Atomic database function
Registration-locking behavior
Validation-attempt behavior
Idempotency behavior
Graduate arrival behavior
Adult guest arrival behavior
Child arrival behavior
Partial-arrival behavior
Guest-first behavior
Replacement-ticket behavior
Event and registration revalidation
Append-only audit behavior
Authorization
API route
Mobile UI
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

Raw ticket tokens
Token hashes
QR payload values
Full staff emails
UUIDs
Student contact details
Guest names
Real student information

Do not commit or push.