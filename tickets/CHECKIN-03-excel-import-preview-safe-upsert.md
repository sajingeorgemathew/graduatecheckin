CHECKIN-03: Excel Upload, Validation Preview and Safe Registration Upsert
Objective

Create a secure and reviewable Excel registration import workflow for the Toronto Academy of Education Graduation Check-In application.

The workflow must:

Accept a registration .xlsx file.
Parse only the expected worksheet structure.
Validate and normalize every row.
Show an import preview before changing approved registration records.
Compare uploaded rows against existing registrations.
Identify new, updated, unchanged, failed and invalid rows.
Apply approved rows using a safe and repeatable upsert.
Never delete registrations merely because they are missing from a newer spreadsheet.
Preserve existing registration IDs, tickets and check-in history.
Keep the feature unavailable in production until staff authentication is completed in CHECKIN-04.
Project information

Application:

Graduation Check-In

Organization:

Toronto Academy of Education

Local path:

C:\Users\USER\Desktop\Graduationcheckin

Required branch:

feat/checkin-03-excel-import

Hosted Supabase project:

rydqtotlhzgckdxiditt
Existing foundation

CHECKIN-02 has already created:

graduation_events
graduation_registrations
registration_guests
graduation_tickets
staff_profiles
graduation_checkins
Supabase migrations
Mock development records
Protected mock reset scripts
Database TypeScript definitions
Row Level Security
Server-only service-role access

Preserve all existing work.

Privacy and security rules
Do not open or read anything inside _reference.
Do not parse the real registration workbook during implementation.
Do not use real graduate or guest information in tests.
Do not commit uploaded workbooks.
Do not save the original workbook to Git, Supabase Storage or the public filesystem.
Do not log spreadsheet rows.
Do not log names, emails, phone numbers or payment data.
Do not expose the Supabase service key.
Do not expose the ticket-token secret.
Only trusted server-side code may read or write import records.
Keep Row Level Security enabled.
Do not add anonymous or unrestricted authenticated access.
Do not use long hyphens or em dashes in UI text, documentation or comments.
Do not implement staff authentication in this ticket.
Do not make the production import page publicly accessible.
Current Excel structure

The importer must recognize these exact source headers:

order_id
order_date
status
Email
Full Name
Graduation Gown Size
Name Pronunciation
Phone Number
Guest 1
Guest 2
Kids (0 to 4)
Kids (4 to 10)
fee_total
fee_tax_total
tax_total
order_total

Header matching must:

Trim leading and trailing whitespace.
Treat Guest 2 and Guest 2 as the same header.
Preserve the expected names for administrative reporting.
Reject a workbook when required headers are missing.
Report unexpected headers as informational notices.
Never map columns solely by column position.
Supported file format

Accept only:

.xlsx

Reject:

.xls
.xlsm
.csv
.pdf

Maximum file size:

10 MB

Requirements:

Validate the extension.
Validate that the uploaded file is a readable XLSX workbook.
Reject empty files.
Reject password-protected or unreadable workbooks.
Reject workbooks with no worksheets.
Do not execute macros.
Do not evaluate spreadsheet formulas.
If a mapped source cell contains a formula, flag that row for review.
Parse the file in memory.
Do not retain the original file after parsing.
Worksheet selection

The workbook may contain one or more sheets.

Selection logic:

Search every worksheet for the expected header set.
Select the first sheet that contains all required headers.
Record the selected worksheet name.
If no worksheet matches, reject the upload.
If multiple sheets match, use the first and add an import warning.
Ignore empty rows after the last populated registration row.

Do not depend on a specific worksheet name.

Import access protection

Add:

ENABLE_DEV_IMPORTS=false

to .env.example.

Add the missing variable name to .env.local without overwriting existing values.

The import interface and API routes may operate only when:

APP_ENV is exactly development
ENABLE_DEV_IMPORTS is exactly true

When either condition is false:

Import pages return not found or a disabled state.
Import mutation endpoints reject the request.
No spreadsheet parsing occurs.
No database import records are created.

This is temporary protection until CHECKIN-04 adds staff authentication.

Do not add ENABLE_DEV_IMPORTS=true to Vercel Production.

New migration

Create a Supabase migration using:

npx supabase migration new create_registration_import_pipeline

