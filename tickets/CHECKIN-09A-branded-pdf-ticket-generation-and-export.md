# CHECKIN-09A: Branded PDF Ticket Generation and Export

## Purpose

Produce a branded, one-page PDF admission ticket for every registration and
package those PDFs into controlled, auditable export batches.

The PDF is a second *presentation* of the ticket, never a second
*credential*. It embeds the QR built from the existing CHECKIN-05 secure
token for the existing `graduation_tickets` row. No new admission
credential is created, and the scanner protocol, QR payload format,
ticket-token format, ticket-validation logic, registration-level attendance
logic, replacement logic and revocation logic are all untouched.

The existing web ticket and ticket-management screens are unchanged. This
ticket only adds to them: a link from ticket management to the new
documents page, and a PDF Documents section below the existing web ticket
preview on the ticket detail page.

CHECKIN-09A prepares and packages. It never sends. Email delivery, Google
Apps Script distribution, delivery status, bounce handling and result import
are all deferred to CHECKIN-09B.

## Architecture

```
src/features/ticket-documents/
  constants.ts       bucket, template version, limits, file-name and path builders
  types.ts           view and service types
  theme.ts           ALL visual styling for the PDF (single point of retuning)
  document.tsx       the one-page PDF component (pure presentation)
  render.ts          server-side render: token -> QR -> PDF bytes
  assets.ts          local branding assets, cached, never fetched over the network
  party.ts           registered-party normalization
  fingerprint.ts     deterministic source fingerprint + checksums
  presentation.ts    DB rows -> render shapes, timezone-aware formatting
  storage.ts         private Supabase Storage access
  repository.ts      database access (service role)
  service.ts         generation, regeneration, stale detection, invalidation
  read-service.ts    administration page read models
  summaries.ts       counts, rows, filters (pure)
  batches.ts         export batch creation + ZIP packaging
  manifest.ts        CSV manifest + batch summary (formula-injection safe)
  rate-limit.ts      per-administrator limits on expensive routes
  schemas.ts         Zod input validation
  components/        administration UI
```

Layering rule: `theme.ts` and `document.tsx` hold presentation only;
`service.ts` and `batches.ts` hold business logic. The design can be
retuned entirely within `theme.ts` without touching generation, versioning,
storage or export behaviour.

### Why @react-pdf/renderer

Controlled server-side rendering with a real document component. Version
4.5.1 declares `react: ^19.0.0`, which matches the project's React 19.2.4
and Next 16.2.10; a smoke render confirmed a valid single-page PDF with the
PNG logo embedded, so there was no compatibility blocker.

The PDF is never produced by screenshotting the web ticket and never
depends on browser print-to-PDF. All PDF routes and the renderer run on the
Node.js runtime.

### Why fflate for ZIP

- Actively maintained and zero transitive dependencies, so the export path
  adds no meaningful supply-chain surface.
- Pure JavaScript, no native bindings, works on the Node.js runtime.
- `zipSync` builds deterministic archives from in-memory buffers, which is
  what "the same batch reproduces the same logical contents" requires.

Note: ZIP stores MS-DOS dates covering only 1980-2099, and encodes *local*
date components. The fixed archive timestamp is therefore built from local
components (`new Date(1980, 0, 2, 12, 0, 0, 0)`), which is both in range in
every timezone and what actually makes the bytes identical across machines.

## Database changes

Migration: `supabase/migrations/20260720171500_create_branded_ticket_document_export.sql`

Additive only. It creates no policy, drops nothing, updates no existing row
and alters no existing table.

### Enums

- `ticket_document_status`: `current`, `superseded`, `invalidated`
- `ticket_document_invalidation_reason`: `superseded`, `replaced`, `revoked`, `invalid`
- `ticket_document_batch_status`: `draft`, `generating`, `ready`, `partial`, `failed`, `exported`, `cancelled`
- `ticket_document_batch_purpose`: `initial`, `updated`, `replacement`, `resend_preparation`
- `ticket_document_batch_item_status`: `ready`, `excluded`, `failed`

