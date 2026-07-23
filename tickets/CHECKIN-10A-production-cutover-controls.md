# CHECKIN-10A — Production Cutover Controls and Distribution Runbook

## Project

**Repository:** `C:\Users\USER\Desktop\Graduationcheckin`  
**Branch:** `feat/checkin-10a-production-cutover-controls`  
**Depends on:** CHECKIN-09C merged into `main`

## Purpose

Prepare the graduation ticket system for safe production use without sending any real graduate email during implementation.

CHECKIN-10A establishes:

- strict test versus production separation
- a production event and production-only safety gates
- separate Google Sheets for test and production
- initial, resend and replacement delivery rules
- safe production run sizes
- interrupted-run recovery
- a complete administrator operator runbook
- production readiness checks

Real registration import and real email sending are not performed in this ticket.

---

## 1. Required operating model

### Test event

- Event code: `GRAD-2026-DEV`
- Synthetic registrations only
- Local development uses this event
- Test delivery batches only
- Test workbook only
- All emails redirected to the configured internal test recipient

### Production event

- Event code: `CONVOCATION-2026`
- Real registrations only
- Vercel Production uses this event
- Production delivery batches only
- Production workbook only
- Emails go to intended graduate addresses

A test batch must never be converted into a production batch.

---

## 2. Deployment and event gates

### Local development

```text
APP_ENV=development
ACTIVE_GRADUATION_EVENT_CODE=GRAD-2026-DEV
```

Production delivery preparation and production sending-package export must be blocked locally.

### Vercel Preview

```text
APP_ENV=preview
ACTIVE_GRADUATION_EVENT_CODE=GRAD-2026-DEV
```

Production delivery preparation must be blocked.

### Vercel Production

```text
APP_ENV=production
ACTIVE_GRADUATION_EVENT_CODE=CONVOCATION-2026
```

Production controls are available only when the active event is the production event.

Every administrator page must clearly display:

- DEVELOPMENT / TEST
- PREVIEW / TEST
- PRODUCTION

The event banner must separately show TEST EVENT or PRODUCTION EVENT.

---

## 3. Production event

Create an idempotent production-event creation and verification workflow.

Required event:

- Code: `CONVOCATION-2026`
- Title: `Convocation Ceremony 2026`
- Date: Sunday, July 26, 2026
- Time: 12:00 PM to 4:00 PM
- Timezone: America/Toronto
- Venue: Mississauga Grand Banquet & Event Centre
- Address: 35 Brunel Road, Mississauga, ON L4Z 3E8
- Status initially: draft
- Test event: false

The creation workflow must:

- fail safely if a conflicting event exists
- be idempotent
- never copy synthetic registrations
- never create tickets automatically
- print a verification summary without secrets

---

## 4. Separate Google Sheets

### Test workbook

Suggested name:

`Toronto Academy Graduation Tickets - TEST`

Required configuration:

```text
WORKBOOK_MODE = TEST
TEST_MODE = TRUE
TEST_RECIPIENT_EMAIL = internal administrator inbox
MAX_PER_RUN = 1
PRODUCTION_CONFIRMATION = blank
```

Visible banner:

`TEST WORKBOOK — all messages are redirected to the internal test recipient.`

### Production workbook

Suggested name:

`Toronto Academy Convocation 2026 - PRODUCTION DISTRIBUTION`

Required configuration:

```text
WORKBOOK_MODE = PRODUCTION
TEST_MODE = FALSE
TEST_RECIPIENT_EMAIL = blank
MAX_PER_RUN = 25
AUTHORIZED_SENDER_EMAIL = office@torontoacademy.ca
REPLY_TO_EMAIL = office@torontoacademy.ca
```

Visible banner:

`PRODUCTION WORKBOOK — messages are delivered to graduate email addresses.`

The production workbook must:

- be owned by `office@torontoacademy.ca`
- be editable only by authorized administrators
- block loading a test queue
- block sending when the active event is not `CONVOCATION-2026`
- block sending when the active mode is not production

---

## 5. Production confirmation gate

Before any production send, display:

```text
PRODUCTION SEND

Event: CONVOCATION-2026
Batch: <batch code>
Recipients selected: <count>
Remaining prepared: <count>
Sender: office@torontoacademy.ca
Mode: PRODUCTION
```

