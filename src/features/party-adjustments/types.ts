/**
 * View and service types for administrator party adjustments. Safe for server
 * and client imports. Nothing here ever carries a QR token, a token hash or a
 * signing secret.
 */

/** A party snapshot as stored in the audit row and returned by the RPC. */
export interface PartySnapshot {
  graduateName: string;
  graduateCount: number;
  adultGuestNames: string[];
  adultGuestCount: number;
  children04Count: number;
  children510Count: number;
  totalPartyCount: number;
}

/** The PDF outcome of an applied adjustment. */
export type AdjustmentPdfStatus =
  | "regenerated"
  | "not_applicable"
  | "generation_failed";

export interface PartyAdjustmentResult {
  /** True when nothing changed because the proposed party already matched. */
  noChange: boolean;
  /** True when this idempotency key had already been applied. */
  duplicate: boolean;
  adjustmentId: string | null;
  registrationId: string;
  /** The unchanged active ticket, when the graduate has one. */
  ticketId: string | null;
  ticketCode: string | null;
  before: PartySnapshot;
  after: PartySnapshot;
  /** Outcome of regenerating the PDF for the same, unchanged ticket. */
  pdfStatus: AdjustmentPdfStatus;
  newDocumentVersion: number | null;
  newPdfFileName: string | null;
  /**
   * Set when the party was saved but the PDF could not be regenerated. The
   * adjustment is real and the QR is still valid, but the old PDF is now
   * outdated and must not be sent until a new one is generated.
   */
  pdfWarning: string | null;
}

export interface StructuredError {
  error: {
    code: string;
    message: string;
  };
}
