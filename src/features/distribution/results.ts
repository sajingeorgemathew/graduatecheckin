/**
 * Apps Script results-CSV parsing and validation for CHECKIN-09B.
 *
 * The Apps Script sender exports one row per send attempt. Importing it back
 * appends immutable attempt history and updates delivery status. This module
 * is pure and runtime-neutral: it parses the CSV, then evaluates every row
 * against the deliveries the app already prepared, so a malicious or
 * corrupted file can never inject a fake attempt.
 *
 * Nothing here writes to the database. The server layer applies only the
 * rows this module marks `accepted`.
 */

import {
  RESULT_OUTCOMES,
  isValidEmail,
  type DeliveryMode,
  type ResultOutcome,
} from "./constants";
import {
  verifyDeliveryRow,
  type DeliverySignaturePayload,
} from "./signing";
import type {
  EvaluatedResultRow,
  RawResultRow,
  ResultImportSummary,
  ResultRejectionReason,
} from "./types";

/** Column order the Apps Script export is expected to produce. */
export const RESULT_CSV_COLUMNS = [
  "delivery_batch_code",
  "delivery_reference",
  "row_signature",
  "attempt_reference",
  "attempt_number",
  "intended_recipient_email",
  "actual_recipient_email",
  "delivery_mode",
  "outcome",
  "attempted_at",
  "sent_by",
  "pdf_file_name",
  "pdf_sha256",
  "error_code",
  "error_message",
  "bounce_detected_at",
  "exported_at",
] as const;

const FORMULA_PREFIXES = ["=", "+", "-", "@"] as const;

/**
 * A minimal RFC 4180 parser. Handles quoted fields, escaped quotes and CRLF
 * or LF line endings. Returns rows of raw string cells.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;
  let i = 0;
  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) {
    i = 1;
  }
  const pushValue = (): void => {
    row.push(value);
    value = "";
  };
  const pushRow = (): void => {
    pushValue();
    rows.push(row);
    row = [];
  };
  for (; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushValue();
    } else if (char === "\r") {
      if (text[i + 1] === "\n") {
        i += 1;
      }
      pushRow();
    } else if (char === "\n") {
      pushRow();
    } else {
      value += char;
    }
  }
  // Flush a trailing row that had no line terminator.
  if (value.length > 0 || row.length > 0) {
    pushRow();
  }
  return rows;
}

/** True when a cell still carries a spreadsheet formula trigger. */
export function looksLikeFormula(value: string): boolean {
  const stripped = value.replace(/^[\t\r\n ]+/, "");
  if (stripped.length === 0) {
    return false;
  }
  // A leading single quote is the neutralized, safe form; treat it as text.
  if (stripped.charAt(0) === "'") {
    return false;
  }
  return (FORMULA_PREFIXES as readonly string[]).includes(stripped.charAt(0));
}

/** Removes the neutralizing leading single quote the export may have added. */
function denorm(value: string): string {
  const trimmed = value.replace(/\r/g, "").trim();
  return trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;
}

export interface ParsedResultCsv {
  ok: boolean;
  message: string;
  rows: RawResultRow[];
}

/**
 * Parses a results CSV into typed raw rows. Rejects a file whose header does
 * not match the expected columns so a mis-mapped export cannot be applied.
 */
export function parseResultCsv(text: string): ParsedResultCsv {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { ok: false, message: "The results file is empty.", rows: [] };
  }
  const header = grid[0].map((cell) => denorm(cell).toLowerCase());
  if (header.length !== RESULT_CSV_COLUMNS.length) {
    return {
      ok: false,
      message: "The results file header does not match the expected columns.",
      rows: [],
    };
  }
  for (let c = 0; c < RESULT_CSV_COLUMNS.length; c += 1) {
    if (header[c] !== RESULT_CSV_COLUMNS[c]) {
      return {
        ok: false,
        message: `Unexpected column "${header[c]}" at position ${c + 1}.`,
        rows: [],
      };
    }
  }
  const rows: RawResultRow[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r];
    if (cells.length === 1 && cells[0].trim().length === 0) {
      continue; // Skip a blank trailing line.
    }
    const get = (index: number): string => cells[index] ?? "";
    rows.push({
      deliveryBatchCode: get(0),
      deliveryReference: get(1),
      rowSignature: get(2),
      attemptReference: get(3),
      attemptNumber: get(4),
      intendedRecipientEmail: get(5),
      actualRecipientEmail: get(6),
      deliveryMode: get(7),
      outcome: get(8),
      attemptedAt: get(9),
      sentBy: get(10),
      pdfFileName: get(11),
      pdfSha256: get(12),
      errorCode: get(13),
      errorMessage: get(14),
      bounceDetectedAt: get(15),
      exportedAt: get(16),
    });
  }
  return { ok: true, message: "", rows };
}

