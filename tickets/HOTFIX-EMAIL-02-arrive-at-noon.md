# HOTFIX-EMAIL-02 - Arrival at 12:00 PM Sharp

## Objective

Remove the instruction asking graduates to arrive 45 minutes before the ceremony.

Replace it with clear guidance asking graduates and registered parties to arrive at 12:00 PM sharp because seating is being arranged based on confirmed registrations.

## Required wording

### Arrival time

Please arrive at 12:00 PM sharp. Seating is being arranged based on confirmed registrations, so graduates and their registered parties are requested to be on time.

Members of your party may still arrive separately. Present the same ticket whenever another registered member of your party arrives.

## Scope

Update only the Manual Delivery Desk email wording and focused tests.

Expected files:

- src/features/manual-delivery/constants.ts
- src/features/manual-delivery/email-template.ts
- src/tests/manual-delivery/email-template.test.ts
- tickets/HOTFIX-EMAIL-02-arrive-at-noon.md

## Requirements

- Remove every statement asking recipients to arrive 45 minutes early.
- Clearly state that arrival time is 12:00 PM sharp.
- Explain that seating is arranged based on confirmed registrations.
- Keep the existing shared-party ticket instructions.
- Keep the existing separate-arrival instructions.
- Keep the existing QR privacy statement.
- Keep the Toronto Academy logo and branding.
- Keep the event table, registered-party summary and attachment instruction.
- Update both HTML and plain-text email versions.

## Safety

Do not modify:

- registrations
- guest or child counts
- tickets
- ticket codes
- QR payloads
- PDFs
- check-in logic
- Supabase migrations
- database records
- environment variables
- manual-send audit records

No ticket or PDF regeneration is required.

## Acceptance criteria

- No wording says to arrive 45 minutes early.
- The email says to arrive at 12:00 PM sharp.
- The email states that seating is arranged based on confirmed registrations.
- The same-ticket and separate-arrival wording remains.
- HTML and plain-text versions contain equivalent guidance.
- All tests, lint, typecheck and build pass.