### Tables

**`graduation_event_ticket_settings`** - one row per event (unique
`event_id`) driving PDF presentation: display title, description,
`program_schedule` jsonb, primary logo asset, secondary asset, template
version, instructions.

**`graduation_ticket_documents`** - append-only versioned history. Unique
`(ticket_id, document_version)`, unique `storage_path`, and a partial
unique index on `ticket_id WHERE status = 'current'` guaranteeing exactly
one current document per ticket. Check constraints enforce SHA-256 hex for
the checksum and fingerprint, `application/pdf`, positive sizes and
versions, and that lifecycle timestamps agree with the status. A guard
trigger makes all generated-file metadata immutable after insert, so a
stored checksum always describes the stored bytes.

**`graduation_ticket_document_batches`** - batch headers with counts,
manifest checksum and lifecycle timestamps. A check constraint caps
`selected_count` at 50 so an oversized batch is impossible even if an
application check is bypassed.

**`graduation_ticket_document_batch_items`** - immutable per-registration
snapshots. Carries `recipient_email_snapshot` solely so CHECKIN-09B has a
manifest to distribute from. A check constraint requires a `ready` item to
carry a complete document snapshot and a non-ready item to carry a reason.

### Functions

Both are `security definer` with `set search_path = ''`, verify an active
administrator against `staff_profiles`, and have execution revoked from
`public`, `anon` and `authenticated`.

**`finalize_graduation_ticket_document(...)`** - the only supported way to
create a current document. It locks the ticket row `FOR UPDATE`, allocates
the next version, supersedes the prior current document, inserts the new
row with its snapshot and checksum, and returns the new record.

**`invalidate_graduation_ticket_documents(actor, ticket, reason)`** - marks
every non-invalidated document of a replaced or revoked ticket. It refuses
the `superseded` reason, which is owned by finalization. It never touches
`graduation_tickets`, `graduation_checkins` or attendance totals.

## Storage model

Private bucket `graduation-ticket-documents`: `public = false`, MIME
restricted to `application/pdf`, 10 MB size limit, no storage policy, so
`anon` and `authenticated` cannot read or write objects.

Object paths are opaque and built from identifiers only:

```
events/<event-id>/tickets/<ticket-id>/documents/<document-id>.pdf
```

No graduate name and no email address ever appears in a storage path.

Because Storage and Postgres do not share a transaction, generation follows
a strict order:

1. Render the PDF in memory.
2. Compute the SHA-256 checksum.
3. Upload to a unique object path with `upsert: false`, so a prior PDF is
   never overwritten.
4. Finalize the database record atomically.
5. If finalization fails, remove the uploaded object as best-effort
   cleanup.

Administrators never see a permanent public URL. Downloads go through an
authenticated server route that streams the stored bytes, or a short-lived
signed URL created server-side.

## PDF design

US Letter portrait, exactly one page.

The Canva reference supplied at `public/ticket.pdf` is a 612x198pt landscape
admission strip (Anton + Poppins, white type over a full-bleed stock photo,
`STAND UP` / `ADMIT ONE`, plus Canva placeholders). Landscape was rejected
because that strip carries about five short elements, whereas this ticket
must also carry the registered party, the full ceremony details and a
three-entry program schedule. Portrait is the only layout where all required
information stays readable, which is the condition the scope placed on
landscape.

Borrowed from the reference: a solid dark hero band, oversized caps display
type, an ADMIT-ONE style admission motif (`ADMITS <n>`), rule-separated
detail rows and a quiet base line for fine print. Deliberately not
reproduced: the stock microphone image, `www.reallygreatsite.com`,
`123 Anywhere St., Any City` and every other placeholder.

Layout, top to bottom:

- **Hero band** (brand navy): academy logo, then the required heading -
  `Toronto Academy of Education` / `Convocation Ceremony 2026` /
  `Graduate & Registered Party Admission Ticket`, closed by a tan rule.
