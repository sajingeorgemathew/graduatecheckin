# CHECKIN-09B — Google Apps Script ticket distribution

Toronto Academy Graduation Check-In. This ticket adds the delivery pipeline
that emails the branded PDF admission tickets produced by CHECKIN-09A, using a
Google Apps Script sender bound to a Google Sheet. **The application never
sends email and never connects to Gmail.** It prepares signed delivery rows,
records the results Apps Script sends back, and keeps a permanent, append-only
delivery history.

This ticket does **not** import the final real registration report and does
**not** activate production check-in. Those belong to CHECKIN-10.

---

## Architecture

```
CHECKIN-09A ZIP (PDFs + manifest)                 Google Drive folder
        │                                          (PDFs, office account)
        ▼                                                  │
  App: prepare delivery batch  ──►  send-queue.csv  ──►  Google Sheet
   (signs each row with                (signed)          (Apps Script)
    TICKET_DISTRIBUTION_SECRET)                            │  MailApp
        ▲                                                  ▼  send (one/graduate)
        │                                          apps-script-results.csv
  App: import results  ◄───────────────────────────────────┘
   (re-verify signatures,
    append attempts, update status)
```

Two independent trust boundaries:

1. **The app → Sheet boundary** is protected by a per-row HMAC
   (`row_signature`). The Sheet may reorder or annotate rows but cannot alter a
   recipient, PDF checksum or mode without invalidating the signature, which is
   re-verified on import.
2. **The Sheet → app boundary** is protected by unique `delivery_reference`
   and `attempt_reference` values, so a replayed or forged results row is
   rejected or treated as an idempotent duplicate.

---

## Production-event separation (Part A)

The active development event `GRAD-2026-DEV` is a **test event** with mock
data. It is never converted, renamed or reused. CHECKIN-09B creates a distinct
production event:

| Field | Value |
| --- | --- |
| Code | `CONVOCATION-2026` |
| Title | Convocation Ceremony 2026 |
| Mode | production (`is_test = false`) |
| Status | draft (activation is CHECKIN-10) |
| Date | Sunday, July 26, 2026 |
| Time | 12:00 PM – 4:00 PM, America/Toronto |
| Venue | Mississauga Grand Banquet & Event Centre |
| Address | 35 Brunel Road, Mississauga, ON L4Z 3E8 |

Scripts (idempotent, dry-run-safe, no secrets printed):

```
npm run events:create-production -- --dry-run   # report only, no writes
npm run events:create-production                # create or converge
npm run events:verify-production                # read-only verification
```

The create script only ever inserts the event when it does not exist, converges
display facts otherwise, and never touches the event mode, status,
`ACTIVE_GRADUATION_EVENT_CODE`, or the `GRAD-2026-DEV` event. It copies **no**
registrations, guests, tickets, PDFs, check-ins, attendance, imports or
delivery records — only the approved event display and PDF ticket settings.

The verify script confirms the event exists, has the correct code, is
non-test, remains draft, matches the approved ceremony details, and starts
with zero registrations, tickets, PDF documents, check-ins, attendance and
delivery records.

---

## Database additions (Part B)

One additive, timestamped migration:
`supabase/migrations/20260721120000_create_ticket_distribution_delivery.sql`.

Four tables:

- `graduation_ticket_delivery_batches` — delivery batch headers (mode,
  purpose, status, counts, source document batch, manifest checksum).
- `graduation_ticket_deliveries` — per-registration delivery snapshots with
  `row_signature`. Frozen so a later registration edit never rewrites a
  delivery.
- `graduation_ticket_delivery_attempts` — **append-only** send-attempt log; a
  guard trigger blocks any UPDATE or DELETE.
- `graduation_ticket_delivery_result_imports` — one row per uploaded results
  file, keyed by file checksum for idempotent re-import.

Two hardened security-definer functions (`search_path = ''`, active-admin
check, execution revoked from public/anon/authenticated):

- `record_ticket_delivery_attempt(...)` — idempotent append of one attempt
  under a row lock, advancing the delivery status the caller specifies.
- `cancel_ticket_delivery_batch(...)` — cancels an unsent (draft/prepared)
  batch and its prepared deliveries.

Every table has RLS enabled with **no policy**, and privileges revoked from
`anon, authenticated` (which includes scanner and supervisor staff). All
access is service-role only, through administrator server routes.

No raw QR token, token hash or ticket-signing secret is ever stored. There is
deliberately **no `delivered` status**: an Apps Script send success means the
provider accepted the message, not that it reached an inbox.

### Delivery states

Batch: `draft → prepared → sending → partial → completed` (or `failed`,
`cancelled`).

Delivery: `prepared`, `sent`, `failed`, `bounce_detected`, `resend_required`,
`resent`, `cancelled`, `suppressed`.

