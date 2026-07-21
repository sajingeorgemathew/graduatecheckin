/**
 * File naming and storage-path privacy. All fixtures are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildTicketDocumentFileName,
  buildTicketDocumentStoragePath,
  EXPORT_BATCH_DEFAULT_SIZE,
  EXPORT_BATCH_MAX_SIZE,
  GENERATION_CHUNK_SIZE,
  TICKET_DOCUMENT_BUCKET,
} from "@/features/ticket-documents/constants";
import { buildBatchCode } from "@/features/ticket-documents/batches";

import { TEST_EVENT_ID, TEST_TICKET_CODE, TEST_TICKET_ID } from "./fixtures";

const GRADUATE_NAME = "Avery Testerton";
const EMAIL = "avery.testerton@example.invalid";
const PHONE = "416-555-0134";

describe("pdf file name", () => {
  it("uses the required TAE convocation pattern", () => {
    expect(buildTicketDocumentFileName(TEST_TICKET_CODE, 1)).toBe(
      "TAE-Convocation-2026-TAE-9F4K-2QX7-V1.pdf"
    );
  });

  it("carries the document version", () => {
    expect(buildTicketDocumentFileName(TEST_TICKET_CODE, 12)).toContain("-V12.pdf");
  });

  it("never contains a graduate name, email or phone number", () => {
    const fileName = buildTicketDocumentFileName(TEST_TICKET_CODE, 3);
    expect(fileName).not.toContain(GRADUATE_NAME);
    expect(fileName).not.toContain("Avery");
    expect(fileName).not.toContain(EMAIL);
    expect(fileName).not.toContain("@");
    expect(fileName).not.toContain(PHONE);
  });

  it("strips characters that are unsafe in a file name", () => {
    const fileName = buildTicketDocumentFileName("tae/../9f4k 2qx7", 1);
    expect(fileName).not.toContain("/");
    expect(fileName).not.toContain("..");
    expect(fileName).not.toContain(" ");
  });
});

describe("storage path", () => {
  const path = buildTicketDocumentStoragePath(
    TEST_EVENT_ID,
    TEST_TICKET_ID,
    "cccccccc-dddd-4eee-8fff-000000000000"
  );

  it("is built from identifiers only", () => {
    expect(path).toBe(
      `events/${TEST_EVENT_ID}/tickets/${TEST_TICKET_ID}/documents/` +
        "cccccccc-dddd-4eee-8fff-000000000000.pdf"
    );
  });

  it("never contains a graduate name, email or phone number", () => {
    expect(path).not.toContain(GRADUATE_NAME);
    expect(path).not.toContain("Avery");
    expect(path).not.toContain(EMAIL);
    expect(path).not.toContain("@");
    expect(path).not.toContain(PHONE);
    expect(path).not.toContain(TEST_TICKET_CODE);
  });

  it("is unique per document, so a prior PDF is never overwritten", () => {
    const other = buildTicketDocumentStoragePath(
      TEST_EVENT_ID,
      TEST_TICKET_ID,
      "11111111-2222-4333-8444-555555555555"
    );
    expect(other).not.toBe(path);
  });
});

describe("batch code", () => {
  const code = buildBatchCode(new Date("2026-07-20T12:34:56.000Z"), 3);

  it("matches the database check constraint pattern", () => {
    expect(code).toMatch(/^[A-Z0-9-]{6,40}$/);
  });

  it("carries no personal data", () => {
    expect(code).not.toContain("@");
    expect(code).not.toContain("Avery");
  });
});

describe("export and generation limits", () => {
  it("defaults to 25 registrations per batch and caps at 50", () => {
    expect(EXPORT_BATCH_DEFAULT_SIZE).toBe(25);
    expect(EXPORT_BATCH_MAX_SIZE).toBe(50);
  });

  it("uses a bounded generation chunk between 10 and 25", () => {
    expect(GENERATION_CHUNK_SIZE).toBeGreaterThanOrEqual(10);
    expect(GENERATION_CHUNK_SIZE).toBeLessThanOrEqual(25);
  });

  it("uses the private bucket name", () => {
    expect(TICKET_DOCUMENT_BUCKET).toBe("graduation-ticket-documents");
  });
});
