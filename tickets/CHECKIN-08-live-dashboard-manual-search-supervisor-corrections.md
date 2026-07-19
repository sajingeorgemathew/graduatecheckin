CHECKIN-08: Live Attendance Dashboard, Manual Search and Supervisor Corrections
Objective

Implement the event-day attendance management system for the Toronto Academy of Education Graduation Check-In application.

CHECKIN-08 must provide:

A live attendance dashboard.
Registration-level arrival totals.
Recent attendance activity.
Manual graduate search.
Manual arrival when a QR ticket is unavailable.
Supervisor attendance corrections.
Exact reversal of an incorrect attendance entry.
Append-only attendance history.
Strong role separation.
Safe idempotency and concurrency protection.
Registration-level attendance preserved across ticket replacement.
Mobile and desktop event-day usability.
Preservation of all CHECKIN-02 through CHECKIN-07 behavior.

Ticket PDF generation and email delivery remain for CHECKIN-09.

Production readiness and final quality testing remain for CHECKIN-10.

Project information

Application:

Graduation Check-In

Organization:

Toronto Academy of Education

Local path:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-08-dashboard-supervisor-corrections

Hosted Supabase project reference:

rydqtotlhzgckdxiditt
Existing foundation

CHECKIN-02 created:

Events
Registrations
Guests
Tickets
Attendance records
Mock data

CHECKIN-03 created:

Excel import and preview
Stable registration identifiers
Safe upsert behavior

CHECKIN-04 created:

Scanner, supervisor and administrator roles
Trusted staff authentication
Staff management

CHECKIN-05 created:

Secure QR tickets
Ticket generation
Replacement and revocation
Ticket management

CHECKIN-06 created:

Mobile scanner
Secure ticket validation
Manual ticket-code validation
Validation-attempt audit

CHECKIN-07 created:

Graduate arrival
Adult guest arrival
Children age 0 to 4 arrival
Children age 5 to 10 arrival
Partial arrivals
Guest-first arrivals
Append-only positive attendance records
Registration-level attendance calculation

Preserve all previous migrations and functionality.

Deferred quality-review items

Do not address these during CHECKIN-08:

Missing replaced-ticket watermark
Historical-ticket visibility improvements
Final event information
Ticket event-detail redesign
RSVP Excel-header compatibility
Ticket PDF generation
Ticket email distribution
General visual cleanup unrelated to attendance management

These items remain for later quality testing or CHECKIN-09 and CHECKIN-10.

Critical attendance rule

Attendance belongs to the registration.

It does not belong only to the ticket.

Every dashboard count, manual search result, correction and reversal must calculate attendance across all applicable:

graduation_checkins

for the registration.

Therefore:

Replacing a ticket never resets attendance.
Revoking a ticket never deletes earlier attendance.
A new replacement ticket sees all previous arrivals.
Corrections apply to registration-level totals.
Dashboard totals include scan-based arrivals, manual arrivals, corrections and reversals.
Dashboard totals must never exceed registered allowances.
Dashboard totals must never display negative attendance.
Roles
Scanner

May:

Scan and validate tickets
Record normal arrivals through CHECKIN-07

May not:

Open the live attendance dashboard
Search all registrations
Record manual arrivals without a ticket
Create corrections
Reverse attendance records
View correction reasons
Supervisor

May:

Open the attendance dashboard
Search registrations
View attendance history
Record manual arrivals
Create attendance corrections
Reverse eligible attendance entries
View correction reasons
Administrator

May perform all supervisor functions.

Administrator-only ticket management, imports and staff management remain unchanged.

Critical security rules
Every dashboard page and API must authorize server-side.
Proxy is not sufficient authorization.
Dashboard, search and correction access require supervisor or administrator.
Scanner-role users must be denied.
Inactive staff must be denied.
Password-change-required staff must be denied or redirected.
Do not accept actor identity or role from the browser.
Do not accept event ID or event code from the browser.
Resolve ACTIVE_GRADUATION_EVENT_CODE server-side.
Recheck the active event during every write operation.
Do not trust browser-calculated attendance.
Recalculate attendance inside the database transaction.
Lock the registration before manual arrival, correction or reversal.
Never update or delete an earlier attendance entry.
Never store raw QR payloads, ticket tokens or token hashes.
Never expose student email, phone or payment information.
Do not expose guest names.
Do not expose internal import notes.
Do not place database UUIDs in public-facing URLs.
Do not store search or correction state in localStorage or sessionStorage.
Do not access _reference.
Do not use real student data in tests.
Do not modify deployed migrations.
Do not use long hyphens or em dashes in UI, documentation or comments.
No new external dependency required

