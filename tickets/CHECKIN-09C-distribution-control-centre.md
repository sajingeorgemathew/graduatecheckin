# CHECKIN-09C — Distribution Control Centre, Batch Isolation and Safe Production Sending

## Project

**Repository:** `C:\Users\USER\Desktop\Graduationcheckin`  
**Branch:** `feat/checkin-09c-distribution-control-centre`  
**Depends on:** CHECKIN-09B merged into `main`

## Why this ticket is mandatory

CHECKIN-09B proved the secure delivery round trip, but the current operator experience is not yet safe enough for production.

The database evidence showed that the result file named for batch `DLV-2026-BDH4YG` contained:

- a valid attempt for delivery `DR-GHVDLHZG`, which belongs to delivery batch ID `5353dc92-43ff-447c-a65c-f0e640ca6b49`
- an older attempt for delivery `DR-DAEJ9XQY`, which belongs to a different delivery batch ID `b4c215cf-2b80-4596-b7fb-03c39bd4a5fb`

Therefore, the Google Apps Script export mixed attempts from different batches. The application protected the system by accepting the matching row and rejecting the unrelated row, but the export workflow must be corrected before production.

---

# 1. Operating model

## Event level

- `GRAD-2026-DEV` is a TEST event for synthetic records.
- `CONVOCATION-2026` is the future PRODUCTION event for real registrations.
- The interface must show a large TEST EVENT or PRODUCTION EVENT badge.
- Real registrations must never be imported into `GRAD-2026-DEV`.

## Batch level

Every delivery batch has exactly one mode:

- TEST
- PRODUCTION

A test batch is never converted into a production batch.

After a test succeeds, create a new production batch from the same approved document batch.

## Attempt level

Every email attempt has exactly one mode:

- test
- production

For test attempts:

- intended recipient remains the prepared graduate email
- actual recipient is the configured internal test inbox
- successful display label is `Test sent`
- production sent timestamps remain blank

For production attempts:

- actual recipient must equal intended recipient
- successful display label is `Production sent`
- production sent timestamps are populated

---

# 2. Distribution Control Centre

Improve:

`/admin/tickets/distribution`

## Required summary cards

- Total deliveries
- Prepared
- Test sent
- Test failed
- Production sent
- Production failed
- Bounced
- Resend required
- Cancelled
- Suppressed

Test sent must never increment Production sent.

## Required tabs

- All batches
- Test batches
- Production batches
- Result imports

## Required batch row fields

- batch code
- event code and title
- TEST or PRODUCTION badge
- purpose
- status
- total deliveries
- prepared
- test sent
- production sent
- failed
- created time
- last activity time
- View details
- Download queue
- Cancel when authorized

---

# 3. Batch details

Add:

`/admin/tickets/distribution/[batchCode]`

Show:

- event badge
- batch mode
- batch code
- purpose
- status
- created by
- created time
- current counts
- latest activity
- result-import history

## Delivery table

Show:

- graduate
- intended email
- ticket code
- delivery reference
- PDF filename
- prepared status
- latest test outcome
- latest production outcome
- total attempts
- last attempt
- View history

Filters:

- All
- Prepared
- Test sent
- Test failed
- Production sent
- Production failed
- Bounced
- Resend required
- Cancelled

Search:

- graduate name
- intended email
- ticket code
- delivery reference

## Attempt history

Show:

- attempt reference
- attempt number
- mode
- display outcome
- intended recipient
- actual recipient
- provider
- attempted time
- result import
- error code
- error message

Do not expose full row signatures or full hashes in the normal interface.

---

# 4. Result import audit

Show every import:

- file name
- batch
- status
- total
- accepted
- duplicate
- warning
- rejected
- imported by
- imported time
- View details

Import details show each source row:

- delivery reference
- attempt reference
- disposition
- mode
- outcome
- reason

Rejected rows remain visible but unapplied.

---

# 5. Google Sheet active-batch isolation

## Configuration

Add protected values:

- `ACTIVE_BATCH_CODE`
- `ACTIVE_BATCH_MODE`
- `ACTIVE_EVENT_CODE`
- `ACTIVE_QUEUE_LOADED_AT`

These values are populated from the loaded signed queue, not manually typed.

## Queue loading

Loading a queue must:

1. validate that all rows have one batch code
2. validate that all rows have one event code
3. validate that all rows have one delivery mode
4. reject mixed-batch files
5. show a replacement warning when another batch is active
6. require explicit Archive and Load New Batch before replacing an active queue
7. never combine rows from two queues

## Sending

Every send command must:

- acquire a script lock
- use only rows matching ACTIVE_BATCH_CODE
- use only rows matching ACTIVE_BATCH_MODE
- reject rows from another batch
- skip already terminal rows
- write one append-only Send Log row per attempt
- release the lock safely

No two send runs may operate concurrently.

---

# 6. Correct result exports

## Default action

Rename to:

`Export New Results for Active Batch`

It exports only Send Log rows that:

- match ACTIVE_BATCH_CODE
- match ACTIVE_BATCH_MODE
- have a terminal outcome
- have not previously been exported

It must not include attempts from another batch.

## Export tracking

Add Send Log fields:

- export_status
- exported_at
- export_file_name
- export_run_reference

Mark rows exported only after Drive file creation succeeds.

## Recovery action

Add:

`Re-export All Results for Active Batch`

This is an explicit administrator recovery action.

It may include previously exported rows, but only for ACTIVE_BATCH_CODE.

## Zero rows

When no new rows exist:

`No new results are available for the active batch.`

