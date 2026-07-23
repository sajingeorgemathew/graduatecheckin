# HOTFIX-EMAIL-01 - Party Ticket and Arrival Guidance

## Objective

Update the Manual Delivery Desk email so graduates clearly understand:

1. One ticket covers the graduate and their entire approved registered party.
2. Guests and children do not need separate tickets.
3. Members of the registered party may arrive at different times.
4. The same ticket may be presented again until the complete registered party has checked in.
5. The QR code does not encode personal or payment information.
6. The QR is not a public website link and only works through the Toronto Academy check-in system for this event.

## Scope

Update only the Manual Delivery Desk email template, constants and focused tests.

Expected files:

- src/features/manual-delivery/constants.ts
- src/features/manual-delivery/email-template.ts
- src/tests/manual-delivery/email-template.test.ts
- tickets/HOTFIX-EMAIL-01-party-arrival-guidance.md

Additional focused test files may be changed only when necessary.

## Required email wording

### One ticket for your registered party

This single ticket covers you and everyone included in your confirmed registration. Separate tickets are not required for your guests or children.

### Arriving at different times

Members of your registered party may arrive at different times. Present the same ticket whenever another registered member of your party arrives. Our check-in team will record only the people arriving at that time, and the ticket will remain usable until your complete registered party has checked in.

### QR code privacy

The QR code does not encode your name, email address, phone number, guest details or payment information. It is not a public website link and can only be validated through the Toronto Academy check-in system for this convocation.

### Arrival reminder

Please arrive at least 45 minutes before the ceremony begins. You may present the attached ticket on your phone or bring a printed copy.

## Design requirements

- Keep the existing Toronto Academy logo.
- Keep the existing navy, gold, cream and white design.
- Keep the event information table.
- Keep the registered-party summary.
- Keep the ticket code and PDF attachment instruction.
- Present the new guidance in a compact, readable information box.
- Use inline email-safe styling.
- Keep the email concise.
- Include equivalent wording in the plain-text version.

## Safety requirements

Do not modify:

- registrations
- guest or child counts
- ticket codes
- ticket tokens
- QR generation
- PDFs
- Supabase tables
- migrations
- authentication
- scanner behavior
- check-in behavior
- manual-send audit records
- environment variables
- logo resolution

Do not regenerate or replace existing tickets.

Do not change TICKET_TOKEN_SECRET or ACTIVE_GRADUATION_EVENT_CODE.

## Acceptance criteria

- The old statement saying the QR is scanned once and the entire party enters together is removed.
- The email clearly states that one ticket covers the complete approved party.
- The email clearly states that guests do not require separate tickets.
- The email clearly supports arrivals at different times.
- The email clearly says to present the same ticket for later arrivals.
- The email explains QR privacy accurately.
- The email does not claim that the visible PDF contains no personal information.
- HTML and plain-text versions contain equivalent instructions.
- Existing subject, event details, party details, logo and attachment behavior remain intact.
- All tests, lint, typecheck and build pass.
