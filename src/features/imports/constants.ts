/**
 * Shared constants for the registration import feature. This module is safe
 * to import from both server and client code. It must never contain secrets.
 */

/**
 * The exact source headers the importer recognizes. Matching trims outer
 * whitespace, so a header such as "Guest 2 " with a trailing space is
 * treated the same as "Guest 2". Columns are always mapped by header name
 * and never by column position.
 */
export const EXPECTED_HEADERS = [
  "order_id",
  "order_date",
  "status",
  "Email",
  "Full Name",
  "Graduation Gown Size",
  "Name Pronunciation",
  "Phone Number",
  "Guest 1",
  "Guest 2",
  "Kids (0 to 4)",
  "Kids (4 to 10)",
  "fee_total",
  "fee_tax_total",
  "tax_total",
  "order_total",
] as const;

export type ExpectedHeader = (typeof EXPECTED_HEADERS)[number];

/** Every expected header is required for a worksheet to be selected. */
export const REQUIRED_HEADERS: readonly ExpectedHeader[] = EXPECTED_HEADERS;

export const ALLOWED_FILE_EXTENSION = ".xlsx";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * The import target event is fixed for this ticket. Event codes are never
 * accepted from the browser. Later tickets add event selection.
 */
export const IMPORT_EVENT_CODE = "GRAD-2026-DEV";

/** Source system recorded for Excel registration exports. */
export const IMPORT_SOURCE_SYSTEM = "registration_export" as const;

export const PREVIEW_PAGE_SIZE = 25;

/** Exact confirmation text required before an import can be applied. */
export const APPLY_CONFIRMATION_TEXT = "APPLY IMPORT";

export const MAX_ADULT_GUESTS = 2;

export const MAX_CHILDREN_PER_GROUP = 2;

export const MAX_COMBINED_CHILDREN = 2;

export const MIN_PHONE_DIGITS = 10;

export const MAX_PHONE_DIGITS = 15;

/**
 * The source workbook labels the older child group "Kids (4 to 10)". The
 * application always uses the approved wording "5 to 10". An import notice
 * explains this normalization to administrators.
 */
export const CHILD_GROUP_NORMALIZATION_NOTICE =
  'The source column "Kids (4 to 10)" is recorded as the approved ' +
  '"children aged 5 to 10" category.';