Use the existing:

Next.js
React
Zod
Supabase
Node crypto
Existing event resolver
Existing authorization helpers
Existing attendance calculations

Do not install charting libraries.

Use accessible CSS-based progress bars and summary cards.

New migration

Create exactly one migration:

npx supabase migration new create_attendance_supervisor_workflow

Do not modify earlier migrations.

Inspect the existing attendance schema

Before writing the migration, inspect:

graduation_checkins

Determine whether the existing method, action or enum column already distinguishes attendance-entry types.

Reuse existing fields where suitable.

Do not create duplicate columns with the same meaning.

Attendance entry classifications

The final attendance history must distinguish:

scan_arrival
manual_arrival
correction
reversal

If the existing attendance method or action enum can safely represent these values, extend and reuse it.

Otherwise add:

attendance_entry_kind

with those four allowed values.

Existing CHECKIN-07 positive arrival rows must be treated as:

scan_arrival

Do not break legacy or mock attendance rows.

Extend graduation_checkins

Add only metadata that is currently missing.

Required behavior may need:

entry_kind
reason
related_checkin_id
supervisor_user_id

Requirements:

reason is nullable for scan-based arrival records.
reason is required for manual arrival, correction and reversal.
Reason length must be between 5 and 500 characters.
related_checkin_id may reference an earlier graduation_checkins row.
supervisor_user_id references auth.users.
Legacy rows remain valid.
Add indexes for:
entry kind
supervisor user
related check-in
registration and created time
Add a unique partial index preventing the same attendance row from being reversed more than once.
Preserve existing positive and future negative-delta support.
Add no contact, token, ticket-code or payment columns.
Safe registration references

Manual search results must not expose registration UUIDs directly to browser URLs.

Create a short-lived server-signed registration action token.

Suggested module:

src/features/attendance/action-token.ts

Suggested structure:

ra1.<registration-id>.<expiry>.<signature>

Requirements:

HMAC SHA-256
Base64URL signature
Key derived from TICKET_TOKEN_SECRET using a distinct context
Maximum lifetime of 15 minutes
Event ID or event code bound into the signature
Constant-time signature comparison
Never stored in the database
Never logged
Never placed in a URL or query string
Kept only in current React memory
Invalid or expired tokens rejected generically

The token may be returned only to authorized supervisor or administrator pages.

Create similar short-lived signed references for reversible attendance entries when needed.

Do not expose raw database IDs in correction forms.

Atomic manual-arrival function

Create:

public.apply_manual_graduation_arrival(...)

Use security definer and a fixed safe search_path.

Suggested inputs:

p_actor_user_id
p_event_id
p_registration_id
p_request_id
p_graduate_arriving
p_adult_guests_arriving
p_children_0_4_arriving
p_children_5_10_arriving
p_reason

Requirements:

Verify the actor is an active supervisor or administrator.
Validate the request ID.
Return an earlier successful result for the same actor and request ID.
Lock the event.
Reject missing, closed or archived events.
Lock the registration.
Require the registration to belong to the active event.
Require the registration to remain eligible.
Recalculate registration-level attendance.
Validate positive arriving-now counts.
Require at least one arriving person.
Prevent graduate admission more than once.
Prevent every guest category from exceeding its allowance.
Insert one append-only attendance row.
Classify it as manual_arrival.
Store the reason.
Record the acting supervisor or administrator.
Store no ticket when no ticket was used.
Return safe attendance totals only.
Never alter earlier attendance rows.
Never change registration allowances.
Never change ticket status.
Never change payment status.

Manual arrival exists for situations such as:

Ticket unavailable
Damaged phone
Graduate cannot access the ticket
Supervisor verified the registration manually

It is not a general override of registered allowances.

Atomic attendance-correction function

Create:

public.apply_attendance_correction(...)

Use security definer and a fixed safe search_path.

Suggested inputs:

p_actor_user_id
p_event_id
p_registration_id
p_request_id
p_graduate_delta
p_adult_guest_delta
p_child_0_4_delta
p_child_5_10_delta
p_reason

Requirements:

Verify active supervisor or administrator.
Require a reason between 5 and 500 characters.
Require at least one non-zero delta.
Permit positive or negative correction deltas.
Lock the event and registration.
Recalculate current registration-level attendance.
Calculate totals after the proposed correction.
Final graduate total must remain between 0 and 1.
Final guest and child totals must remain between 0 and their registered allowances.
Insert one append-only correction row.
Do not update or delete prior records.
Store the acting supervisor.
Store the reason.
Return safe before-and-after totals.
Support idempotent retries by actor and request ID.
Roll back completely on failure.

Correction examples:

One adult guest was accidentally counted twice.
A child was recorded in the wrong age category.
The graduate was omitted from an earlier check-in.
The wrong number of guests was selected.

Corrections must never increase attendance beyond the registered allowance.

Atomic reversal function

Create:

public.reverse_graduation_checkin(...)

Use security definer and a fixed safe search_path.

Suggested inputs:

p_actor_user_id
p_event_id
p_original_checkin_id
p_request_id
p_reason

Requirements:

Verify active supervisor or administrator.
Require a reason between 5 and 500 characters.
Lock the original attendance row.
Reject a reversal row as a reversal target.
Reject an already-reversed row.
Lock the registration.
Verify the original entry belongs to the active event.
Insert an exact negative copy of the original entry’s attendance deltas.
Classify the new entry as reversal.
Link it through related_checkin_id.
Store the acting supervisor.
Store the reason.
Ensure resulting registration totals remain non-negative.
Never update the original row.
Never delete the original row.
Prevent double reversal through a database uniqueness rule.
Return safe updated totals.
Support actor and request idempotency.
Roll back completely on failure.

Do not reverse a row when later corrections would make exact reversal unsafe. In that situation, direct staff to use an attendance correction instead.

Concurrency protection

Every write operation must lock the registration before calculating totals.

Prevent scenarios where:

Two supervisors open the same registration.
Both see the same remaining guest count.
Both submit manual attendance.
Only the first valid request succeeds.
The second receives a safe attendance conflict and refreshed totals.

Attendance must never exceed allowances.

Live dashboard route

Create:

/staff/attendance

Access:

Supervisor
Administrator

Denied:

Scanner
Anonymous
Inactive staff
Password-change-required staff

Add:

Attendance Dashboard

to the protected staff navigation for supervisor and administrator roles only.

Dashboard summary cards

Display:

Eligible registrations
Graduates arrived
Fully checked in registrations
Partially checked in registrations
Not yet arrived
Expected total attendance
Total people arrived
Remaining expected attendance

Also display category totals:

Graduates
Adult guests
Children age 0 to 4
Children age 5 to 10

Each category should show:

arrived / registered
Dashboard calculation rules

For each eligible registration:

Sum every attendance delta across the registration.
Clamp graduate attendance between 0 and 1.
Clamp guest and child categories between 0 and registered allowances.
Calculate total arrived.
Calculate total remaining.
Classify:
Not arrived
Partial
Complete

A registration is complete only when:

Graduate has arrived
All registered adult guests have arrived
All registered children have arrived

A registration with guests present but graduate absent is partial.

Blocked, failed, cancelled and review-required registrations must not count as eligible attendance expectations.

Dashboard freshness

Use safe client polling rather than a new real-time dependency.

Requirements:

Refresh every 15 seconds while the page is visible.
Pause or reduce polling when the browser tab is hidden.
Manual Refresh button.
Show:
Last updated time
Refreshing status
Stale-data warning after 60 seconds without a successful refresh
Prevent overlapping refresh requests.
Use Cache-Control: private, no-store.
Do not expose raw Supabase subscriptions to the browser.
Dashboard API

Create:

GET /api/staff/attendance/summary

Requirements:

Supervisor-level authorization
Active event resolved server-side
Private no-store response
No query-provided event ID
Safe aggregate counts only
No names or contact information
No raw database errors
No tokens or hashes
Recent attendance activity

Display the most recent 50 attendance entries.

Columns or mobile cards:

Time
Graduate
Entry type
Graduate delta
Adult guest delta
Children age 0 to 4 delta
Children age 5 to 10 delta
Recorded by
Reason

Requirements:

Reason visible only to supervisor and administrator.
Show safe staff display name, not email.
No contact information.
No guest names.
No payment information.
Show correction and reversal labels clearly.
Negative values must include a visible minus sign.
Activity should not imply that the registration allowance changed.
Manual registration search

Add a search section to:

/staff/attendance

or a nested protected route:

/staff/attendance/search

Search fields:

Graduate name
Ticket code
Source registration ID

Requirements:

Minimum two characters for name search.
Ticket-code search may require exact normalized format.
Source registration ID search may be exact or prefix.
Do not search by email or phone.
Limit results to the active event.
Maximum 25 results.
Use server-side search.
Use parameterized database queries.
Do not reveal similar ticket codes during exact code search.
Do not return registration UUIDs.
Return a short-lived signed registration reference.
Private no-store response.
Search result display

Show:

Graduate name
Registration status
Ticket status
Registered party
Arrived party
Remaining party
Attendance classification

Do not show:

Email
Phone
Guest names
Payment information
Source payment totals
Internal notes
Database UUIDs
Ticket token or hash

Available actions:

View Attendance
Manual Arrival
Correct Attendance

Reversal actions appear only within attendance history.

Registration attendance detail

Display:

Graduate
Registration status
Current ticket status
Registered party
Current attendance
Remaining party
Attendance history

History entries show:

Entry type
Deltas
Time
Staff display name
Reason when applicable
Reversal status

Do not expose raw IDs.

Manual-arrival interface

Available to:

Supervisor
Administrator

Display:

Graduate arriving now
Adult guests arriving now
Children age 0 to 4 arriving now
Children age 5 to 10 arriving now
Reason

Reason examples may include:

Ticket unavailable
Device unavailable
Manually verified registration
Supervisor-directed admission

Do not allow a generic empty reason.

Require a final review showing:

Current attendance
Arriving now
Attendance after confirmation

Primary action:

Record Manual Arrival

Do not require typed confirmation text.

Use idempotent request IDs and disable repeat submission while processing.

Correction interface

Available to:

Supervisor
Administrator

Display current values and proposed adjustments.

For each category, provide:

Minus control
Delta value
Plus control
Current total
Resulting total

Reason is required.

Primary action:

Apply Correction

Before submission show:

Current Attendance
Correction
Attendance After Correction

Require exact confirmation text:

APPLY CORRECTION

Corrections are higher risk than normal arrivals and require this confirmation.

Reversal interface

A reversible attendance-history entry may show:

Reverse Entry

Require:

Reason
Summary of the original entry
Summary of the exact negative reversal
Confirmation text:
REVERSE ENTRY

Do not allow:

Reversing a reversal
Reversing an already-reversed entry
Reversal that would create negative attendance
Scanner-role access

After reversal, show both the original entry and its linked reversal.

Safe supervisor APIs

Create thin protected endpoints such as:

GET  /api/staff/attendance/summary
POST /api/staff/attendance/search
POST /api/staff/attendance/detail
POST /api/staff/attendance/manual-arrival
POST /api/staff/attendance/correction
POST /api/staff/attendance/reverse

Exact route organization may vary.

Every route must:

Authorize supervisor-level staff.
Resolve active event server-side.
Validate inputs with Zod.
Determine actor from trusted session.
Use private no-store responses.
Avoid logging request bodies.
Return safe structured errors.
Never expose PostgreSQL details.
Never return token or hash information.
Never return database UUIDs.
Never accept actor or event identity from the browser.
HTTP status behavior

Use:

200 for successful operations
200 for idempotent retries
400 for malformed input
401 for unauthenticated
403 for scanner-role, inactive or unauthorized staff
409 for:
attendance conflict
already reversed entry
stale attendance state
duplicate non-idempotent operation
410 for expired signed registration or entry reference
422 for:
zero manual arrival
invalid correction
result outside allowances
missing or short reason
unsafe reversal
503 for active-event configuration problems
500 only for unexpected errors

Messages must be staff-readable and must not expose database internals.

Feature structure

Create a modular structure similar to:

src/features/attendance/
  constants.ts
  types.ts
  schemas.ts
  errors.ts
  permissions.ts
  action-token.ts
  calculations.ts
  summaries.ts
  repository.ts
  service.ts
  response.ts
  manual-arrival.ts
  correction.ts
  reversal.ts
  components/
    attendance-dashboard.tsx
    attendance-summary-cards.tsx
    attendance-category-progress.tsx
    attendance-refresh-control.tsx
    attendance-search.tsx
    attendance-search-results.tsx
    attendance-detail.tsx
    attendance-history.tsx
    manual-arrival-form.tsx
    correction-form.tsx
    reversal-form.tsx

Keep page and route files thin.

Do not duplicate CHECKIN-07 attendance-calculation logic. Extract shared calculations when appropriate.

Mobile and desktop design

Use:

Navy
Gold
Cream
White
High contrast
Large touch controls
Responsive layout
No horizontal scrolling on phones

Desktop:

Summary-card grid
Search and filters
Activity table

