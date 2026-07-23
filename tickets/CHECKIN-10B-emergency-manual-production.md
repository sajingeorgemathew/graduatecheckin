# CHECKIN-10B v2 — Emergency Manual Production Release

## Project

**Repository:** `C:\Users\USER\Desktop\Graduationcheckin`  
**Branch:** `feat/checkin-10b-emergency-manual-production`  
**Base:** stable `main` containing CHECKIN-09C  
**Do not merge:** `feat/checkin-10a-production-cutover-controls`

## Production decision

The Google Apps Script workflow is not required for the immediate release.

The required workflow is:

`RSVP Excel → reconcile graduate and guest orders → production registration → ticket/PDF → personalized branded email preview → administrator sends manually through Gmail → administrator clicks Mark sent`

Keep all stable ticket, scanner, manual check-in, attendance and audit functionality.

Do not delete Apps Script code or historical records. Hide it from the primary workflow.

---

# 1. Critical duplicate and guest-order rule

A repeated row is **not automatically a duplicate** merely because the graduate name or email is repeated.

The system must distinguish between:

1. duplicate graduate submissions
2. supplemental guest-payment or guest-update orders
3. genuinely different people using the same email

## 1.1 Duplicate graduate submission

Treat rows as a likely duplicate submission only when all of the following are true:

- same normalized graduate email
- same or equivalent normalized graduate name
- no adult guest information
- no child information
- no guest-payment amount
- no guest-update note
- the meaningful registration fields are otherwise identical or equivalent

Examples include the same graduate submitting multiple zero-dollar RSVP rows with no guest changes.

The application must:

- suggest consolidating these rows
- retain every source order ID for audit
- create only one production registration
- create only one active ticket

## 1.2 Supplemental guest order

A repeated row for the same graduate is **not a duplicate source transaction** when any of these differ or are present:

- Guest 1
- Guest 2
- child selection or child count
- fee total
- tax
- order total
- note indicating another guest or child
- later guest-payment transaction

The supplemental order must be preserved as a separate source order and merged into the graduate’s final approved party record.

It must not create a second graduate registration or second initial ticket.

## 1.3 Payment-backed guest entitlement

Adult guests and paid children may be added only when payment or an administrator-approved exception supports them.

Rules:

- adult guests require the corresponding paid guest transaction or explicit administrator approval
- children aged 5–10 require the corresponding paid child transaction or explicit administrator approval
- children aged 0–4 may be free, but must be explicitly selected or confirmed
- identical guest names repeated across source orders must not be counted twice
- do not blindly add together repeated child counts
- do not blindly parse multiple people placed in one guest-name field
- ambiguous names, counts or payment combinations require administrator review
- preserve fee, tax, total and source order IDs for every guest transaction

## 1.4 Same email, different person

When the same email appears with materially different graduate names, the preview must not silently merge them.

Require an administrator decision:

- same graduate with name-order variation
- separate graduates sharing an email
- exclude incorrect row

## 1.5 Final ticket rule

After reconciliation:

- one production registration per graduate
- one active ticket per graduate
- one ticket covers the graduate and the final approved registered party
- all related RSVP and supplemental guest order IDs remain linked to that registration

---

# 2. Current workbook contract

Support the exact uploaded RSVP headers:

- order_id
- order_date
- Status
- Full Name
- Email
- Phone Number
- Graduation Gown Size
- Name Pronunciation
- Guest 1 - Full Name
- Guest 2 - Full Name
- Kids (0 to 4)
- Kids
- fee_total
- fee_tax_total
- order_total
- Note

Do not require the administrator to modify the workbook before upload.

The import preview must show:

- source rows
- proposed graduate registrations
- likely duplicate zero-guest submissions
- supplemental guest orders
- same-email name conflicts
- guest/payment ambiguities
- approved party totals
- rows requiring administrator review
- expected ticket count

---

# 3. Direct production import

Add:

`/admin/production-import`

The administrator uploads the current RSVP workbook.

The import is previewed before applying.

The administrator can:

- merge duplicate graduate submissions
- attach supplemental guest orders to the same graduate
- correct canonical graduate name
- correct email or phone
- approve paid adult guest count
- approve children 0–4
- approve paid children 5–10
- remove duplicated guest names
- keep separate people using one email
- exclude a row
- add a reconciliation note

Applying the import must be idempotent.

Re-importing the same order IDs must not create duplicate registrations, guests, tickets or payments.

---

# 4. Ticket and PDF generation

