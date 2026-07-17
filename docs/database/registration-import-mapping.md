# Registration Import Mapping (Planned)

This document plans how the registration Excel export columns will map into
the database. It was written without opening the real workbook. The actual
workbook will be handled only in CHECKIN-03. No real student, guest, contact
or payment values appear in this document.

## Column Mapping

| Registration export field | Database field |
| --- | --- |
| `order_id` | `source_registration_id` |
| `Full Name` | `graduate_full_name` |
| `Email` | `email` |
| `Phone Number` | `phone` |
| `Graduation Gown Size` | `gown_size` |
| `Name Pronunciation` | `name_pronunciation` |
| `Guest 1` and `Guest 2` | `registration_guests` |
| `Kids (0 to 4)` | `registered_children_0_4` |
| `Kids (4 to 10)` | Normalize to `registered_children_5_10` after administrative confirmation |
| `status` | `registration_status` and payment review |
| `fee_total` | `fee_total` |
| `tax_total` | `tax_total` |
| `order_total` | `order_total` |
| `order_date` | `source_order_date` |

## Import Rules

1. `order_id` will be the external upsert key. Imported rows will be matched
   on `(event_id, source_system, source_registration_id)`.
2. Name and email will not be used as unique identifiers. Different
   graduates can share a family email and names can repeat.
3. Failed orders will be imported with `registration_status = failed` and
   will require review before any ticket is issued.
4. Existing records will be updated rather than duplicated when the same
   `order_id` appears in a later export.
5. Rows that disappear from a later export will be flagged for review
   instead of being automatically deleted.
6. Child age wording requires normalization: the export uses a 4 to 10
   wording, while the approved database category is `child_5_10` (5 to 10).
   The normalization must be confirmed administratively during CHECKIN-03.
   The database never stores a `child_4_10` category.
7. Emails will be normalized to lowercase and phones to digits only before
   storage, matching the conventions already used by the mock fixtures.

## Scope Note

Real Excel parsing, import preview and import approval are out of scope for
CHECKIN-02 and belong to CHECKIN-03. The `_reference` directory that holds
the real workbook is local-only and must never be read by application code
or tooling.
