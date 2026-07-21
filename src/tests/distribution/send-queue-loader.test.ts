/**
 * Regression coverage for the Apps Script send-queue loader.
 *
 * The Google Sheet loader failed with "Loaded 0 queue rows." because the old
 * single-line ui.prompt collapsed the pasted multi-line CSV into one physical
 * line, so the CSV parser saw only the header. These tests load the real
 * Validation.gs source into a Node VM and drive its pure parser
 * (parseSendQueue_) with the exact CSV shape the application exports via
 * buildSendQueueCsv — proving the shipped parser accepts it without edits.
 *
 * The parser is pure and touches no Sheet and no MailApp, so loading can never
 * send email; a static check below asserts the loader source references no
 * mail API at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { buildSendQueueCsv } from "@/features/distribution/send-queue";
import type {
  DeliveryParty,
  PreparedDeliveryRow,
} from "@/features/distribution/types";

const scriptDir = fileURLToPath(
  new URL("../../../google-apps-script/graduation-ticket-sender", import.meta.url)
);

const validationSource = readFileSync(join(scriptDir, "Validation.gs"), "utf8");

interface ParsedRow {
  values: string[];
  appStatus: string;
  status: string;
  attemptCount: number;
  sourceLine: number;
}

interface ParseResult {
  ok: boolean;
  error: string;
  header: string[];
  rows: ParsedRow[];
  loaded: number;
  skipped: number;
  rejected: number;
  rejections: string[];
}

/** Loads the pure parser functions from the .gs source into an isolated VM. */
function loadParser(): {
  parseSendQueue_: (text: string) => ParseResult;
  parseDelimitedText_: (text: string) => string[][];
} {
  const sandbox: Record<string, unknown> = {};
  const context = createContext(sandbox);
  runInContext(validationSource, context);
  return sandbox as unknown as {
    parseSendQueue_: (text: string) => ParseResult;
    parseDelimitedText_: (text: string) => string[][];
  };
}

function party(overrides: Partial<DeliveryParty> = {}): DeliveryParty {
  return {
    graduateName: "Sample Graduate",
    graduateCount: 1,
    adultGuestNames: [],
    adultGuestCount: 0,
    children04Count: 0,
    children510Count: 0,
    totalPartyCount: 1,
    ...overrides,
  };
}

function row(index: number, overrides: Partial<PreparedDeliveryRow> = {}): PreparedDeliveryRow {
  const n = String(index).padStart(4, "0");
  return {
    deliveryReference: `DR-${n}`,
    rowSignature: `signature-value-not-real-${n}-${"x".repeat(24)}`,
    registrationId: `r${index}`,
    ticketId: `t${index}`,
    documentId: `d${index}`,
    eventCode: "GRAD-2026-DEV",
    eventTitle: "Graduation Ceremony 2026",
    deliveryBatchCode: "DLV-2026-I6JJ5A",
    deliveryMode: "test",
    deliveryPurpose: "initial",
    graduateName: `Sample Graduate ${index}`,
    intendedRecipientEmail: `grad.${index}@example.com`,
    ticketCode: `TAE-DEV-${n}`,
    documentVersion: 1,
    pdfFileName: `TAE-Grad-2026-${n}-V1.pdf`,
    pdfSha256: String(index).repeat(64).slice(0, 64),
    party: party(),
    documentGeneratedAt: "2026-07-20T12:00:00.000Z",
    deliveryPreparedAt: "2026-07-21T12:00:00.000Z",
    ...overrides,
  };
}

/** The three-row prepared batch described by the ticket. */
function threePreparedRows(): PreparedDeliveryRow[] {
  return [
    // One optional field (document_generated_at) is blank, as exported.
    row(1, { documentGeneratedAt: "" }),
    row(2, {
      party: party({
        adultGuestNames: ["Doe, Jane", "Smith; John"],
        adultGuestCount: 2,
        totalPartyCount: 3,
      }),
    }),
    row(3),
  ];
}

