/**
 * Shared constants for the branded PDF ticket-document feature. Safe to
 * import from both server and client code. Must never contain secrets.
 */

/** Private Supabase Storage bucket holding every generated PDF. */
export const TICKET_DOCUMENT_BUCKET = "graduation-ticket-documents";

export const TICKET_DOCUMENT_MIME_TYPE = "application/pdf";

/**
 * Layout version of the PDF template. Increment whenever the rendered
 * layout changes so existing documents are detected as stale and can be
 * regenerated deliberately. This value feeds the source fingerprint.
 */
export const TICKET_DOCUMENT_TEMPLATE_VERSION = 1;

/** Default number of registrations placed in one export batch. */
export const EXPORT_BATCH_DEFAULT_SIZE = 25;

/**
 * Hard ceiling for one export batch. Mirrored by a check constraint on
 * graduation_ticket_document_batches so the database rejects an oversized
 * batch even if an application check is bypassed.
 */
export const EXPORT_BATCH_MAX_SIZE = 50;

/**
 * Bounded chunk for bulk generation. Generation runs in resumable chunks
 * rather than one unbounded request, so a large event never depends on a
 * single long-lived server call.
 */
export const GENERATION_CHUNK_SIZE = 15;

export const GENERATION_CHUNK_MAX = 25;

/** Exact confirmation text required before bulk PDF generation runs. */
export const GENERATE_DOCUMENTS_CONFIRMATION_TEXT = "GENERATE PDFS";

/** Exact confirmation text required before an export batch is created. */
export const CREATE_BATCH_CONFIRMATION_TEXT = "CREATE EXPORT BATCH";

export const PDF_FILE_NAME_PREFIX = "TAE-Convocation-2026";

/**
 * Builds the PDF file name. Carries the ticket code and document version
 * only: never a graduate name, email address or phone number.
 */
export function buildTicketDocumentFileName(
  ticketCode: string,
  documentVersion: number
): string {
  const safeCode = ticketCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return `${PDF_FILE_NAME_PREFIX}-${safeCode}-V${documentVersion}.pdf`;
}

/**
 * Opaque private-storage object path built from identifiers alone, so no
 * graduate name or email address ever appears in a storage path.
 */
export function buildTicketDocumentStoragePath(
  eventId: string,
  ticketId: string,
  documentId: string
): string {
  return `events/${eventId}/tickets/${ticketId}/documents/${documentId}.pdf`;
}

/** Lifetime of an administrator download link, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 120;

export const TICKET_DOCUMENT_HEADING_LINES = [
  "Toronto Academy of Education",
  "Convocation Ceremony 2026",
  "Graduate & Registered Party Admission Ticket",
] as const;

export const TICKET_DOCUMENT_COVERAGE_NOTE =
  "This single admission ticket covers the graduate and all registered " +
  "guests shown below. No separate guest ticket is required.";

export const TICKET_DOCUMENT_VALIDATION_NOTE =
  "Admission is subject to live ticket validation at check-in.";