The migration must add the import schema described below.

Do not modify the already-applied CHECKIN-02 migration.

Database enum: import status

Create an import status type with:

uploaded
preview_ready
applying
applied
failed
cancelled
duplicate
Database enum: import row result

Create an import row result type with:

new
update
unchanged
warning
error
excluded
applied
Table: registration_imports

Create:

public.registration_imports

Columns:

id
event_id
original_filename
file_sha256
file_size_bytes
worksheet_name
source_system
status
total_rows
new_rows
updated_rows
unchanged_rows
warning_rows
error_rows
excluded_rows
missing_existing_rows
created_by
applied_by
created_at
applied_at
updated_at

Requirements:

UUID primary key.
event_id references graduation_events.
source_system defaults to registration_export.
Store only the original filename, file size and SHA-256 hash.
Do not store the workbook contents.
file_sha256 is required.
Add a uniqueness rule for applied files within the same event.
The same file must not be applied twice to the same event.
created_by and applied_by may reference auth.users.
These fields may remain null until CHECKIN-04.
Counts must be non-negative.
Add created and updated timestamps.
Add useful indexes for event, status, hash and creation time.
Table: registration_import_rows

Create:

public.registration_import_rows

Columns:

id
import_id
source_row_number
source_registration_id
graduate_full_name
email
phone
gown_size
name_pronunciation
guest_1_name
guest_2_name
registered_adult_guests
registered_children_0_4
registered_children_5_10
expected_party_size
source_order_status
registration_status
payment_status
fee_total
tax_total
order_total
source_order_date
result
validation_errors
validation_warnings
existing_registration_id
normalized_snapshot
applied_at
created_at
updated_at

Requirements:

UUID primary key.
import_id references registration_imports with cascade delete.
source_row_number is required and positive.
source_registration_id stores normalized order_id as text.
validation_errors is a JSON array.
validation_warnings is a JSON array.
normalized_snapshot stores only the whitelisted normalized import values.
Do not store unmapped spreadsheet cells.
Do not store formulas.
Add a unique constraint on import and source row number.
Add indexes for import, result, source ID and existing registration.
Include updated timestamp handling.
Row Level Security

Enable Row Level Security on:

registration_imports
registration_import_rows

Requirements:

Revoke all table privileges from anon.
Revoke all table privileges from authenticated.
Do not add public policies.
Do not add broad authenticated policies.
Service-role access remains server-only.
CHECKIN-04 will add staff access through protected server routes.
Database comments

Add comments explaining:

Import batches represent reviewed uploads.
Original workbooks are not stored.
Import rows contain normalized whitelisted values only.
Missing rows never trigger automatic deletion.
Applying an import preserves registration IDs.
Authentication policies will be added in CHECKIN-04.
Atomic import apply function

Create a PostgreSQL function:

public.apply_registration_import(p_import_id uuid)

The function must:

Be security definer.
Use an explicit safe search_path.
Lock the selected import batch.
Require the import status to be preview_ready.
Reject duplicate or previously applied imports.
Upsert rows with result new, update, unchanged or warning.
Skip rows with result error or excluded.
Match existing registrations using:
event ID
source system
source registration ID
Preserve existing registration UUIDs.
Preserve ticket and check-in relationships.
Update approved registration fields.
Replace the registration's optional guest-name rows using the approved imported values.
Never delete registrations absent from the upload.
Never delete a graduation event.
Never create ticket records.
Never create check-in records.
Mark applied import rows with applied_at.
Mark the import batch as applied.
Set applied_at.
Return summary counts only.

Security requirements:

Revoke execute from public.
Revoke execute from anon.
Revoke execute from authenticated.
Allow only trusted server-side invocation.
Do not expose this function through a public browser client.
Input normalization

Create strict server-side normalization utilities.