/**
 * A known, prepared delivery keyed by delivery_reference. The signature
 * payload lets each row be re-verified without trusting the CSV.
 */
export interface KnownDelivery {
  deliveryReference: string;
  deliveryBatchCode: string;
  eventCode: string;
  mode: DeliveryMode;
  intendedRecipientEmail: string;
  pdfSha256: string;
  signaturePayload: DeliverySignaturePayload;
}

export interface ResultValidationContext {
  /** Prepared deliveries, keyed by delivery_reference. */
  knownDeliveries: Map<string, KnownDelivery>;
  /** Attempt references already recorded, so replays are idempotent. */
  existingAttemptReferences: Set<string>;
  /** The batch code the import targets; a foreign batch row is rejected. */
  expectedBatchCode: string;
  /** The event code the import targets; a foreign event row is rejected. */
  expectedEventCode: string;
  /** Distribution secret, to re-verify row signatures. */
  distributionSecret: string;
}

function isIsoTimestamp(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed);
}

function rowIsFormulaTainted(raw: RawResultRow): boolean {
  return Object.values(raw).some((value) => looksLikeFormula(value));
}

/**
 * Evaluates a single raw row. `seenAttempts` accumulates attempt references
 * within this file so a duplicate within one upload is caught too.
 */
export function evaluateResultRow(
  raw: RawResultRow,
  rowNumber: number,
  context: ResultValidationContext,
  seenAttempts: Set<string>
): EvaluatedResultRow {
  const reject = (
    reasonCode: ResultRejectionReason,
    message: string
  ): EvaluatedResultRow => ({
    rowNumber,
    disposition: "rejected",
    outcome: null,
    deliveryReference: denorm(raw.deliveryReference),
    attemptReference: denorm(raw.attemptReference),
    intendedRecipientEmail: denorm(raw.intendedRecipientEmail),
    actualRecipientEmail: denorm(raw.actualRecipientEmail),
    mode: null,
    reasonCode,
    message,
  });

  if (rowIsFormulaTainted(raw)) {
    return reject(
      "formula_injection",
      "A cell begins with a spreadsheet formula character."
    );
  }

  const deliveryReference = denorm(raw.deliveryReference);
  const attemptReference = denorm(raw.attemptReference);
  const outcomeRaw = denorm(raw.outcome).toLowerCase();
  const modeRaw = denorm(raw.deliveryMode).toLowerCase();

  if (deliveryReference.length === 0 || attemptReference.length === 0) {
    return reject("malformed_row", "Delivery or attempt reference is missing.");
  }
  if (!(RESULT_OUTCOMES as readonly string[]).includes(outcomeRaw)) {
    return reject("unsupported_outcome", `Unsupported outcome "${outcomeRaw}".`);
  }
  const outcome = outcomeRaw as ResultOutcome;

  if (modeRaw !== "test" && modeRaw !== "production") {
    return reject("malformed_row", `Unsupported delivery mode "${modeRaw}".`);
  }
  const mode = modeRaw as DeliveryMode;

  const known = context.knownDeliveries.get(deliveryReference);
  if (known === undefined) {
    return reject(
      "unknown_delivery_reference",
      "No prepared delivery matches this reference."
    );
  }

  if (denorm(raw.deliveryBatchCode) !== context.expectedBatchCode) {
    return reject(
      "mismatched_batch",
      "The row belongs to a different delivery batch."
    );
  }
  if (known.eventCode !== context.expectedEventCode) {
    return reject("wrong_event", "The row belongs to a different event.");
  }

  // Re-verify the row signature against the app's own prepared payload, so a
  // recipient, checksum or mode edited in the Sheet is caught.
  const signature = verifyDeliveryRow(
    known.signaturePayload,
    denorm(raw.rowSignature),
    context.distributionSecret
  );
  if (!signature.valid) {
    return reject(
      "invalid_row_signature",
      "The row signature does not match the prepared delivery."
    );
  }

  if (denorm(raw.pdfSha256).toLowerCase() !== known.pdfSha256.toLowerCase()) {
    return reject(
      "mismatched_pdf_checksum",
      "The PDF checksum does not match the prepared document."
    );
  }

  if (
    denorm(raw.intendedRecipientEmail).toLowerCase() !==
    known.intendedRecipientEmail.toLowerCase()
  ) {
    return reject(
      "mismatched_intended_recipient",
      "The intended recipient does not match the prepared delivery."
    );
  }

  // The actual recipient must be present and usable for every outcome that
  // records a send. For a test send it is the internal test recipient.
  const actualRecipient = denorm(raw.actualRecipientEmail);
  if (
    (outcome === "sent" || outcome === "test_sent") &&
    !isValidEmail(actualRecipient)
  ) {
    return reject(
      "missing_actual_recipient",
      "The actual recipient email is missing or invalid."
    );
  }

  if (!isIsoTimestamp(raw.attemptedAt)) {
    return reject("malformed_timestamp", "The attempted-at timestamp is invalid.");
  }
  if (
    denorm(raw.bounceDetectedAt).length > 0 &&
    !isIsoTimestamp(raw.bounceDetectedAt)
  ) {
    return reject("malformed_timestamp", "The bounce timestamp is invalid.");
  }

  // Idempotent replay: a repeated attempt reference is a duplicate, never a
  // new attempt. Duplicates within one file are caught by seenAttempts.
  if (
    context.existingAttemptReferences.has(attemptReference) ||
    seenAttempts.has(attemptReference)
  ) {
    return {
      rowNumber,
      disposition: "duplicate",
      outcome,
      deliveryReference,
      attemptReference,
      intendedRecipientEmail: known.intendedRecipientEmail,
      actualRecipientEmail: actualRecipient,
      mode,
      reasonCode: "duplicate_attempt_reference",
      message: "This attempt was already recorded.",
    };
  }
  seenAttempts.add(attemptReference);

  // A test_sent outcome against a production delivery is a warning, never an
  // accepted production send: it is recorded as a test attempt only.
  const disposition =
    outcome === "test_sent" && mode === "production" ? "warning" : "accepted";

  return {
    rowNumber,
    disposition,
    outcome,
    deliveryReference,
    attemptReference,
    intendedRecipientEmail: known.intendedRecipientEmail,
    actualRecipientEmail: actualRecipient,
    mode,
    reasonCode: null,
    message:
      disposition === "warning"
        ? "Recorded as a test attempt; the production delivery is not marked sent."
        : "",
  };
}

export interface EvaluatedResultSet {
  rows: EvaluatedResultRow[];
  summary: ResultImportSummary;
}

/** Evaluates every raw row and tallies dispositions. */
export function evaluateResultRows(
  raws: readonly RawResultRow[],
  context: ResultValidationContext
): EvaluatedResultSet {
  const seenAttempts = new Set<string>();
  const rows = raws.map((raw, index) =>
    evaluateResultRow(raw, index + 2, context, seenAttempts)
  );
  const summary: ResultImportSummary = {
    totalRows: rows.length,
    acceptedRows: rows.filter((row) => row.disposition === "accepted").length,
    duplicateRows: rows.filter((row) => row.disposition === "duplicate").length,
    warningRows: rows.filter((row) => row.disposition === "warning").length,
    rejectedRows: rows.filter((row) => row.disposition === "rejected").length,
  };
  return { rows, summary };
}
