# Graduation Check-In Database Schema

This document explains the initial schema created by the
`create_graduation_checkin_schema` migration. It contains no real student
information.

## Tables

### `graduation_events`

One row per graduation ceremony. Holds the event code, name, schedule,
timezone, venue and status (`draft`, `active`, `closed`, `archived`).
`is_test` separates development data from production data. The fictional
development event uses the code `GRAD-2026-DEV` and is always `is_test = true`.

### `graduation_registrations`

One row per graduate registration within an event. Stores the graduate's
details, the registered guest counts, registration status, payment status
and money totals from the source system.

The registration row stores the expected party counts
(`registered_adult_guests`, `registered_children_0_4`,
`registered_children_5_10`) as the source of truth because the registration
export provides counts, capacity planning needs reliable numbers, and guest
names are optional. `expected_party_size` is a generated column
(1 graduate + adults + children) so it can never drift from the counts.

Constraints enforce at most 2 adult guests, at most 2 combined children and
non-negative money values. A partial unique index on
`(event_id, source_system, source_registration_id)` prevents duplicate
imports while still allowing manual registrations without a source ID.

### `registration_guests`

Optional named guest rows for a registration. Guest names are stored
separately because children may be registered without names and because the
counts on the registration remain authoritative. Each row has a category
(`adult`, `child_0_4`, `child_5_10`) and a per-category sort order.

### `graduation_tickets`

QR admission tickets for a registration. The table stores `token_hash` only:
a secure hash of the QR token. The raw token is never stored, so a database
leak cannot be replayed as valid tickets. A partial unique index allows only
one `active` ticket per registration. Ticket generation happens in a later
ticket; CHECKIN-02 creates no ticket rows.

### `staff_profiles`

One profile per Supabase Auth user with a display name, role (`scanner`,
`supervisor`, `administrator`) and active flag. No Auth users or profiles
are created in CHECKIN-02; staff authentication arrives in CHECKIN-04.

### `graduation_checkins`

An append-oriented audit log of admissions. Each row records who was
admitted (as deltas for graduate, adults and both child groups), how
(`qr_scan`, `manual_search`, `supervisor_adjustment`, `system`) and what kind
of action it was (`admission`, `correction`, `reversal`). Rows are not
updated after creation; mistakes are corrected by appending a reversal row
that references the original via `reverses_checkin_id`. This preserves a
complete, auditable history of the event. A unique `idempotency_key`
prevents double-submits from creating duplicate admissions.

## Relationships

```text
graduation_events 1 --- n graduation_registrations
graduation_registrations 1 --- n registration_guests
graduation_registrations 1 --- n graduation_tickets
graduation_registrations 1 --- n graduation_checkins
graduation_tickets 1 --- n graduation_checkins (optional)
auth.users 1 --- 1 staff_profiles
auth.users 1 --- n graduation_checkins (optional)
```

Deleting an event cascades to its registrations, and deleting a registration
cascades to its guests, tickets and check-ins. This is what allows the
guarded development reset to remove all mock data by deleting the single
verified test event.

## Test and Production Separation

Every table carries `is_test`. Mock records are always `is_test = true`.
Destructive development tooling refuses to touch anything else, which keeps
real graduate data safe even if a development database ever contains both.

## Reset Protections

Destructive commands (`db:reset:mock`, `db:reset:mock-checkins`) run only
when all of these hold:

1. `APP_ENV` is exactly `development`.
2. `ALLOW_DESTRUCTIVE_DEV_RESET` is exactly `true`.
3. `DEV_RESET_CONFIRMATION` is exactly `RESET_GRADUATION_CHECKIN_DEV_DATA`.
4. `MOCK_EVENT_CODE` is exactly `GRAD-2026-DEV`.
5. The database event with code `GRAD-2026-DEV` exists and is `is_test = true`.
6. No non-test registration hangs off that event.

The scripts resolve only the fixed `GRAD-2026-DEV` code. There is no
delete-all command, no arbitrary event reset and no production reset.

## Row Level Security

RLS is enabled on all six tables with no policies, and direct table
privileges are revoked from the `anon` and `authenticated` roles. Until
CHECKIN-04 adds staff policies, all database access must go through trusted
server-side code using the service-role client, which bypasses RLS.

## Remaining Work in Later Tickets

- CHECKIN-03: real registration import from the Excel export.
- CHECKIN-04: staff authentication, profiles and RLS policies.
- Later tickets: QR token generation, ticket delivery, scanning, check-in
  UI, dashboards and reporting.