Order ID
Required.
Accept numeric or text cell values.
Convert to trimmed text.
Reject blank values.
Reject duplicate order IDs within the same workbook.
Use as source_registration_id.
Full name
Required.
Trim whitespace.
Collapse repeated spaces.
Preserve display capitalization from the source.
Reject blank values.
Email
Trim whitespace.
Convert to lowercase.
Validate basic email structure.
Blank email produces a warning, not an automatic failure.
Duplicate emails are warnings only.
Email is never a unique registration identifier.
Phone
Convert to digits only.
Allow blank phone with a warning.
Valid normalized phone length is 10 to 15 digits.
Invalid phone values produce a warning.
Phone is never a unique registration identifier.
Gown size
Trim whitespace.
Preserve the source description.
Blank gown size produces a warning.
Name pronunciation
Trim whitespace.
Preserve line breaks where useful.
Blank pronunciation is allowed.
Adult guests
Each non-empty Guest 1 or Guest 2 cell counts as one adult guest.
Maximum adult guests is two.
Preserve guest names after whitespace normalization.
Do not split names automatically by commas, ampersands or line breaks.
Add a warning when one guest cell appears to contain multiple names.
Guest names are optional.
Children aged 0 to 4
Blank means zero.
Accept numeric values.
Accept text such as 1 child or 2 children.
Extract one clear integer.
Allowed values are zero, one or two.
Invalid or ambiguous values produce an error.
Children aged 5 to 10

The source workbook uses:

Kids (4 to 10)

The application must normalize this into:

registered_children_5_10

Requirements:

Display an import notice explaining the normalization.
Use the approved application wording 5 to 10.
Apply the same numeric parsing and limits as the younger age group.
Combined children across both age groups must not exceed two.
Expected party size

Calculate:

1 graduate
+ adult guests
+ children aged 0 to 4
+ children aged 5 to 10

Do not trust a source total.

Order date
Accept valid Excel dates and recognizable text dates.
Convert to an ISO-compatible timestamp.
Invalid dates produce a warning.
A blank order date is allowed with a warning.
Monetary values

Normalize:

fee_total
fee_tax_total
tax_total
order_total

Rules:

Blank monetary cells default to zero.
Reject negative values.
Round to two decimal places.
Store tax_total.
Use fee_tax_total only as a validation comparison or fallback.
If fee_tax_total and tax_total are both present and differ, add a warning.
Do not infer that an order is paid solely because an amount exists.
Source status

Normalize the source status to lowercase.

Mapping:

processing
registration_status: eligible

Payment status:

amount_recorded when order_total is greater than zero
unknown when order_total is zero

Do not label processing as paid.

failed
registration_status: failed
payment_status: failed

The row remains visible in the preview but is excluded from normal eligible ticket processing.

Unknown status
registration_status: review_required
payment_status: unknown

Add a warning showing the unknown source status.

Preview comparison logic

Each parsed row must receive one action result.

New

No matching event, source system and source registration ID exists.

Update

A matching registration exists and one or more approved fields differ.

Unchanged

A matching registration exists and all approved fields match.

Warning

The row is structurally valid but contains one or more non-blocking warnings.

The underlying database action may still be new, update or unchanged. Preserve both the comparison action and warning information in the server-side preview model.

Error

The row cannot be safely imported.

Examples:

Missing order ID
Duplicate order ID in workbook
Missing full name
Invalid child count
Combined children above two
Negative monetary value
Unreadable required value
Excluded

The administrator has intentionally excluded the row from application.

Inline row editing is out of scope. Administrators must correct the Excel file and upload it again when a blocking error exists.

Missing existing registrations

Compare the uploaded source order IDs against existing registrations for the same event and source system.

Show a count and review list for existing registrations absent from the latest upload.

Requirements:

Do not delete them.
Do not cancel them.
Do not change their registration status.
Do not revoke tickets.
Label them as Missing from uploaded file.
Explain that no automatic action will occur.
Duplicate file protection

Calculate the SHA-256 hash before parsing.

If an identical file hash has already been applied to the same event:

Create no new approved registration changes.
Mark the new attempt as duplicate or return the existing applied import.
Display the date and summary of the previous application.
Do not apply the same file twice.

Uploading a changed workbook with a different hash must remain allowed.

Application routes

Create:

/admin/imports
/admin/imports/new
/admin/imports/[importId]
/admin/imports

Display:

Import history
Original filename
Upload date
Worksheet
Status
Total rows
New rows
Updated rows
Unchanged rows
Warning rows
Error rows
Applied date
View button
/admin/imports/new

Display:

Development-only access notice
XLSX upload area
File format guidance
Maximum file size
No original file retention notice
Upload and Preview button
/admin/imports/[importId]