describe("Apps Script send-queue loader", () => {
  it("exposes the pure parser without executing any Sheet or Mail API", () => {
    const { parseSendQueue_, parseDelimitedText_ } = loadParser();
    expect(typeof parseSendQueue_).toBe("function");
    expect(typeof parseDelimitedText_).toBe("function");
  });

  it("loads all three prepared rows from the exact application export", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv(threePreparedRows());
    const result = parseSendQueue_(csv);

    expect(result.ok).toBe(true);
    expect(result.error).toBe("");
    expect(result.loaded).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toBe(0);
  });

  it("maps app status prepared to the operational Sheet status READY", () => {
    const { parseSendQueue_ } = loadParser();
    const result = parseSendQueue_(buildSendQueueCsv(threePreparedRows()));
    for (const parsed of result.rows) {
      expect(parsed.appStatus).toBe("prepared");
      expect(parsed.status).toBe("READY");
      expect(parsed.attemptCount).toBe(0);
    }
  });

  it("accepts a blank document_generated_at", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv([row(1, { documentGeneratedAt: "" })]);
    const result = parseSendQueue_(csv);
    expect(result.ok).toBe(true);
    expect(result.loaded).toBe(1);
    // Column 20 (0-indexed 19) is document_generated_at and stays blank.
    expect(result.rows[0].values[19]).toBe("");
  });

  it("parses CRLF line endings (the native export)", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv(threePreparedRows());
    expect(csv).toContain("\r\n");
    expect(parseSendQueue_(csv).loaded).toBe(3);
  });

  it("parses LF line endings", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv(threePreparedRows()).replace(/\r\n/g, "\n");
    expect(csv).not.toContain("\r");
    expect(parseSendQueue_(csv).loaded).toBe(3);
  });

  it("tolerates a missing trailing newline", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv(threePreparedRows()).replace(/\r\n$/, "");
    expect(parseSendQueue_(csv).loaded).toBe(3);
  });

  it("preserves a quoted adult_guest_names field containing commas", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv([
      row(2, {
        party: party({
          adultGuestNames: ["Doe, Jane", "Smith; John"],
          adultGuestCount: 2,
          totalPartyCount: 3,
        }),
      }),
    ]);
    const result = parseSendQueue_(csv);
    expect(result.ok).toBe(true);
    // Column 16 (0-indexed 15) is adult_guest_names.
    expect(result.rows[0].values[15]).toBe("Doe, Jane; Smith; John");
  });

  it("preserves the signature, email, PDF name and checksum exactly", () => {
    const { parseSendQueue_ } = loadParser();
    const source = row(7);
    const result = parseSendQueue_(buildSendQueueCsv([source]));
    const values = result.rows[0].values;
    expect(values[0]).toBe(source.deliveryBatchCode);
    expect(values[1]).toBe(source.deliveryReference);
    expect(values[2]).toBe(source.rowSignature);
    expect(values[8]).toBe(source.intendedRecipientEmail);
    expect(values[11]).toBe(source.pdfFileName);
    expect(values[12]).toBe(source.pdfSha256);
  });

  it("reports explicit reasons when zero rows are valid", () => {
    const { parseSendQueue_ } = loadParser();
    const header = buildSendQueueCsv([]).trimEnd();
    // A data row missing its required delivery_reference (second field blank).
    const badRow =
      '"DLV-2026-I6JJ5A","","sig","GRAD-2026-DEV","T","test","initial",' +
      '"Name","grad@example.com","TAE-1","1","f.pdf",' +
      `"${"a".repeat(64)}","1","0","","0","0","1","","2026-07-21T12:00:00.000Z",` +
      '"prepared","0"';
    const result = parseSendQueue_(`${header}\r\n${badRow}\r\n`);
    expect(result.ok).toBe(false);
    expect(result.loaded).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.error).toContain("delivery_reference");
  });

  it("rejects an unknown extra header column", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv(threePreparedRows()).replace(
      '"attempt_count"',
      '"attempt_count","mystery_column"'
    );
    const result = parseSendQueue_(csv);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("mystery_column");
  });

  it("rejects a missing required header column", () => {
    const { parseSendQueue_ } = loadParser();
    // Drop the row_signature header entirely.
    const csv = buildSendQueueCsv(threePreparedRows()).replace(
      '"row_signature",',
      ""
    );
    const result = parseSendQueue_(csv);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("row_signature");
  });

  it("skips a fully blank spacer line without rejecting the batch", () => {
    const { parseSendQueue_ } = loadParser();
    const csv = buildSendQueueCsv(threePreparedRows());
    const withBlank = csv.replace("\r\n", "\r\n\r\n"); // extra blank after header
    const result = parseSendQueue_(withBlank);
    expect(result.ok).toBe(true);
    expect(result.loaded).toBe(3);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("never references a mail-sending API in the loader source", () => {
    expect(validationSource).not.toContain("MailApp");
    expect(validationSource).not.toContain("sendEmail");
    expect(validationSource).not.toContain("GmailApp");
  });
});