- **Description** paragraph.
- **Admission row**: `ADMITS <n>`, graduate name, the single-ticket
  coverage statement and the live-validation note on the left; the QR on
  the right in its own explicitly white cell with 10pt quiet padding, with
  the ticket code beneath it.
- **Two columns**: registered party and ceremony details on the left; the
  program schedule (and instructions) on the right.
- **Footer**: document version, issue date and total registered party.

Readability: hierarchy comes from weight and size rather than hue, so the
page reads correctly printed in black and white as well as in colour. The
QR is 132pt (~46mm), comfortably above the practical floor for reliable
scanning from a phone screen and from paper, and nothing is ever drawn
behind or across it.

Typography uses the PDF core Helvetica family: no bundled font binary, no
network access while rendering, identical embedding on every platform.

### Branding assets

- Primary logo: `public/logo_final_full.png`, the Toronto Academy of
  Education lockup. A file named `taelogo` does not exist in this
  repository; `assets.ts` still probes for `taelogo.{png,jpg,jpeg}` first,
  so dropping one in later promotes it with no code change.
- The PNG embeds directly and correctly, so no PDF-specific converted copy
  was needed and the original asset was not modified.
- `public/pic.jpg` was not used. Its visible banner reads `CLASS OF 2024`,
  which conflicts with a 2026 convocation ticket. The `secondary_asset`
  column and the renderer both support an optional decorative image, so a
  suitable asset can be configured later without code changes.
- Assets are read from the committed `public/` folder on the server and
  cached in-process. Rendering never makes a network request for an asset.

## Event configuration

`graduation_events` keeps owning the schedule-independent facts (code,
mode, status, timestamps, venue). `graduation_event_ticket_settings` owns
only what the printed ticket shows.

Configured values:

| Field | Value |
| --- | --- |
| Title | Convocation Ceremony 2026 |
| Date | Sunday, July 26, 2026 |
| Timezone | America/Toronto |
| Start | 2026-07-26 12:00 PM (stored `2026-07-26T16:00:00Z`, EDT) |
| End | 2026-07-26 4:00 PM (stored `2026-07-26T20:00:00Z`, EDT) |
| Venue | Mississauga Grand Banquet & Event Centre |
| Address | 35 Brunel Road, Mississauga, ON L4Z 3E8 |

Program schedule, exactly three entries and no invented activity after
2:30 PM:

- 12:15 PM - 1:00 PM, Introduction & Refreshments
- 1:00 PM - 1:30 PM, A Special Message to Our Graduates
- 1:30 PM - 2:30 PM, Certificate & Award Ceremony

## Document versioning

Versions are per ticket and allocated only inside
`finalize_graduation_ticket_document`, under a `FOR UPDATE` lock on the
ticket row. Regeneration supersedes the prior current document and inserts
the next version; nothing is ever overwritten and history is append-only.

Two simultaneous generations serialize on the lock and therefore produce
versions *n* and *n+1*. The partial unique index is the final backstop:
even if application logic were wrong, a second current document cannot
exist.

## Stale-document detection

`source_fingerprint` is a SHA-256 over every input that affects the rendered
PDF: ticket identity and status, ticket code, graduate name, normalized
adult guest records in display order, child-category counts, total party
count, all event details, all ticket settings, the program schedule, the
template version and the asset identifiers.

It is strictly deterministic. No clock, random or request-scoped value
participates, values are normalized for whitespace and keys are emitted in
a fixed order, so the same inputs always produce the same fingerprint.

When the live fingerprint differs from the stored one, the administrator
sees `Updated registration - new PDF required` or
`Event information changed - new PDF required` (or the template equivalent).
The existing PDF is never overwritten; a new version is generated.

## Registered party

One registration produces exactly one admission ticket covering the graduate
and every registered guest. No separate guest ticket exists.

Counts come from the `graduation_registrations` columns; names come from the
normalized `registration_guests` rows. Raw Excel-import columns are never
read. The enum values `adult` / `child_0_4` / `child_5_10` map one-to-one
onto the confirmed display categories, so no category is inferred or
reclassified.