Display the complete preview.

Preview interface design

Use the existing navy, gold, cream and white visual direction.

Include summary cards:

Total rows
New
Updates
Unchanged
Warnings
Errors
Missing from upload

Include filters:

All
New
Updates
Unchanged
Warnings
Errors
Failed
Excluded

Preview table columns:

Row
Order ID
Graduate
Email
Phone
Adults
Children 0 to 4
Children 5 to 10
Party size
Source status
Amount
Action
Issues

Requirements:

Responsive layout.
Desktop table view.
Mobile stacked-card view.
Sticky action area on large previews.
Do not render all rows at once when the workbook is large.
Add pagination with 25 rows per page.
Allow filtering without reparsing the workbook.
Mask phone numbers in list view except the final four digits.
Show full normalized data only in an expandable detail panel.
Never display secrets.
Preview actions

Include:

Exclude row
Include row
View details
Cancel import
Apply approved rows

Requirements:

Rows with errors are automatically excluded.
Warning rows remain included unless explicitly excluded.
Failed source-status rows remain included in the database import but clearly marked as ineligible.
Applying requires confirmation text:
APPLY IMPORT
The confirmation screen must summarize:
new rows
updates
unchanged rows
warnings
errors excluded
rows missing from upload
The Apply button must prevent double submission.
Use an idempotency mechanism.
After successful application, redirect to the completed import summary.
An applied import cannot be edited or reapplied.
Server structure

Create clear modules similar to:

src/features/imports/
  constants.ts
  types.ts
  schemas.ts
  access.ts
  workbook-parser.ts
  header-mapper.ts
  normalizers.ts
  validators.ts
  comparison.ts
  repository.ts
  service.ts
  apply.ts
  summaries.ts

Route handlers or server actions must remain thin.

Do not place all logic into one route file.

API or server actions

Implement server-side operations for:

Upload and preview
Import history
Import detail
Include or exclude row
Cancel import
Apply import

Requirements:

All mutations verify development import access.
Validate IDs using Zod.
Use service-role database access only.
Use no-store for private import data.
Return structured errors.
Do not return stack traces in production responses.
Do not accept arbitrary event codes from the browser.

For this ticket, the target event must be fixed to:

GRAD-2026-DEV

Later tickets will add event selection and production controls.

Mock workbook generator

Create:

scripts/mock-data/generate-import-workbook.ts

Add:

"db:generate:mock-import": "tsx scripts/mock-data/generate-import-workbook.ts"

The script must create a local-only workbook at:

tmp/mock-registration-import.xlsx

Requirements:

tmp/ must be ignored by Git.
Use the exact expected source headers.
Use fictional test data only.
Include at least 25 rows.
Include:
valid new rows
update candidates
unchanged candidates
failed status
missing email
invalid phone
duplicate email
duplicate order ID
one child in each age group
too many combined children
tax mismatch
unknown source status
multiple names in one guest cell
an extra unexpected column
Do not read _reference.
Do not commit the generated XLSX file.
Preview fixture strategy

Tests may:

Generate XLSX workbooks in memory.
Write temporary files only under tmp.
Delete temporary files after tests.
Use fictional values only.

Do not add real or copied registration rows to fixtures.

TypeScript database types

Update:

src/types/database.ts

Add:

Import status enum types
Import row result enum types
registration_imports
registration_import_rows
Database function typing for apply_registration_import

Do not use any.

Tests

Add tests for the following areas.

Header parsing
Exact header set
Trimmed Guest 2 header
Reordered columns
Missing required header
Unexpected extra header
Multiple matching worksheets
Empty workbook
File validation
Valid XLSX
Wrong extension
Oversized file
Unreadable file
Empty file
Formula in mapped cell
Normalization
Numeric and text order IDs
Lowercase email
Digits-only phone
Guest counting
Child text parsing
Child limit enforcement
Combined child limit
Expected party size
Money rounding
Tax comparison
Source status mapping
Date parsing
Workbook validation
Duplicate order IDs
Duplicate emails as warnings
Missing email as warning
Missing name as error
Failed order handling
Unknown source status
Multiple guest names warning
Comparison
New registration
Updated registration
Unchanged registration
Missing existing registration
No name or email based identity matching
Apply safety
Error rows are not applied
Excluded rows are not applied
Warning rows may be applied
Existing registration UUID is preserved
Missing existing rows are not deleted
Duplicate file application is blocked
Applied import cannot be reapplied
No tickets are generated
No check-ins are generated
Access controls
Import disabled in production
Import disabled when feature flag is false
Import allowed only in development with explicit flag
API does not return secret values
Migration safety