Mobile:

Stacked summary cards
Category progress
Search results as cards
Attendance activity as cards
Large correction controls

Do not introduce a charting dependency.

Staff-page update

Update /staff for supervisor and administrator roles:

Attendance Dashboard
Monitor arrivals, find registrations, and correct attendance records.

Scanner users should continue seeing only scanner-related workflows.

Database types

Update:

src/types/database.ts

Include:

New attendance-entry enum when added
New graduation_checkins metadata
Manual-arrival function
Correction function
Reversal function
Safe function return types

Do not use any.

Configuration verification

Create:

scripts/attendance/verify-config.ts

Add:

"attendance:verify-config": "tsx scripts/attendance/verify-config.ts"

The script must:

Load .env.local
Verify Supabase server configuration
Verify active event configuration
Confirm the active event exists
Confirm CHECKIN-07 function exists
Confirm CHECKIN-08 functions exist after deployment
Print aggregate attendance counts only
Print no names
Print no ticket codes
Print no UUIDs
Print no reasons
Print no tokens or hashes
Modify nothing
Exit nonzero on unsafe configuration

Before migration deployment, it may safely report that CHECKIN-08 functions are missing.

Automated tests

Add comprehensive tests.

Dashboard calculation tests
Eligible registration counts correctly.
Blocked registrations excluded from expected attendance.
Graduate attendance clamps between zero and one.
Guest counts clamp to allowances.
Negative correction deltas are included.
Replacement-ticket attendance is counted once by registration.
Not-arrived classification works.
Partial classification works.
Complete classification works.
Guest-first registration is partial.
Expected total attendance is correct.
Arrived total is correct.
Remaining total is correct.
Dashboard API tests
Scanner denied.
Supervisor allowed.
Administrator allowed.
Anonymous denied.
Active event resolved server-side.
Browser cannot choose event.
Response is private and no-store.
Aggregate response contains no personal information.
Database failures return safe errors.
Polling tests
Initial dashboard load works.
Refresh runs every 15 seconds.
Overlapping requests are prevented.
Polling pauses or slows when tab is hidden.
Manual refresh works.
Last-updated time changes.
Stale warning appears after 60 seconds.
Polling stops on component unmount.
Search tests
Graduate-name search works.
Name search requires minimum length.
Ticket-code search is exact.
Similar ticket codes are not returned.
Source registration search works.
Search is limited to active event.
Maximum 25 results.
Email search is unsupported.
Phone search is unsupported.
No UUID returned.
Signed registration reference is returned.
Signed reference expires.
Signed reference rejects tampering.
Signed reference is never placed in a URL or browser storage.
Manual-arrival tests
Supervisor allowed.
Administrator allowed.
Scanner denied.
Graduate-only manual arrival works.
Guest-only manual arrival works.
Child-only manual arrival works.
Full remaining party works.
Zero arrival rejected.
Reason required.
Attendance cannot exceed allowance.
Registration status rechecked.
Event status rechecked.
Registration lock exists.
Request retry is idempotent.
Original rows remain unchanged.
Entry classified as manual arrival.
Correction tests
Positive correction works within allowance.
Negative correction works above zero.
Zero correction rejected.
Reason required.
Final graduate total cannot exceed one.
Final graduate total cannot be negative.
Guest totals cannot exceed allowance.
Guest totals cannot be negative.
Child totals cannot exceed allowance.
Child totals cannot be negative.
Correction is append-only.
Current attendance recalculated inside transaction.
Registration lock exists.
Request retry is idempotent.
Entry classified as correction.
Reversal tests
Eligible entry can be reversed.
Reversal inserts exact negative deltas.
Original row remains unchanged.
Original row remains visible.
Reversal links to original row.
Reversal reason required.
Reversal of reversal blocked.
Double reversal blocked.
Unsafe negative result blocked.
Scanner denied.
Supervisor allowed.
Administrator allowed.
Request retry is idempotent.
Entry classified as reversal.
Replacement tests
Attendance recorded under old ticket remains after replacement.
Dashboard does not double-count replaced tickets.
Replacement ticket detail shows existing attendance.
Manual correction affects registration totals regardless of ticket.
Old replaced ticket remains invalid for new admission.
Authorization tests
Anonymous denied.
Missing profile denied.
Inactive staff denied.
Password-change-required staff denied.
Scanner denied.
Supervisor allowed.
Administrator allowed.
API authorization independent from Proxy.
Database functions independently verify supervisor-level role.
Privacy tests
No email returned.
No phone returned.
No guest names returned.
No payment information returned.
No raw token returned.
No token hash returned.
No QR payload returned.
No database UUID returned.
No staff email returned.
No database error details returned.
Search and correction state not stored in browser storage.
Migration tests

