/**
 * Administration page counts, filters and export eligibility.
 * All fixtures are synthetic.
 */

import { describe, expect, it } from "vitest";

import {
  buildDocumentRows,
  filterDocumentRows,
  summarizeDocumentRows,
} from "@/features/ticket-documents/summaries";
import type {
  ActiveTicketRecord,
  DocumentRegistrationRecord,
} from "@/features/ticket-documents/repository";
import type { GraduationTicketDocumentRow } from "@/types/database";

const EVENT_ID = "99999999-8888-4777-8666-555555555555";

function registration(
  id: string,
  overrides: Partial<DocumentRegistrationRecord> = {}
): DocumentRegistrationRecord {
  return {
    id,
    event_id: EVENT_ID,
    graduate_full_name: `Graduate ${id.slice(0, 4)}`,
    email: "graduate@example.invalid",
    registration_status: "eligible",
    registered_adult_guests: 1,
    registered_children_0_4: 0,
    registered_children_5_10: 0,
    expected_party_size: 2,
    is_test: false,
    ...overrides,
  };
}

function ticket(registrationId: string, id: string): ActiveTicketRecord {
  return {
    id,
    registration_id: registrationId,
    ticket_code: `TAE-${id.slice(0, 4).toUpperCase()}`,
    status: "active",
  };
}

function document(
  ticketId: string,
  overrides: Partial<GraduationTicketDocumentRow> = {}
): GraduationTicketDocumentRow {
  return {
    id: `doc-${ticketId}`,
    event_id: EVENT_ID,
    registration_id: "reg",
    ticket_id: ticketId,
    document_version: 1,
    template_version: 1,
    status: "current",
    storage_bucket: "graduation-ticket-documents",
    storage_path: `events/${EVENT_ID}/tickets/${ticketId}/documents/x.pdf`,
    file_name: "TAE-Convocation-2026-TAE-AAAA-V1.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 1000,
    sha256_checksum: "a".repeat(64),
    source_fingerprint: "f".repeat(64),
    graduate_name_snapshot: "Graduate",
    ticket_code_snapshot: "TAE-AAAA",
    registered_party_snapshot: {},
    event_snapshot: {},
    generated_by: null,
    generated_at: "2026-07-20T12:00:00.000Z",
    superseded_at: null,
    invalidated_at: null,
    invalidation_reason: null,
    created_at: "2026-07-20T12:00:00.000Z",
    updated_at: "2026-07-20T12:00:00.000Z",
    ...overrides,
  };
}

describe("document rows", () => {
  it("reports a ticket with no document as missing", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [],
      liveFingerprints: new Map([["t1", "f".repeat(64)]]),
      registrationsInBatches: new Set(),
    });
    expect(rows[0].state).toBe("missing");
    expect(rows[0].readyForExport).toBe(false);
  });

  it("reports a matching fingerprint as current and exportable", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [document("t1")],
      liveFingerprints: new Map([["t1", "f".repeat(64)]]),
      registrationsInBatches: new Set(),
    });
    expect(rows[0].state).toBe("current");
    expect(rows[0].readyForExport).toBe(true);
    expect(rows[0].documentVersion).toBe(1);
  });

  it("reports a changed fingerprint as outdated and not exportable", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [document("t1")],
      liveFingerprints: new Map([["t1", "e".repeat(64)]]),
      registrationsInBatches: new Set(),
    });
    expect(rows[0].state).toBe("outdated");
    expect(rows[0].readyForExport).toBe(false);
  });

  it("reports an invalidated document and blocks it from export", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [
        document("t1", {
          status: "invalidated",
          invalidated_at: "2026-07-20T13:00:00.000Z",
          invalidation_reason: "revoked",
        }),
      ],
      liveFingerprints: new Map([["t1", "f".repeat(64)]]),
      registrationsInBatches: new Set(),
    });
    expect(rows[0].state).toBe("invalidated");
    expect(rows[0].readyForExport).toBe(false);
  });

  it("reports a superseded-only history as superseded", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [
        document("t1", {
          status: "superseded",
          superseded_at: "2026-07-20T13:00:00.000Z",
        }),
      ],
      liveFingerprints: new Map([["t1", "f".repeat(64)]]),
      registrationsInBatches: new Set(),
    });
    expect(rows[0].state).toBe("superseded");
    expect(rows[0].readyForExport).toBe(false);
  });

  it("blocks export when the recipient email is missing", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1", { email: "  " })],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [document("t1")],
      liveFingerprints: new Map([["t1", "f".repeat(64)]]),
      registrationsInBatches: new Set(),
    });
    expect(rows[0].hasRecipientEmail).toBe(false);
    expect(rows[0].readyForExport).toBe(false);
  });

  it("blocks export when the registration is already batched", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [document("t1")],
      liveFingerprints: new Map([["t1", "f".repeat(64)]]),
      registrationsInBatches: new Set(["r1"]),
    });
    expect(rows[0].inExportBatch).toBe(true);
    expect(rows[0].readyForExport).toBe(false);
  });

  it("excludes registrations without an active ticket", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1"), registration("r2")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [],
      liveFingerprints: new Map(),
      registrationsInBatches: new Set(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].registrationId).toBe("r1");
  });

  it("never exposes a recipient email on a row", () => {
    const rows = buildDocumentRows({
      registrations: [registration("r1")],
      activeTickets: new Map([["r1", ticket("r1", "t1")]]),
      documents: [document("t1")],
      liveFingerprints: new Map([["t1", "f".repeat(64)]]),
      registrationsInBatches: new Set(),
    });
    expect(JSON.stringify(rows)).not.toContain("@");
  });
});

describe("summary counts and filters", () => {
  const rows = buildDocumentRows({
    registrations: [
      registration("r1"),
      registration("r2"),
      registration("r3", { is_test: true, email: null }),
    ],
    activeTickets: new Map([
      ["r1", ticket("r1", "t1")],
      ["r2", ticket("r2", "t2")],
      ["r3", ticket("r3", "t3")],
    ]),
    documents: [
      document("t1"),
      document("t2", { id: "doc-t2" }),
    ],
    liveFingerprints: new Map([
      ["t1", "f".repeat(64)],
      ["t2", "e".repeat(64)],
      ["t3", "f".repeat(64)],
    ]),
    registrationsInBatches: new Set(),
  });

  it("counts every state", () => {
    const summary = summarizeDocumentRows(rows);
    expect(summary.eligibleActiveTickets).toBe(3);
    expect(summary.currentPdf).toBe(1);
    expect(summary.outdatedPdf).toBe(1);
    expect(summary.missingPdf).toBe(1);
    expect(summary.readyForExport).toBe(1);
    expect(summary.missingRecipientEmail).toBe(1);
    expect(summary.testRegistrations).toBe(1);
    expect(summary.productionRegistrations).toBe(2);
  });

  it.each([
    ["missing", 1],
    ["current", 1],
    ["outdated", 1],
    ["ready_for_export", 1],
    ["missing_email", 1],
    ["test", 1],
    ["production", 2],
    ["all", 3],
  ] as const)("filters by %s", (filter, expected) => {
    expect(filterDocumentRows(rows, filter)).toHaveLength(expected);
  });
});
