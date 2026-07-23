# Graduation Ticket Sender (Google Apps Script)

Bound Apps Script that sends Toronto Academy Convocation Ceremony 2026
admission-ticket emails from a Google Sheet, using a **signed Send Queue**
exported by the check-in application (CHECKIN-09B). This project sends email;
the application never does. All sample data here is synthetic — no real
graduate information is committed.

## What it does

1. An administrator prepares a delivery batch in the app and downloads the
   signed **send-queue CSV**.
2. The batch's PDFs (from the CHECKIN-09A document export ZIP) are placed in a
   Google Drive folder owned by `office@torontoacademy.ca`.
3. This script loads the CSV, validates it, and sends **one individual email
   per graduate** with the correct PDF attached — never CC/BCC.
4. It records every attempt in the **Send Log** and exports an
   `apps-script-results-<batch>.csv`.
5. The administrator imports that results file back into the app, which
   appends immutable attempt history and updates delivery status.

## CHECKIN-10A update — recopy required

CHECKIN-10A separates the **test workbook** from the **production workbook** and
replaces the fixed production phrase with the **exact active batch code**. Recopy
**all** `.gs` files online (Extensions → Apps Script), then run **Setup Workbook**
once so `WORKBOOK_MODE` and the banner are added:

- `Code.gs`, `Config.gs`, `Validation.gs`, `Sending.gs`, `Results.gs`

There are now **two separate Google Sheets**:

| | Test workbook | Production workbook |
| --- | --- | --- |
| Suggested name | `Toronto Academy Graduation Tickets - TEST` | `Toronto Academy Convocation 2026 - PRODUCTION DISTRIBUTION` |
| `WORKBOOK_MODE` | `TEST` | `PRODUCTION` |
| `TEST_MODE` | `TRUE` | `FALSE` |
| `TEST_RECIPIENT_EMAIL` | internal administrator inbox | *(blank)* |
| `MAX_PER_RUN` | `1` | `25` |
| `PRODUCTION_CONFIRMATION` | *(blank)* | the active batch code, per run |
| Banner | `TEST WORKBOOK — all messages are redirected to the internal test recipient.` | `PRODUCTION WORKBOOK — messages are delivered to graduate email addresses.` |

What changed:

- `WORKBOOK_MODE` is the identity of the whole spreadsheet. It defaults to
  `TEST`, and any unrecognised value is treated as `TEST` — a typo can only make
  the workbook safer.
- `WORKBOOK_MODE` and `TEST_MODE` must agree. A production workbook left in test
  mode, or a test workbook with test mode off, is refused before anything runs.
- **The test workbook rejects a production queue and the production workbook
  rejects a test queue**, both when the queue is loaded and again at send time.
- A production workbook only sends for `CONVOCATION-2026`.
- `PRODUCTION_CONFIRMATION` must equal **the exact active batch code** (read it
  off the Batch Summary tab). It is cleared after every run.
- New **Send 5-Recipient Production Pilot** action: at most five rows, then it
  stops. There is no automatic continuation.
- The per-run cap is hard-limited to 25 in code. Raising `MAX_PER_RUN` in the
  sheet can lower the ceiling but never raise it.
- Before a run, the script counts attempts for the active batch that have never
  been exported and warns that the application has not seen them yet.
- New **Show Workbook Mode** action states plainly which workbook you are in.

## CHECKIN-09C update — recopy required

CHECKIN-09C makes every send and every export strictly **active-batch scoped**,
fixing a mixed-batch export. When upgrading an existing sheet you must recopy
**all** `.gs` files online (Extensions → Apps Script), then run **Setup
Workbook** once so the new tabs/columns are added:

- `Code.gs`, `Config.gs`, `Validation.gs`, `Sending.gs`, `Results.gs`

What changed:

- The **Batch Summary** tab gains protected identity fields, populated from the
  loaded queue (never typed): `ACTIVE_BATCH_CODE`, `ACTIVE_BATCH_MODE`,
  `ACTIVE_EVENT_CODE`, `ACTIVE_QUEUE_LOADED_AT`.
- The **Send Log** gains `delivery_batch_code` plus `export_status`,
  `exported_at`, `export_file_name`, `export_run_reference`.
- Loading a queue rejects any file that mixes batch codes, event codes or
  modes, and refuses to replace an active queue with unsent rows unless you use
  **Archive and Load New Batch from Drive**.