Require the administrator to type the exact active batch code.

Block when:

- workbook mode is TEST
- TEST_MODE is TRUE
- active event is not `CONVOCATION-2026`
- active batch mode is not production
- sender account differs
- batch validation is stale
- active queue changed after validation
- selected count exceeds configured limit
- remaining quota is insufficient

---

## 6. Delivery purposes

### Initial

For graduates not yet production-sent through this system.

Rules:

- exclude production-sent deliveries
- exclude registrations already in another open production batch
- require a valid intended email
- use the current active ticket and PDF

### Resend

For sending the same valid ticket again.

Examples:

- graduate did not receive it
- graduate deleted it
- corrected email after review
- prior external send
- intentional administrator resend

Rules:

- same ticket remains valid
- administrator records a reason
- attempt remains auditable
- no replacement ticket is created

### Replacement

For when the ticket itself must change.

Examples:

- ticket compromised
- party information changed
- old QR must become invalid
- ticket revoked

Rules:

- generate a new ticket/document version
- old ticket remains traceable
- old QR is no longer admissible
- replacement reason is required

UI text:

`Resend sends the same valid ticket again. Replacement creates a new ticket and invalidates the old one.`

---

## 7. Previously sent outside the system

Add an administrator workflow:

`Record previous external delivery`

Fields:

- registration
- ticket/document reference if known
- previous send date
- channel
- recorded by
- note

This record must:

- not pretend the app sent the email
- not create a Google Apps Script attempt
- remain visible in audit history
- influence initial-batch eligibility
- allow an intentional resend later

---

## 8. Production eligibility preview

Before preparing a production batch, show:

- total registrations
- eligible for initial delivery
- already production sent
- previously sent externally
- invalid or missing email
- already in open production batch
- cancelled or suppressed
- replacement required
- resend eligible

Allow:

- Initial production batch
- Selected resend batch
- Failed-delivery retry batch
- Replacement batch

No registration may appear in two open production batches for the same purpose.

---

## 9. Safe run sizes

### Pilot

Add:

`Send 5-Recipient Production Pilot`

Rules:

- exactly five eligible prepared rows, unless fewer remain
- production confirmation required
- no automatic continuation
- results must be exported and imported before full release is enabled

### Normal run

Add:

`Send Next 25 Production Emails`

Rules:

- maximum 25
- sequential personalized emails
- one PDF attachment per graduate
- update each row immediately after success
- append one Send Log row per attempt
- skip terminal successful rows
- use LockService to block concurrent runs

### Interrupted run

If a 25-row execution stops after 17 sends:

- 17 rows remain sent and logged
- 8 remain eligible
- rerunning sends only remaining eligible rows
- no successful row is resent automatically

---

## 10. Result checkpoint workflow

Recommended after every send run:

```text
Send
→ Export New Results for Active Batch
→ Import results into application
→ Verify counts
→ Continue
```

The next send run should be disabled or strongly warned when unimported results exist.

Display:

- last send run
- last result export
- last result import
- new attempts waiting for import
- production sent
- failed
- remaining prepared

---

## 11. Production progress panel

Show:

- total deliveries
- production sent
- failed
- bounced
- resend required
- remaining prepared
- last run attempted
- last run sent
- last run failed
- last results imported
- unimported attempts
- daily quota remaining when reported from the workbook

---

## 12. Administrator runbook

Add:

`/admin/tickets/distribution/runbook`

Sections:

1. Test workbook setup
2. Production workbook setup
3. Creating the production event
4. Importing registrations
5. Registration reconciliation
6. Generating PDFs
7. Internal test workflow
8. Preparing production batch
9. Five-recipient pilot
10. Sending next 25
11. Exporting and importing results
12. Interrupted-run recovery
13. Failed delivery retry
14. Resend versus replacement
15. Recording prior external delivery
16. Bounce review
17. Completion checklist
18. Emergency stop procedure

The runbook must be written for a nontechnical administrator.

---

## 13. Authorization

### Administrator

Can:

- create and verify production event
- review eligibility
- prepare initial, resend and replacement batches
- access the production runbook
- import results
- view full audit history
- record previous external delivery

### Supervisor

Cannot:

- prepare ticket distribution
- load production queue
- send ticket emails
- import distribution results
- change production event
- record external delivery

Supervisor access remains focused on scanning, manual check-in and attendance.

---

## 14. Non-goals

CHECKIN-10A must not:

- import the final real registration workbook
- send real graduate emails
- create production tickets automatically
- redesign scanner UI
- redesign attendance analytics
- remove existing roles
- access `_reference`
- edit deployed migrations
- expose service-role credentials
- weaken recipient, signature, checksum or batch validation

---

## 15. Required tests

1. Local development blocks production preparation.
2. Preview deployment blocks production preparation.
3. Production deployment with test event blocks production preparation.
4. Production deployment with production event permits authorized preparation.
5. Test workbook rejects production queue.
6. Production workbook rejects test queue.
7. Production confirmation requires the exact batch code.
8. Stale validation blocks sending.
9. Changed queue after validation blocks sending.
10. Pilot selects at most five.
11. Normal run selects at most 25.
12. Successful rows are persisted individually.
13. Interrupted run resumes remaining rows only.
14. Concurrent runs are blocked.
15. Initial batch excludes production-sent registrations.
16. Initial batch excludes open-batch registrations.
17. Resend preserves the valid ticket.
18. Replacement invalidates the old ticket and creates a new version.
19. External delivery record does not create a send attempt.
20. External delivery affects initial eligibility.
21. Unimported results warning appears.
22. Test and production counters remain independent.
23. Supervisor cannot access production controls.
24. Administrator can access production controls.
25. Existing CHECKIN-09C isolation remains green.
26. Existing importer security remains unchanged.
27. Existing scanner and attendance tests remain green.
28. No real personal data in tests.

---

## 16. Acceptance criteria

Complete only when:

- local and preview cannot prepare production sends
- production event is separate from the test event
- test and production Google Sheets are clearly different
- each workbook rejects the wrong queue mode
- administrator must type the batch code before production sending
- five-recipient pilot is available
- normal run is capped at 25
- interrupted runs do not resend successful rows automatically
- initial, resend and replacement are clearly distinct
- prior external sends can be recorded
- eligibility preview is available
- production progress is visible
- operator runbook is complete
- all quality gates pass
- no real email is sent during implementation

---

## 17. Claude implementation prompt

```text
You are implementing CHECKIN-10A in:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-10a-production-cutover-controls

FIRST RUN

git branch --show-current
git status --short
git log -5 --oneline

Stop if the branch is different.

Read:

tickets/CHECKIN-10A-production-cutover-controls.md

Do not reset, stash, clean, commit, push, deploy migrations, send email, access _reference, or use real personal data in tests.

PRIMARY GOAL

Make production ticket distribution unmistakably separate from testing and safe for a nontechnical administrator.

IMPLEMENT THE FULL TICKET

Key requirements:

1. Deployment and event production gates.
2. Idempotent CONVOCATION-2026 creation and verification workflow.
3. Clear TEST and PRODUCTION banners.
4. Separate test-workbook and production-workbook modes.
5. Production workbook rejects test queues.
6. Test workbook rejects production queues.
7. Exact batch-code production confirmation.
8. Initial, resend and replacement purposes.
9. Previous external-delivery audit workflow.
10. Production eligibility preview.
11. Five-recipient pilot.
12. Maximum 25 per normal production run.
13. Immediate per-row persistence for interrupted-run safety.
14. LockService concurrency protection.
15. Unimported-results checkpoint warning.
16. Production progress panel.
17. Administrator runbook route.
18. Administrator-only production controls.
19. Preserve all CHECKIN-09C active-batch and importer protections.

Use additive migrations only when required.
Never edit a deployed migration.
Do not run supabase db push.

Use synthetic data only.

Run:

npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

FINAL REPORT

Report:

- files changed
- routes added
- migration status and filename
- environment gates
- production-event workflow
- workbook-mode behavior
- confirmation behavior
- initial/resend/replacement behavior
- previous external delivery behavior
- pilot and normal-run behavior
- interrupted-run recovery behavior
- checkpoint behavior
- runbook sections
- Apps Script files to recopy
- tests, lint, typecheck, build and diff results
- confirmation no email sent
- confirmation no migration deployed
- confirmation nothing committed or pushed
```