Verify:

Both import tables exist
RLS is enabled
anon privileges are revoked
authenticated privileges are revoked
Apply function uses security definer
Apply function has a fixed search path
Public execute access is revoked
No unrestricted policy exists

Tests must not connect to or modify the hosted Supabase project.

Homepage status update

Update the project status cards to reflect the real current state:

Application configured
Complete
Database migration deployed
Complete
Mock data loaded
Complete
Supabase project connected
Complete
Excel import workflow

During implementation:

In development

After implementation:

Ready for protected testing
QR scanner
Not implemented

Do not claim that staff authentication exists.

README update

Document:

Import architecture
Development-only access rule
Expected Excel headers
Preview workflow
Safe upsert behavior
Duplicate file protection
Missing-row behavior
Mock workbook generation
Commands
Manual migration deployment
CHECKIN-04 as the next required security ticket

Add this warning:

Do not enable the import interface in production until staff authentication is implemented.
Package scripts

Add:

{
  "db:generate:mock-import": "tsx scripts/mock-data/generate-import-workbook.ts"
}

Preserve all existing scripts.

Out of scope

Do not implement:

Staff authentication
Staff invitations
Staff role policies
Public production import access
Real workbook import by Claude
Event selection
Multiple production events
Inline spreadsheet row editing
QR tokens
QR images
Ticket visual design
Ticket PDFs
Ticket emailing
QR scanning
Event check-in
Dashboard reporting
Registration deletion based on missing rows
Automatic ticket revocation
Required commands

Run:

npm run db:generate:mock-import
npm run db:validate:mock
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check

Confirm the generated test workbook exists locally:

Test-Path ".\tmp\mock-registration-import.xlsx"

Expected:

True

Confirm it is ignored:

git check-ignore -v ".\tmp\mock-registration-import.xlsx"
Privacy checks

Run:

git ls-files |
    Select-String -Pattern "^node_modules/|^\.next/|^tmp/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"

Expected:

No output

Run:

git diff --name-only |
    Select-String -Pattern "^tmp/|^_reference/|\.xlsx$|\.xls$|\.csv$|^\.env\.local$"

Expected:

No output

Do not search inside _reference.

Acceptance criteria
A new migration defines the import pipeline.
Existing migrations remain unchanged.
Import tables have RLS enabled.
Public and authenticated direct access is blocked.
Original workbooks are not retained.
XLSX parsing uses header names rather than positions.
All expected columns are supported.
Guest 2 is normalized correctly.
Kids (4 to 10) maps to the approved 5 to 10 category.
Order ID is the external upsert key.
Name and email are not unique identifiers.
Import preview occurs before registration updates.
New, update, unchanged, warning and error states work.
Missing rows are never automatically deleted.
Identical applied files cannot be applied twice.
Existing registration UUIDs are preserved.
Guest details are safely synchronized.
Failed registrations remain marked failed.
Processing is not automatically labeled paid.
Error rows cannot be applied.
Warning rows can be reviewed and applied.
Apply is atomic and idempotent.
No tickets or check-ins are generated.
Production import access remains disabled.
Mock workbook generation works.
Tests use fictional information only.
Tests pass.
ESLint passes.
Type checking passes.
Production build passes.
Privacy checks pass.
_reference remains untouched.
No commit or push is performed by Claude.
Final report

Report:

Current branch
Migration created
Tables and database function added
Files created
Files modified
Packages added, if any
Import access protection
Expected columns supported
Normalization rules implemented
Preview statuses implemented
Duplicate protection
Missing-row behavior
Upsert behavior
Mock workbook result
Number of tests added
Test result
Lint result
Type-check result
Build result
Privacy-check result
Manual Supabase steps remaining
Assumptions
Issues requiring review

Do not include fixture names, emails, phone numbers, UUIDs, file contents or secrets.

Do not commit or push.