A guest with no recorded name still counts but never renders an empty line:
the ticket shows, for example, `1 additional adult guest`. Names are capped
at the registered adult count so a stale extra guest row cannot inflate the
printed ticket. Long names wrap and the page stays on one sheet.

## Document watermarks

A newly generated current document carries no watermark. Administrator
previews of historical documents are watermarked `SUPERSEDED`, `REPLACED`,
`REVOKED` or `INVALID`. Only a `current` document can enter a new export
batch.

## Replacement and revocation

The existing replace and revoke routes call
`invalidateDocumentsForTicket(...)` *after* the existing operation has
succeeded. This marks the ticket's documents `invalidated` with reason
`replaced` or `revoked`, preserving them as history while blocking them from
any new batch. The new ticket receives its own PDF when an administrator
generates one.

Document generation, replacement and invalidation never reset attendance and
never read or write CHECKIN-07 or CHECKIN-08 records. A test asserts that no
ticket-document module references `graduation_checkins` at all.

## Administrator workflow

Route: `/admin/tickets/documents`, administrator only, linked from the
existing ticket-management header. Not exposed to supervisors or scanners.

Counts shown: eligible active tickets, missing PDF, current, outdated,
superseded, invalidated, generation failed, ready for export, already in an
export batch, missing recipient email, test and production registrations.

Filters: all, missing PDF, current, outdated, invalidated, ready for export,
missing email, test, production.

Actions: generate one, generate selected, generate all missing, regenerate
outdated, preview current, download current, view history, create an export
batch from selected current documents, download a completed batch ZIP,
cancel a draft batch.

Nothing is generated or exported on page load. Bulk generation and batch
creation both require typed confirmation (`GENERATE PDFS` and
`CREATE EXPORT BATCH`).

On the existing ticket detail page, a PDF Documents section shows the
current version, generated date, checksum summary, source state, preview,
download and regenerate actions, full document history and invalidation
status. The existing web ticket preview is untouched.

## Bulk generation

Generation runs in bounded chunks of 15 (configurable, 10-25) rather than
one unbounded request. Each item returns an individual result, so one
failure never discards documents that already succeeded and an incomplete
run can simply be resumed by regenerating what is still missing. Rendering
is sequential on purpose: it is CPU bound, and parallel renders would starve
the request handler.

## Batch export

A batch is immutable once created; every item stores a frozen snapshot, so
later registration edits never change what a completed batch says or ships.
Default size 25, hard maximum 50, enforced in the schema, the service and a
database check constraint. Multiple batches may be created.

Only a `current` document is included. Anything superseded, invalidated,
replaced or revoked, or lacking an active ticket, is recorded as an
`excluded` item with a reason, so the batch is fully auditable.

### ZIP package

Built on demand from the immutable snapshot and the private PDF objects, so
it is never stored and the same batch reproduces the same logical contents.

```
<batch-code>/
    manifest.csv
    batch-summary.txt
    PDFs/
        TAE-Convocation-2026-<TICKET-CODE>-V<VERSION>.pdf
```

### Manifest CSV

Columns: `batch_code`, `export_item_id`, `event_title`, `graduate_name`,
`recipient_email`, `ticket_code`, `document_version`, `pdf_file_name`,
`pdf_sha256`, `graduate_count`, `adult_guest_count`, `adult_guest_names`,
`child_0_4_count`, `child_5_10_count`, `total_party_count`,
`document_generated_at`, `batch_created_at`, `export_purpose`,
`item_status`.

Excluded: raw QR token, ticket-signing secret, service-role key, storage
object URL, internal authentication user IDs.

Every value gets two protections: RFC 4180 quoting, and formula-injection
neutralization that prefixes a literal apostrophe to any value starting with
`=`, `+`, `-` or `@` (including behind leading tab or carriage return, which
some spreadsheets skip before evaluating).

### Batch summary

`batch-summary.txt` carries the batch code, event, purpose, creation and
export timestamps, item count, PDF count, excluded and failed counts, the
manifest checksum, the generating role, and an explicit statement that the
batch was prepared but **not** emailed by CHECKIN-09A. It contains no
secrets.