Attempt outcome (append-only): `sent`, `failed`, `bounce_detected`, `skipped`,
`cancelled`.

Imported result outcome: `sent`, `failed`, `bounce_detected`, `skipped`,
`cancelled`, `test_sent`. A `test_sent` is recorded as a **test attempt only**
and never advances a production delivery to `sent`.

---

## Row signing (security)

`TICKET_DISTRIBUTION_SECRET` is a **server-only** secret, minimum 32 random
bytes, separate from `TICKET_TOKEN_SECRET`. Signatures are HMAC-SHA256 (key
derived via HKDF) over the immutable delivery fields: delivery reference, batch
code, event code, mode, purpose, intended recipient, ticket code, document
version, PDF file name, PDF checksum and total party count. The signature is
**not secret** and is safe to place in the CSV; it only proves the row was
prepared by the app and not altered before import.

---

## Send queue export (Part D)

`send-queue.csv` columns: `delivery_batch_code, delivery_reference,
row_signature, event_code, event_title, delivery_mode, delivery_purpose,
graduate_name, intended_recipient_email, ticket_code, document_version,
pdf_file_name, pdf_sha256, graduate_count, adult_guest_count,
adult_guest_names, child_0_4_count, child_5_10_count, total_party_count,
document_generated_at, delivery_prepared_at, status, attempt_count`.

It excludes the raw QR token, token hash, ticket-signing secret,
distribution-signing secret, Supabase keys, storage URLs and internal staff
user IDs. Every cell is RFC-4180 quoted, and values beginning with `= + - @`
are neutralized against spreadsheet formula injection. Adult guest names are
**never truncated**.

---

## Google Sheet (Part F)

Tabs created by `setupWorkbook()`: **Configuration**, **Batch Summary**,
**Send Queue**, **Send Log**, **Bounce Review**.

Configuration keys: `TEST_MODE`, `AUTHORIZED_SENDER_EMAIL`,
`TEST_RECIPIENT_EMAIL`, `DRIVE_BATCH_FOLDER_ID`, `MAX_PER_RUN`,
`REPLY_TO_EMAIL`, `SENDER_DISPLAY_NAME`, `EMAIL_SUBJECT_INITIAL`,
`EMAIL_SUBJECT_UPDATED`, `EMAIL_SUBJECT_REPLACEMENT`, `PRODUCTION_CONFIRMATION`,
`LAST_VALIDATED_AT`. Defaults: sender/reply-to `office@torontoacademy.ca`,
display name `Toronto Academy of Education`, `MAX_PER_RUN=25`, `TEST_MODE=TRUE`.
The script **fails closed** when required configuration is missing.

Custom menu **Graduation Tickets**: Setup Workbook, Load Send Queue CSV,
Validate Batch, Send Test for Selected Row, Send Selected, Send Next 25,
Resume Failed, Scan Bounce Messages, Export Results CSV, Show Remaining Email
Quota. **No automatic sending trigger exists**; nothing sends on open or edit.

### Apps Script setup

1. Create a Google Sheet owned by `office@torontoacademy.ca`.
2. Extensions → Apps Script; create the `.gs` files and `appsscript.json` from
   `google-apps-script/graduation-ticket-sender/`.
3. Reload the Sheet, run **Setup Workbook**, fill **Configuration**.
4. Put the batch PDFs (from the CHECKIN-09A ZIP) in a Drive folder and set
   `DRIVE_BATCH_FOLDER_ID`.

### Sender identity

Before every run the script reads the effective Workspace account. Production
sending requires `office@torontoacademy.ca`; internal test execution is allowed
only when `TEST_MODE` is on. If the authorized address is a send-as alias, it
must be configured in Gmail — the script never pretends to be an address
Google does not authorize.

### Sending safeguards

`LockService` serializes runs. Each row is validated (signature present,
recipient, PDF present in Drive with `application/pdf` MIME and matching
SHA-256), marked `SENDING` and flushed, sent as **one individual email**
(never CC/BCC), logged immediately, then set `SENT`/`FAILED`. A failure never
stops already-recorded rows. If execution time runs low the run stops cleanly,
leaving remaining rows `READY`.

---

## Test mode

Test mode never emails a graduate. Mail goes only to
`TEST_RECIPIENT_EMAIL`; the subject is prefixed `[TEST]`; the body is clearly
marked a test and shows the intended graduate and intended recipient in a
diagnostic block. Results record both the intended and actual recipient, and
the outcome is `test_sent`, so the production delivery is never marked `sent`.

Production sending requires `TEST_MODE=FALSE`, the approved sender, and
`PRODUCTION_CONFIRMATION` set to exactly `SEND CONVOCATION 2026 TICKETS`. The
confirmation is cleared after each run.

---

## Results import (Part F)