Verify:

Earlier migrations unchanged.
Existing graduation_checkins table reused.
Entry type support exists.
Reason field exists.
Related-entry support exists.
Supervisor actor support exists.
Reversal uniqueness exists.
Required indexes exist.
Manual-arrival function is security definer.
Correction function is security definer.
Reversal function is security definer.
Functions have fixed safe search paths.
Public, anon and authenticated execution revoked.
Functions verify supervisor or administrator.
Functions lock registration.
Functions recalculate totals.
Functions are append-only.
No token, contact or payment columns added.
Regression tests
QR scanning continues to work.
Ticket validation continues to work.
CHECKIN-07 normal arrival continues to work.
Partial arrivals continue to work.
Ticket generation continues to work.
Ticket replacement continues to work.
Ticket revocation continues to work.
Staff authentication continues to work.
Excel imports continue to work.
CHECKIN-08 does not generate PDFs.
CHECKIN-08 does not email tickets.

Tests must not modify hosted Supabase.

Homepage update

Update public status cards:

Application configured
Complete

Registration imports
Administrator protected

Staff authentication
Complete

Secure ticket generation
Complete

Mobile scanner
Complete

Graduate and guest check-in
Complete

Attendance dashboard and corrections
Ready for protected testing

Ticket PDF and email
Not implemented

Do not display live attendance publicly.

README updates

Document:

Live dashboard calculations
Fifteen-second refresh
Registration-level totals
Manual registration search
Signed registration references
Manual arrival
Supervisor correction
Exact reversal
Append-only audit history
Concurrency protection
Idempotency
Replacement-ticket behavior
Role restrictions
Event-day testing
CHECKIN-09 separation
Manual migration deployment

Prominently include:

Attendance records are append-only. Corrections and reversals create new records and never edit or delete the original attendance entry.

Also include:

Attendance belongs to the registration. Ticket replacement does not reset, duplicate or transfer attendance.
Environment variables

No new Vercel environment variable is required.

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

Ticket PDF generation
Ticket email distribution
Public dashboard
Public registration search
Walk-in registration creation
Registered-allowance editing
Additional guest payment
Assigned seating
Final event information
Ticket visual corrections
Excel-header compatibility changes
Destructive attendance deletion
Editing an existing attendance row
Attendance export
Automatic event closure
Production incident monitoring
Required checks

Run:

npm run attendance:verify-config
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

attendance:verify-config may report that the CHECKIN-08 migration is not deployed.

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
Token hashes exposed to UI
Supabase secrets
Contact information
Guest names
Payment details
Browser storage of attendance state
Database IDs in URLs
Destructive attendance update or delete operations
Acceptance criteria
Supervisor and administrator can access the dashboard.
Scanner role is denied.
Dashboard calculates registration-level attendance.
Dashboard refreshes automatically.
Manual refresh works.
Dashboard displays last-update status.
Eligible expectations exclude blocked registrations.
Graduate, guest and child totals are accurate.
Registration search works by name.
Exact ticket-code search works.
Source registration search works.
Email and phone search are not supported.
Search returns no database UUID.
Manual arrival works without a QR ticket.
Manual arrival cannot exceed allowances.
Manual arrival requires a reason.
Corrections support positive and negative deltas.
Corrections cannot exceed allowances.
Corrections cannot create negative totals.
Corrections require a reason and confirmation.
Reversal creates an exact negative entry.
Original attendance entry remains unchanged.
Double reversal is prevented.
Reversal of a reversal is prevented.
Attendance remains append-only.
Concurrency locking prevents over-admission.
Duplicate requests are idempotent.
Ticket replacement does not reset attendance.
Dashboard does not double-count replacement tickets.
Recent attendance activity is displayed.
Reasons are visible only to authorized roles.
No contact or payment information is exposed.
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
Existing attendance schema reused
Attendance-entry classifications
Metadata additions
Signed registration-reference behavior
Dashboard calculations
Dashboard refresh behavior
Search behavior
Manual-arrival behavior
Correction behavior
Reversal behavior
Append-only audit behavior
Concurrency behavior
Idempotency behavior
Replacement-ticket behavior
Authorization
Routes and APIs
Mobile and desktop design
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
Student contact information
Guest names
Real student information

Do not commit or push.