Do not create an empty file.

## Export summary

Show:

- active batch
- mode
- new rows exported
- already exported rows skipped
- file name
- Drive URL

Exporting must never:

- send an email
- create a new attempt
- change prepared recipient data
- include another batch

---

# 7. Safe 100-graduate production workflow

The script sends one personalized email per graduate. It does not send one shared email or BCC blast.

Keep:

`MAX_PER_RUN = 25`

Recommended release:

1. Create production event `CONVOCATION-2026`.
2. Import and reconcile final registrations.
3. Generate and verify all ticket PDFs.
4. Create a TEST delivery batch for a small approved sample.
5. Send one internal test.
6. Import and verify the test result.
7. Create a new PRODUCTION batch for all eligible graduates.
8. Production pilot: send 5 selected real deliveries.
9. Export and import those 5 results.
10. Confirm Production sent = 5 and Test sent is unchanged.
11. Send remaining deliveries with Send Next 25:
    - 25
    - 25
    - 25
    - remaining 20
12. After every run, review:
    - sent
    - failed
    - remaining
    - email quota
    - Apps Script execution result
13. Export New Results for Active Batch.
14. Import results into the application.
15. Reconcile:
    - production sent
    - failed
    - bounced
    - resend required
    - remaining prepared

Never run two send commands at the same time.

---

# 8. Permissions

## Administrator

Can:

- prepare test and production distribution
- load queues
- send
- import results
- inspect audit details
- cancel, suppress and prepare resends
- manage events and staff

## Supervisor

No distribution send access.

Supervisor operational access will be completed in a later ticket:

- QR scan
- manual check-in
- registration lookup
- attendance summary
- approved corrections

Keep existing scanner role backward-compatible until the later authorization migration.

---

# 9. Required tests

1. Test and production counts are independent.
2. Test sent displays separately.
3. Batch list clearly labels TEST and PRODUCTION.
4. Batch details show intended and actual recipients.
5. Attempt history is complete and newest first.
6. Import history shows every disposition.
7. Active queue rejects mixed batch codes.
8. Active queue rejects mixed event codes.
9. Active queue rejects mixed modes.
10. Loading another batch requires explicit archive/replace.
11. Send commands process only ACTIVE_BATCH_CODE.
12. Export includes only ACTIVE_BATCH_CODE.
13. Export excludes the previous batch attempt.
14. Default export excludes already exported rows.
15. Re-export all remains active-batch scoped.
16. Zero-new export creates no file.
17. Export sends no email.
18. Export creates no attempt.
19. Script lock prevents overlapping send runs.
20. Already sent rows are skipped.
21. Failed rows are eligible only through the approved retry action.
22. Administrator can use distribution controls.
23. Supervisor cannot send or import distribution results.
24. Existing recipient, signature and checksum validations remain unchanged.
25. Existing scanner and attendance tests remain green.

---

# 10. Acceptance criteria

The ticket is complete only when:

- the unrelated older batch row cannot appear in a normal active-batch export
- the dashboard shows Test sent separately from Production sent
- every batch has View details
- every attempt is visible
- every import is visible
- active batch and mode are obvious in Google Sheets
- test batches cannot be reused as production batches
- 100 deliveries can be sent safely in controlled sequential runs
- concurrent runs are blocked
- no production email is sent during testing
- all quality gates pass

---

# 11. Claude prompt

```text
You are implementing CHECKIN-09C in:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-09c-distribution-control-centre

FIRST RUN

git branch --show-current
git status --short
git log -5 --oneline

Stop if the branch is different.

Read:

tickets/CHECKIN-09C-distribution-control-centre.md

Do not reset, stash, clean, commit, push, deploy migrations, send email, access _reference, or use real personal data in tests.

CRITICAL CONFIRMED BUG

A result file named for DLV-2026-BDH4YG included:

- DR-GHVDLHZG from delivery_batch_id 5353dc92-43ff-447c-a65c-f0e640ca6b49
- DR-DAEJ9XQY from delivery_batch_id b4c215cf-2b80-4596-b7fb-03c39bd4a5fb

These are different batches.

The importer securely accepted the matching row and rejected the unrelated row. Do not weaken the importer. Fix the Google Apps Script export and operator workflow so the normal export is strictly active-batch scoped.

IMPLEMENT THE FULL TICKET

Main requirements:

1. Build Distribution Control Centre summary cards and tabs.
2. Add batch details route.
3. Show delivery attempts and result-import history.
4. Separate test and production counts, labels and recipient display.
5. Add protected active-batch metadata to the Google Sheet.
6. Reject mixed queues.
7. Require archive/replace before loading another batch.
8. Use LockService for send operations.
9. Scope every send and export to ACTIVE_BATCH_CODE and ACTIVE_BATCH_MODE.
10. Default export only new unexported results for active batch.
11. Add explicit re-export-all for active batch.
12. Never create an empty export.
13. Never send email or create attempts during export.
14. Keep distribution write actions administrator-only.
15. Preserve all existing security validation.

Use header-based column maps, not fragile numeric indexes.

Add a new additive migration only if required. Never edit a deployed migration and never run supabase db push.

Use synthetic tests only.

Run:

npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

FINAL REPORT

Report:

- exact export root cause
- files changed
- routes added
- count definitions
- batch-isolation behavior
- LockService behavior
- export tracking behavior
- Apps Script files to recopy online
- whether a migration was added
- test count
- lint, typecheck, build and diff results
- confirmation no email sent
- confirmation no migration deployed
- confirmation nothing committed or pushed
```