Route: `/admin/tickets/distribution/import-results`. Upload → SHA-256 →
duplicate-file detection → safe parse → preview (accepted / duplicate /
warning / rejected) → explicit apply → append attempts → update delivery
status. A second import of the same file is idempotent; a repeated
`attempt_reference` is a duplicate, not a new attempt. Earlier attempts are
never overwritten.

The app rejects rows with: an unknown delivery reference, an invalid row
signature, a mismatched PDF checksum, a mismatched intended recipient, a
duplicate attempt reference, a mismatched batch, a malformed timestamp, an
unsupported outcome, formula-injection content, or a foreign event.

---

## Bounce review

`Scan Bounce Messages` is optional, manual, and the only function that uses
`GmailApp` (from the authorized office account). It classifies a bounce
automatically only when unambiguous — recipient extracted confidently, message
newer than the send, recipient matches a known sent row. Everything else goes
to **Bounce Review** as `NEEDS_REVIEW`. A message is never marked delivered,
and the absence of a bounce is never treated as inbox delivery.

---

## Resend and updated-registration rules

- **Email changed before sending** — cancel the prepared delivery, update the
  registration in the app, prepare a new delivery.
- **Email changed after sending** — keep the prior attempt, update the
  registration, prepare a new `resend` delivery. Never edit the intended email
  in the Sheet: the app would reject the altered row on import.
- **Guest count changed after PDF prepared** — the PDF is outdated; regenerate
  it (CHECKIN-09A) and prepare a new `updated` delivery; keep earlier history.
- **Ticket replaced** — old PDF and delivery are invalidated; a new ticket and
  PDF are required; prepare a `replacement` delivery.
- **Ticket revoked** — prepared unsent deliveries are cancelled; no future send.

Corrected emails always flow through the app so a fresh signed queue row is
minted; the Sheet is never hand-edited.

---

## Guest flexibility (Part E)

The distribution workflow imposes **no** adult-guest cap of its own: party
building reuses the shared, cap-free builder, and every consumer (PDF,
manifest, send queue, email) renders all guests without truncation. Tests
cover graduate-only, 1–4 adult guests, children-only, mixed parties and long
names.

**Production blocker (reported, not silently changed):** an approved upstream
business rule in the CHECKIN-02 schema still caps counts at 2:

| Constraint (in `20260717015847_create_graduation_checkin_schema.sql`) | Limit |
| --- | --- |
| `graduation_registrations_adults_range` | adult guests 0–2 |
| `graduation_registrations_children_0_4_range` | 0–2 |
| `graduation_registrations_children_5_10_range` | 0–2 |
| `graduation_registrations_children_combined` | children total ≤ 2 |
| `graduation_checkins_adult_delta_range` | attendance adult delta ±2 |

Relaxing these is a decision for the ceremony owners; CHECKIN-09B does not
change them. If more than two adult guests must be supported, raise the limit
as an explicit, approved change in CHECKIN-10.

---

## Security summary

Administrator only; server-only signing; `TICKET_DISTRIBUTION_SECRET` never
sent to the browser; row signatures generated server-side; no raw QR token in
any delivery table; recipient emails masked in list views and shown in full
only in administrator detail/exports; imports size-limited and CSV-hardened;
preparation and result-import routes rate-limited; all preparation and imports
auditable; no real student data in tests.

---

## Testing

`src/tests/distribution/` covers signing (including tamper detection), send-queue
escaping and formula-injection, preparation rules, guest flexibility, outcome
mapping (test never marks production sent), results parsing/validation,
summaries, migration safety, route authorization (scanner/supervisor denied,
administrator allowed), Apps Script safeguards (LockService, per-run cap,
production confirmation, sender enforcement, MailApp-only), and the production
event scripts. Existing PDF, scanner and attendance suites remain green.

---

## Production runbook

1. `npm run events:create-production -- --dry-run`, review, then
   `npm run events:create-production`; confirm with `events:verify-production`.
2. Apply the migration to the linked project (deferred; **not** run here).
3. Set `TICKET_DISTRIBUTION_SECRET` locally and in Vercel server env.
4. Generate/verify PDFs (CHECKIN-09A) and build a completed document batch.
5. In the app, prepare a **test** delivery batch; download `send-queue.csv`.
6. In the Sheet: Setup Workbook, load the CSV, place PDFs in Drive, validate,
   Send Test for a row, Export Results, import them, confirm the round trip.
7. Switch to a production batch, set the sender and confirmation phrase, send
   in capped runs, export results, import, review bounces, resend as needed.

---

## CHECKIN-10 handoff

Remaining for CHECKIN-10: import the final real registration report into
`CONVOCATION-2026`, generate its real PDFs, run the real distribution, decide
whether the two-guest limit must be raised, activate the event (draft →
active) and switch `ACTIVE_GRADUATION_EVENT_CODE` / Vercel env to the
production event for live check-in.