- The old **Export Results CSV** action is replaced by **Export New Results for
  Active Batch** (only new, unexported, terminal rows for the active batch) and
  **Re-export All Results for Active Batch** (recovery; still active-batch
  scoped). A zero-row export shows a message and writes no file.

## Install

1. Create a Google Sheet owned by `office@torontoacademy.ca`.
2. Extensions → Apps Script. Create files matching each `.gs` here and paste in
   the contents. Set the manifest (`appsscript.json`) to match.
3. Reload the Sheet. A **Graduation Tickets** menu appears.
4. Run **Setup Workbook**. It creates the Configuration, Batch Summary, Send
   Queue, Send Log and Bounce Review tabs.

## Configure

Fill the **Configuration** tab. Required keys:

| Key | Default | Notes |
| --- | --- | --- |
| `WORKBOOK_MODE` | `TEST` | `TEST` or `PRODUCTION`. Identity of the whole workbook. Anything unrecognised means `TEST`. |
| `TEST_MODE` | `TRUE` | While `TRUE`, all mail goes to `TEST_RECIPIENT_EMAIL`. Must agree with `WORKBOOK_MODE`. |
| `AUTHORIZED_SENDER_EMAIL` | `office@torontoacademy.ca` | Must match the executing account for production. |
| `TEST_RECIPIENT_EMAIL` | *(blank)* | Internal allowlist recipient for test mode. |
| `DRIVE_BATCH_FOLDER_ID` | *(blank)* | Folder holding the batch PDFs. |
| `MAX_PER_RUN` | `25` | Per-run cap. Hard-limited to 25 in code; this value may only lower it. |
| `REPLY_TO_EMAIL` | `office@torontoacademy.ca` | |
| `SENDER_DISPLAY_NAME` | `Toronto Academy of Education` | |
| `EMAIL_SUBJECT_INITIAL` / `_UPDATED` / `_REPLACEMENT` | *(preset)* | |
| `PRODUCTION_CONFIRMATION` | *(blank)* | Must equal **the exact active batch code** to send production. Cleared after each run. |
| `LAST_VALIDATED_AT` | *(auto)* | |

The script **fails closed**: a missing required value, a wrong production
confirmation phrase, or the wrong sender account all refuse the send.

## Drive folder

Download the CHECKIN-09A document export ZIP, unzip it, and upload the PDFs
into the Drive folder whose ID is `DRIVE_BATCH_FOLDER_ID`. File names must
match the `pdf_file_name` column in the queue. The script verifies each PDF's
SHA-256 against the queue before sending.

## Test pilot

1. `TEST_MODE = TRUE`, set `TEST_RECIPIENT_EMAIL` to an internal address.
2. **Load Send Queue CSV**, paste the exported CSV.
3. **Validate Batch**.
4. Select a row, **Send Test for Selected Row**. Only the test recipient is
   emailed; the subject is prefixed `[TEST]`; the production delivery is never
   marked sent.
5. **Export Results CSV**, import it in the app to confirm the round trip.

## Production send

1. Confirm the executing account is `office@torontoacademy.ca`. If that
   address is a send-as alias, configure the alias in Gmail — the script never
   pretends to be an address Google does not authorize.
2. Set `TEST_MODE = FALSE`.
3. Set `PRODUCTION_CONFIRMATION` to the exact active batch code from the
   **Batch Summary** tab (`ACTIVE_BATCH_CODE`).
4. **Validate Batch**, then **Send Next 25** repeatedly, or **Send Selected**.
   A `LockService` lock prevents concurrent runs from double-sending. If the
   run nears the execution-time limit it stops cleanly, leaving remaining rows
   `READY`. The confirmation phrase is cleared after each run.

## Results and import

**Export Results CSV** writes `apps-script-results-<batch>.csv` to Drive.
Import it in the app under **Ticket Distribution → Import results**. A repeated
import of the same file is idempotent, and a repeated attempt reference is a
duplicate, not a new attempt.

## Bounce review (optional)

**Scan Bounce Messages** is the only function that reads Gmail. Run it
manually from the office account. It classifies a bounce automatically only
when unambiguous; anything else is added to **Bounce Review** as
`NEEDS_REVIEW`. A send success means the provider accepted the message — never
that it reached an inbox — and no message is ever marked delivered.

## Resend

To resend a corrected registration, update it in the app, prepare a new
`resend` delivery batch (which mints a fresh signed queue row), and run this
script again. Never edit the intended recipient directly in the Sheet: the app
would reject the altered row on import because its signature would not match.