Add:

`Generate missing tickets`

Rules:

- one ticket per accepted production registration
- one PDF per active ticket
- one ticket covers the graduate and approved party
- existing valid tickets survive re-import
- only explicit replacement creates a new ticket version
- bulk generation creates only missing tickets
- provide a downloadable PDF ZIP
- provide a searchable PDF list
- show the exact PDF filename beside each graduate

---

# 5. Manual Delivery Desk

Add:

`/admin/tickets/manual-delivery`

Search by:

- graduate name
- email
- phone
- source order ID
- ticket code

Filters:

- All
- Ready to send
- Ticket missing
- Manually sent
- Resent
- Email missing
- Needs reconciliation
- Checked in
- Not checked in

Each graduate row shows:

- graduate name
- email
- phone
- approved party size
- approved adult guests
- approved child counts
- ticket code
- PDF filename
- delivery status
- last sent time
- check-in status

Each row provides:

- View/edit registration
- Generate ticket
- View PDF
- Download PDF
- Copy recipient email
- Copy subject
- Preview personalized email
- Copy rich formatted email
- Copy plain-text email
- Open Gmail compose
- Mark manually sent
- Mark sent and open next unsent
- Record resend
- Replace ticket

The application never claims an email was sent until the administrator clicks Mark manually sent.

---

# 6. Personalized branded email

Every graduate must receive a custom email generated from their registration and ticket.

## Required personalization

Include:

- graduate name
- ticket code
- approved party size
- event date and time
- venue and address
- arrival/check-in guidance
- exact PDF filename to attach

## Branding

Use the Toronto Academy logo from a public production asset.

Preferred source:

`public/taelogo.png`

The rendered email must use an absolute production URL for the image so Gmail can display it after copy and paste.

Do not use a localhost image URL.

## Operator actions

The Manual Delivery Desk must provide:

- recipient email
- personalized subject
- rendered branded email preview
- Copy rich email
- Copy plain text
- Open Gmail compose
- visible instruction: `Attach this file: <exact PDF filename>`

Copy rich email must copy rendered formatted content, not raw HTML source.

The administrator workflow is:

1. click a graduate
2. copy recipient
3. copy subject
4. copy rich email
5. paste into Gmail
6. attach the displayed PDF
7. send
8. return to the app
9. click Mark manually sent
10. advance to next unsent

---

# 7. Manual delivery audit

`Mark manually sent` records an append-only delivery attempt:

- registration
- ticket
- document
- intended recipient
- actual recipient
- production mode
- provider: manual-gmail
- outcome: sent
- timestamp
- administrator
- PDF filename and version
- optional note
- optional Gmail message ID

Prevent accidental double-click duplicates with idempotency or confirmation.

## Resend

- same valid ticket
- required reason
- new append-only attempt
- does not invalidate the ticket

## Replacement

- required reason
- new ticket and PDF version
- previous ticket remains traceable
- previous QR becomes invalid

---

# 8. Manual add graduate

Add:

`/admin/registrations/new`

Support:

- late RSVP
- missing RSVP
- admin-added graduate
- walk-in
- graduate created from future roster search

Fields:

- graduate name
- email
- phone
- student ID, optional
- pronunciation
- gown size
- adult guest names
- children 0–4
- children 5–10
- payment/approval note
- source
- internal note

Warn on likely duplicate email, phone, student ID or similar name.

Administrator may override with a required reason.

After save:

- generate ticket
- open Manual Delivery Desk
- copy email
- mark manually sent
- check in manually

A walk-in may be registered and checked in even when no email or PDF is sent.

---

# 9. Future full graduate roster

Support a later roster import for all 180–190 graduates.

Keep roster candidates separate from event registrations.

Search by:

- student ID
- name
- email
- phone
- program
- batch

Action:

`Create production registration`

The full roster is not required to send tickets to the current RSVP graduates today.

---

# 10. Existing check-in workflow

Preserve:

- secure QR scan
- manual ticket-code validation
- registration search
- manual check-in
- attendance dashboard
- append-only check-in history

Supervisor can scan and manually check in.

Administrator can additionally add a missing graduate, generate a ticket and register a walk-in.

---

# 11. Google Apps Script status

Do not delete Apps Script code, migrations or historical records.

For the active production release:

- hide Google Apps Script from the main administrator workflow
- label it Archived automation or place it behind a disabled feature flag
- do not require Google Sheets
- do not require result CSV import for manual sends

---

