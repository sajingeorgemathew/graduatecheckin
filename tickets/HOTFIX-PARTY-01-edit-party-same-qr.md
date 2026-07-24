# HOTFIX-PARTY-01 - Edit Party While Preserving Ticket and QR

## Production context

This is a live production system. Registrations, tickets, PDFs and manual delivery records already exist and some tickets have already been emailed.

The implementation must preserve every existing registration, active ticket, QR code, PDF history, delivery record and check-in record unless an administrator explicitly edits one selected registration.

No bulk update or backfill is permitted.

## Objective

Allow an administrator to increase or reduce an existing graduate's registered party after a new RSVP, additional guest payment, correction or cancellation.

The same active ticket and QR must remain valid.

Only the registered party allowance, named adult guest rows, current PDF version and delivery status may change.

## Party fields

The administrator may edit:

- Adult guest count
- Adult guest names
- Children aged 0 to 4
- Children aged 5 to 10
- Required adjustment reason
- Optional payment or approval note

## No business limit

Do not impose a business maximum on:

- Adult guests
- Children aged 0 to 4
- Children aged 5 to 10
- Combined party size

Values must be non-negative whole numbers.

Do not use dropdowns limited to 0, 1 or 2.

Adult guest names remain optional. The number of supplied names cannot exceed the adult guest count.

## Preserve the ticket

A party adjustment must never:

- create a replacement ticket
- revoke the active ticket
- alter the ticket ID
- alter the ticket code
- alter the raw ticket token
- alter the stored token hash
- alter the QR payload
- change the ticket status
- change the active event
- change source order links

The same QR remains valid.

## PDF behavior

When an active ticket exists:

1. Save the party adjustment atomically.
2. Generate a new PDF version for the same ticket.
3. Preserve the previous PDF in document history.
4. Make the new PDF the current version.
5. Keep the same ticket code and QR.
6. Return the new document version to the administrator.

If PDF generation fails:

- the party adjustment remains accurately saved
- the ticket and QR remain valid
- show a clear warning
- mark the existing PDF as outdated in the interface
- block sending or resending the outdated PDF
- provide a safe retry action to generate the updated PDF

Do not silently present an outdated PDF as ready to send.

## Previously sent tickets

When the latest recorded send contains an older party snapshot:

- show `Party updated since last send`
- show `Updated PDF ready - resend recommended` after PDF generation
- preserve all previous send attempts unchanged
- allow Record resend using the same ticket
- require a resend reason
- include the new PDF filename and current party snapshot in the new send record

After the updated resend is recorded, the warning should clear because the latest send snapshot matches the current party.

An old email or PDF already received by a graduate cannot change retroactively. The QR inside it remains valid, but the administrator should resend the newly generated PDF to communicate the revised party details.

## New manually added graduates

Remove the current business limits from the manual-add form and request schema.

Replace the 0, 1 and 2 dropdowns with non-negative whole-number inputs.

Do not change the duplicate-detection process.

Do not change the production Excel import reconciliation rules. Imported graduates who later need additional guests will be updated through this party-adjustment feature.

## Audit requirement

Create an append-only audit table similar to:

public.graduation_party_adjustments

Each adjustment must retain:

- event ID
- registration ID
- active ticket ID when one exists
- before-party snapshot
- after-party snapshot
- required reason
- optional payment or approval note
- administrator user ID
- timestamp
- idempotency key

Updates and deletes to the audit table must be blocked.

A double-click using the same idempotency key must not create a second adjustment.

## Atomic database operation

Create a new additive migration and a security-definer RPC for the adjustment.

The RPC must:

- authorize an active administrator
- lock the selected registration row
- support optimistic concurrency using the registration updated_at value
- verify the registration belongs to an open active event
- validate non-negative whole-number counts
- validate adult guest names
- update only the selected registration
- replace only that registration's adult guest-name rows
- write the append-only audit record
- perform all database changes in one transaction
- return before and after snapshots
- return the unchanged ticket ID and ticket code when present

Do not edit any previously deployed migration.

Enable RLS and revoke direct public, anon and authenticated access.

## Manual Delivery integration

Add an `Edit registered party` control to the administrator's Manual Delivery detail page.

Before saving, show:

- current party
- proposed party
- ticket code
- current PDF version
- whether the ticket has already been sent

Require:

- adjustment reason of at least 5 characters
- explicit confirmation that the same QR will remain valid
- an idempotency key

After saving, refresh:

- party summary
- email preview
- PDF filename and version
- delivery status
- send history
- resend recommendation

## Delivery-state safety

Add explicit states where appropriate:

- PDF outdated
- Party updated since last send
- Updated PDF ready - resend recommended

A stale PDF must not be considered ready to send.

A previous send must remain recorded as a historical fact.

## Scanner and check-in safety

Do not alter:

- QR parsing
- token signing
- token verification
- ticket lookup
- replacement-chain handling
- scanner authorization
- scan-audit recording
- partial-arrival behavior
- check-in confirmation transaction
- previous check-in records

The same ticket must continue resolving to its registration. Scanner views should naturally read the updated live party allowance from that registration.

## Out of scope

Do not implement the unused missing-email send hotfix.

Do not modify:

- registration email addresses
- payment totals or payment status
- imported source-order history
- event details
- staff roles
- environment variables
- email wording
- QR or ticket secrets
- existing delivery records
- existing check-in records

## Acceptance criteria

1. Administrator can edit an existing party.
2. Counts can exceed two.
3. No business maximum is imposed.
4. Negative and fractional counts are rejected.
5. A reason is required.
6. The update is atomic and audited.
7. Only the selected registration changes.
8. Ticket ID remains unchanged.
9. Ticket code remains unchanged.
10. QR token and token hash remain unchanged.
11. Ticket status remains active.
12. A new PDF version is generated for the same ticket.
13. The previous PDF remains in history.
14. The new PDF becomes current.
15. An outdated PDF cannot be sent.
16. Email preview immediately shows the updated party.
17. Previous manual-send records remain unchanged.
18. Previously sent registrations show a resend recommendation.
19. A resend records the updated party and PDF snapshot.
20. Manual add accepts counts greater than two.
21. Production import behavior remains unchanged.
22. Scanner and check-in implementation remains unchanged.
23. All tests, lint, typecheck and build pass.
