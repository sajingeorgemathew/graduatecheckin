import { describe, expect, it } from "vitest";

import {
  RESULT_CSV_COLUMNS,
  evaluateResultRows,
  looksLikeFormula,
  parseCsv,
  parseResultCsv,
  type KnownDelivery,
  type ResultValidationContext,
} from "@/features/distribution/results";
import { signDeliveryRow } from "@/features/distribution/signing";
import type { RawResultRow } from "@/features/distribution/types";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const BATCH = "DLV-2026-AB12CD";
const EVENT = "CONVOCATION-2026";

function knownDelivery(reference: string): KnownDelivery {
  return {
    deliveryReference: reference,
    deliveryBatchCode: BATCH,
    eventCode: EVENT,
    mode: "production",
    intendedRecipientEmail: "grad@example.com",
    pdfSha256: "a".repeat(64),
    signaturePayload: {
      deliveryReference: reference,
      deliveryBatchCode: BATCH,
      eventCode: EVENT,
      deliveryMode: "production",
      deliveryPurpose: "initial",
      intendedRecipientEmail: "grad@example.com",
      ticketCode: "TAE-0001",
      documentVersion: 1,
      pdfFileName: "file.pdf",
      pdfSha256: "a".repeat(64),
      totalPartyCount: 3,
    },
  };
}

function context(
  overrides: Partial<ResultValidationContext> = {}
): ResultValidationContext {
  const known = knownDelivery("DR-0001");
  return {
    knownDeliveries: new Map([[known.deliveryReference, known]]),
    existingAttemptReferences: new Set<string>(),
    expectedBatchCode: BATCH,
    expectedEventCode: EVENT,
    distributionSecret: SECRET,
    ...overrides,
  };
}

function rawRow(overrides: Partial<RawResultRow> = {}): RawResultRow {
  const signature = signDeliveryRow(
    knownDelivery("DR-0001").signaturePayload,
    SECRET
  );
  return {
    deliveryBatchCode: BATCH,
    deliveryReference: "DR-0001",
    rowSignature: signature,
    attemptReference: "AT-0001",
    attemptNumber: "1",
    intendedRecipientEmail: "grad@example.com",
    actualRecipientEmail: "grad@example.com",
    deliveryMode: "production",
    outcome: "sent",
    attemptedAt: "2026-07-21T12:00:00.000Z",
    sentBy: "office@torontoacademy.ca",
    pdfFileName: "file.pdf",
    pdfSha256: "a".repeat(64),
    errorCode: "",
    errorMessage: "",
    bounceDetectedAt: "",
    exportedAt: "2026-07-21T12:05:00.000Z",
    ...overrides,
  };
}

describe("CSV parsing", () => {
  it("parses quoted fields, escaped quotes and CRLF", () => {
    const grid = parseCsv('a,"b,c","d""e"\r\n1,2,3\r\n');
    expect(grid[0]).toEqual(["a", "b,c", 'd"e']);
    expect(grid[1]).toEqual(["1", "2", "3"]);
  });

  it("rejects a header that does not match the expected columns", () => {
    const parsed = parseResultCsv("wrong,header\n1,2\n");
    expect(parsed.ok).toBe(false);
  });

  it("accepts the documented header", () => {
    const parsed = parseResultCsv(RESULT_CSV_COLUMNS.join(",") + "\r\n");
    expect(parsed.ok).toBe(true);
    expect(parsed.rows).toHaveLength(0);
  });

  it("detects formula-injection cells", () => {
    expect(looksLikeFormula("=1+1")).toBe(true);
    expect(looksLikeFormula("+1")).toBe(true);
    expect(looksLikeFormula("'=1+1")).toBe(false);
    expect(looksLikeFormula("normal")).toBe(false);
  });
});

describe("result row evaluation", () => {
  it("accepts a valid sent row", () => {
    const { rows, summary } = evaluateResultRows([rawRow()], context());
    expect(rows[0].disposition).toBe("accepted");
    expect(summary.acceptedRows).toBe(1);
  });

  it("accepts a failed row", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ outcome: "failed", actualRecipientEmail: "" })],
      context()
    );
    expect(rows[0].disposition).toBe("accepted");
    expect(rows[0].outcome).toBe("failed");
  });

  it("accepts a bounce row", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ outcome: "bounce_detected", bounceDetectedAt: "2026-07-21T13:00:00.000Z" })],
      context()
    );
    expect(rows[0].disposition).toBe("accepted");
  });

  it("rejects an unknown delivery reference", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ deliveryReference: "DR-9999" })],
      context()
    );
    expect(rows[0].reasonCode).toBe("unknown_delivery_reference");
  });

  it("rejects an invalid row signature", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ rowSignature: "A".repeat(43) })],
      context()
    );
    expect(rows[0].reasonCode).toBe("invalid_row_signature");
  });

  it("rejects a mismatched PDF checksum", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ pdfSha256: "b".repeat(64) })],
      context()
    );
    expect(rows[0].reasonCode).toBe("mismatched_pdf_checksum");
  });

  it("rejects a mismatched intended recipient", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ intendedRecipientEmail: "someone-else@example.com" })],
      context()
    );
    expect(rows[0].reasonCode).toBe("mismatched_intended_recipient");
  });

  it("rejects a row from another batch", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ deliveryBatchCode: "DLV-2026-OTHER1" })],
      context()
    );
    expect(rows[0].reasonCode).toBe("mismatched_batch");
  });

  it("rejects a row for another event", () => {
    const { rows } = evaluateResultRows(
      [rawRow()],
      context({ expectedEventCode: "SOME-OTHER-EVENT" })
    );
    expect(rows[0].reasonCode).toBe("wrong_event");
  });

  it("rejects a malformed timestamp", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ attemptedAt: "not-a-time" })],
      context()
    );
    expect(rows[0].reasonCode).toBe("malformed_timestamp");
  });

  it("rejects an unsupported outcome", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ outcome: "exploded" })],
      context()
    );
    expect(rows[0].reasonCode).toBe("unsupported_outcome");
  });

  it("rejects a formula-injected cell", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ errorMessage: "=cmd()" })],
      context()
    );
    expect(rows[0].reasonCode).toBe("formula_injection");
  });

  it("marks a duplicate attempt reference already in the database", () => {
    const { rows } = evaluateResultRows(
      [rawRow()],
      context({ existingAttemptReferences: new Set(["AT-0001"]) })
    );
    expect(rows[0].disposition).toBe("duplicate");
  });

  it("marks a duplicate attempt reference within the same file", () => {
    const { rows, summary } = evaluateResultRows(
      [rawRow(), rawRow()],
      context()
    );
    expect(rows[0].disposition).toBe("accepted");
    expect(rows[1].disposition).toBe("duplicate");
    expect(summary.duplicateRows).toBe(1);
  });

  it("records a test_sent against a production delivery as a warning", () => {
    const { rows } = evaluateResultRows(
      [rawRow({ outcome: "test_sent", actualRecipientEmail: "tester@example.com" })],
      context()
    );
    expect(rows[0].disposition).toBe("warning");
  });
});