# 12. Authorization

## Administrator

Can:

- import RSVP Excel
- reconcile duplicate and guest orders
- apply production import
- generate tickets
- use Manual Delivery Desk
- copy personalized branded emails
- mark manual sends and resends
- replace tickets
- manually add graduates and walk-ins
- view delivery and attendance audit

## Supervisor

Can:

- scan
- enter manual ticket code
- search event registrations
- manually check in
- view attendance summary

Supervisor cannot:

- import Excel
- reconcile guest payments
- generate bulk tickets
- edit registrations
- use email tools
- mark sent
- replace tickets

---

# 13. Required tests

1. Repeated zero-dollar no-guest submissions are suggested as duplicates.
2. A paid guest order for the same graduate is not discarded as a duplicate.
3. Supplemental guest order remains linked by source order ID.
4. Supplemental order does not create a second graduate registration.
5. Supplemental order does not create a second initial ticket.
6. Adult guest requires payment or administrator approval.
7. Child 5–10 requires payment or administrator approval.
8. Child 0–4 may be free but requires explicit selection or approval.
9. Repeated identical guest name is not counted twice.
10. Ambiguous multi-name guest cell is flagged.
11. Repeated child counts are not blindly summed.
12. Same email with materially different names requires review.
13. Re-importing the same order IDs is idempotent.
14. One reconciled graduate produces one ticket and PDF.
15. Existing valid ticket survives re-import.
16. Manual email preview is personalized.
17. Email preview contains the production logo URL.
18. Rich copy contains formatted content, not raw HTML.
19. Exact PDF filename is shown.
20. Manual send remains unsent until confirmation.
21. Mark sent creates one append-only attempt.
22. Resend preserves ticket and requires a reason.
23. Replacement creates a new ticket and invalidates the previous one.
24. Manual add warns about likely duplicates.
25. Administrator can override with a reason.
26. Supervisor cannot access import or email tools.
27. Supervisor can scan and manually check in.
28. Walk-in can be added and checked in without email.
29. Apps Script is not required.
30. Existing scanner and attendance tests remain green.
31. No real personal data appears in automated tests.

---

# 14. Acceptance criteria

Complete when:

- guest-payment orders are preserved and correctly consolidated
- duplicate no-guest submissions do not create extra graduates
- one ticket exists per reconciled graduate
- every graduate has a personalized branded email preview
- administrator can copy/paste the email into Gmail
- exact PDF attachment is obvious
- administrator can mark each send and move to the next unsent
- resends and replacements are separate
- late RSVP and walk-in handling works
- future roster import remains possible
- Google Apps Script is not required
- scanner and manual check-in continue working
- all quality gates pass

---

# 15. Claude implementation prompt

```text
You are implementing CHECKIN-10B v2 Emergency Manual Production Release in:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-10b-emergency-manual-production

Read:

tickets/CHECKIN-10B-emergency-manual-production.md

Do not reset, stash, clean, commit, push, deploy migrations, send email, access _reference, or commit any uploaded workbook.

CRITICAL BUSINESS RULE

Repeated graduate rows are not automatically duplicates.

A same-graduate row containing guest names, child selections, payment amounts, totals or a guest-update note is a supplemental guest transaction. Preserve its source order ID and reconcile it into the same graduate’s approved party record.

Only repeated same-graduate submissions with no guest, no child and no guest-payment difference are likely duplicate submissions.

Paid guests must not be discarded. They also must not create a second graduate registration or second initial ticket.

ACTIVE WORKFLOW

RSVP Excel
→ duplicate and guest-order reconciliation
→ one production registration per graduate
→ one active ticket/PDF per graduate
→ personalized branded email preview
→ administrator manually sends through Gmail
→ administrator clicks Mark manually sent

IMPLEMENT THE FULL TICKET

The personalized email must:

- use the Toronto Academy production logo from a public asset
- be generated separately for each graduate
- include graduate and ticket details
- provide rich rendered copy, not raw HTML
- show the exact PDF filename to attach
- support Mark sent and open next unsent

Keep Google Apps Script dormant and out of the required production workflow.

Use additive migrations only.
Never edit deployed migrations.
Do not run supabase db push.
Use synthetic fixtures matching the real workbook headers.

Run:

npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

Report all files, routes, migration, reconciliation rules, email workflow, manual send audit, manual add, roster support, authorization, tests and remaining manual steps.

Confirm no email was sent, no migration was deployed, and nothing was committed or pushed.
```
