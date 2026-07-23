/**
 * Shared constants for the direct production RSVP import. Safe to import
 * from both server and client code. Must never contain secrets.
 */

/**
 * The exact headers of the current RSVP workbook, reproduced verbatim.
 * The administrator must never have to edit the workbook before uploading,
 * so these names are matched as they actually ship - including "Kids" for
 * the older child group and the " - Full Name" guest suffixes.
 *
 * Matching trims outer whitespace on both sides and is case-insensitive,
 * so "Status" and "status" both resolve. Columns are always matched by
 * header name and never by column position.
 */
export const RSVP_HEADERS = [
  "order_id",
  "order_date",
  "Status",
  "Full Name",
  "Email",
  "Phone Number",
  "Graduation Gown Size",
  "Name Pronunciation",
  "Guest 1 - Full Name",
  "Guest 2 - Full Name",
  "Kids (0 to 4)",
  "Kids",
  "fee_total",
  "fee_tax_total",
  "order_total",
  "Note",
] as const;

export type RsvpHeader = (typeof RSVP_HEADERS)[number];

/**
 * Headers a worksheet must contain to be selected. "Note" and the
 * pronunciation column are genuinely optional in some exports, so their
 * absence downgrades to a notice rather than rejecting the workbook.
 */
export const REQUIRED_RSVP_HEADERS: readonly RsvpHeader[] = [
  "order_id",
  "Status",
  "Full Name",
  "Email",
];

/**
 * Alternative spellings accepted for the same logical column. The earlier
 * CHECKIN-03 export used "Guest 1" and "Kids (4 to 10)"; both workbooks
 * import without the administrator touching the file.
 */
export const HEADER_ALIASES: Readonly<Record<string, RsvpHeader>> = {
  "guest 1": "Guest 1 - Full Name",
  "guest 1 full name": "Guest 1 - Full Name",
  "guest 2": "Guest 2 - Full Name",
  "guest 2 full name": "Guest 2 - Full Name",
  "kids (4 to 10)": "Kids",
  "kids (5 to 10)": "Kids",
  "kids 5 to 10": "Kids",
  "tax_total": "fee_tax_total",
  "phone": "Phone Number",
  "note / comments": "Note",
  notes: "Note",
};

export const ALLOWED_FILE_EXTENSION = ".xlsx";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Every reconciled graduate keeps the registration_export source system,
 * so an order ID imported by CHECKIN-03 resolves to the same registration. */
export const PRODUCTION_IMPORT_SOURCE_SYSTEM = "registration_export" as const;

/** Exact confirmation text required before a production import is applied. */
export const APPLY_CONFIRMATION_TEXT = "APPLY PRODUCTION IMPORT";

export const MAX_ADULT_GUESTS = 2;

export const MAX_CHILDREN_PER_GROUP = 2;

export const MAX_COMBINED_CHILDREN = 2;

/**
 * The workbook labels the older child group "Kids". The application always
 * uses the approved wording "children aged 5 to 10". An import notice
 * explains the mapping to the administrator.
 */
export const CHILD_GROUP_NORMALIZATION_NOTICE =
  'The source column "Kids" is recorded as the approved "children aged ' +
  '5 to 10" category. "Kids (0 to 4)" is recorded as "children aged 0 to 4".';

/**
 * Wording that marks a Note as describing an additional guest or child
 * rather than a general comment. A row carrying one of these is never
 * consolidated away as a duplicate submission.
 */
export const GUEST_UPDATE_NOTE_PATTERNS: readonly RegExp[] = [
  /\badd(?:ing|ed|itional)?\b[^.]{0,30}\b(guest|child|kid|seat|ticket)\b/i,
  /\b(extra|another|one more|second|2nd)\b[^.]{0,30}\b(guest|child|kid|seat)\b/i,
  /\bguest\b[^.]{0,20}\b(payment|paid|fee|update|change)\b/i,
  /\b(paid|payment)\b[^.]{0,20}\b(guest|child|kid)\b/i,
];

export function noteIndicatesGuestUpdate(note: string | null): boolean {
  const text = (note ?? "").trim();
  if (text.length === 0) {
    return false;
  }
  return GUEST_UPDATE_NOTE_PATTERNS.some((pattern) => pattern.test(text));
}