## Security controls

- Administrator only, on every route and page, verified server-side.
- All storage operations are server-only; the service-role key never
  reaches the browser.
- The raw QR token is built inside the renderer, drawn and discarded. It is
  never returned, logged, persisted or snapshotted. The token hash never
  passes through this feature at all.
- No public bucket, no permanent public URL.
- No student name, email or phone in any PDF file name or storage path.
- Append-only document history; immutable generated-file metadata enforced
  by trigger.
- Every PDF checksummed; checksums verifiable by the verification script.
- All route inputs validated with Zod before any work happens.
- Expensive routes rate limited per administrator: 20 generations/min,
  10 exports/min.
- Responses are `private, no-store` with `X-Content-Type-Options: nosniff`.
- Test fixtures contain no real data.

## Testing

`src/tests/ticket-documents/` - 179 tests across 8 files, all synthetic
fixtures.

| File | Covers |
| --- | --- |
| `pdf-render.test.ts` | PDF signature, exactly one page, headings, date, time, venue, address, all three schedule entries, ticket code, graduate name, version, issue date, party total, coverage and validation notes, watermarks, token/UUID/email absence, all party permutations, unnamed guests, long-name wrapping |
| `party.test.ts` | Party normalization, ordering, blank and null names, stale-row capping, totals |
| `fingerprint.test.ts` | Determinism, no clock, whitespace insensitivity, sensitivity to every relevant input, no credential material |
| `manifest.test.ts` | CSV columns, formula injection for `=`, `+`, `-`, `@`, quoting, no credentials, checksums, batch summary |
| `zip.test.ts` | Archive layout, manifest and PDF round-trip, byte-identical reproduction, no email in file names |
| `naming.test.ts` | File-name pattern, no PII in names or paths, path uniqueness, batch limits |
| `summaries.test.ts` | Row states, export eligibility, invalid documents blocked, counts, filters, no email leakage |
| `lifecycle.test.ts` | Stale detection messages, version 1 then 2, supersession, append-only history, concurrent generation, cleanup after failed finalization, rate limiting |
| `permissions.test.ts` | Administrator allowed; scanner, supervisor, anonymous, deactivated and must-change-password denied |
| `route-safety.test.ts` | Guards, Node runtime, no-store, schema validation, rate limits, server-only modules, no logging of secrets, no public URL, `upsert: false`, cleanup paths, nothing on page load, no email dependency, existing web ticket / scanner / attendance intact |
| `migration-safety.test.ts` | Additive only, ordering, enums, unique indexes, constraints, immutability trigger, locking, RLS and revokes, private bucket, no raw-token column |

Full suite after this ticket: **835 tests across 78 files, all passing.**

## Manual deployment steps

Docker was not running in the development environment, so the migration was
validated statically rather than executed. Apply it deliberately:

1. Review `supabase/migrations/20260720171500_create_branded_ticket_document_export.sql`.
2. Apply the migration to the target project using your normal deployment
   path. `supabase db push` was **not** run by this ticket, and no
   destructive reset was performed.
3. Confirm the `graduation-ticket-documents` bucket exists and is private.
   The migration upserts it; verify in the dashboard.
4. Run `npm run tickets:configure-event` to set the event display
   information and ticket settings. It is idempotent and preserves the
   event code, mode, draft/production status, registrations, tickets,
   check-ins and attendance.
5. Run `npm run tickets:verify-config` and confirm every check passes.
6. Generate a small batch of PDFs and preview one before generating in
   bulk.

## Deferred to CHECKIN-09B

Not implemented here, by design:

- Google Apps Script distribution
- Email sending, Gmail API, Resend or any other provider
- Delivery-status tracking and bounce detection
- Result-import processing
- Production event-mode activation

The batch manifest already carries `recipient_email` precisely so
CHECKIN-09B can consume a completed, immutable batch without re-deriving
anything. The `resend_preparation` batch purpose exists for that workflow.
