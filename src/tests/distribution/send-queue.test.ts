import { describe, expect, it } from "vitest";

import {
  SEND_QUEUE_COLUMNS,
  buildSendQueueCsv,
  joinAdultGuestNames,
} from "@/features/distribution/send-queue";
import type { DeliveryParty, PreparedDeliveryRow } from "@/features/distribution/types";

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

function row(overrides: Partial<PreparedDeliveryRow> = {}): PreparedDeliveryRow {
  return {
    deliveryReference: "DR-0001",
    rowSignature: "sig",
    registrationId: "r1",
    ticketId: "t1",
    documentId: "d1",
    eventCode: "CONVOCATION-2026",
    eventTitle: "Convocation Ceremony 2026",
    deliveryBatchCode: "DLV-2026-AA11BB",
    deliveryMode: "test",
    deliveryPurpose: "initial",
    graduateName: "Sample Graduate",
    intendedRecipientEmail: "grad@example.com",
    ticketCode: "TAE-0001",
    documentVersion: 1,
    pdfFileName: "TAE-Convocation-2026-0001-V1.pdf",
    pdfSha256: "a".repeat(64),
    party: party(),
    documentGeneratedAt: "2026-07-20T12:00:00.000Z",
    deliveryPreparedAt: "2026-07-21T12:00:00.000Z",
    ...overrides,
  };
}

describe("send-queue CSV", () => {
  it("emits the documented columns in order", () => {
    const csv = buildSendQueueCsv([]);
    expect(csv.split("\r\n")[0]).toBe(
      SEND_QUEUE_COLUMNS.map((c) => `"${c}"`).join(",")
    );
  });

  it("neutralizes formula injection in graduate names", () => {
    const csv = buildSendQueueCsv([
      row({ graduateName: "=SUM(A1:A9)" }),
    ]);
    expect(csv).toContain('"\'=SUM(A1:A9)"');
    expect(csv).not.toContain('"=SUM(A1:A9)"');
  });

  it("neutralizes leading +, - and @ characters", () => {
    const csv = buildSendQueueCsv([
      row({ graduateName: "+1", ticketCode: "-2", eventTitle: "@x" }),
    ]);
    expect(csv).toContain('"\'+1"');
    expect(csv).toContain('"\'-2"');
    expect(csv).toContain('"\'@x"');
  });

  it("quotes commas, quotes and newlines safely", () => {
    const csv = buildSendQueueCsv([
      row({ graduateName: 'Doe, "Jane"\nsmith' }),
    ]);
    expect(csv).toContain('"Doe, ""Jane""\nsmith"');
  });

  it("uses CRLF line endings", () => {
    const csv = buildSendQueueCsv([row()]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n").length).toBeGreaterThanOrEqual(3);
  });

  it("never truncates a large adult guest list", () => {
    const names = ["A One", "B Two", "C Three", "D Four", "E Five"];
    const csv = buildSendQueueCsv([
      row({
        party: party({
          adultGuestNames: names,
          adultGuestCount: 5,
          totalPartyCount: 6,
        }),
      }),
    ]);
    for (const name of names) {
      expect(csv).toContain(name);
    }
    expect(csv).toContain("A One; B Two; C Three; D Four; E Five");
  });

  it("joins adult guest names with a stable separator", () => {
    expect(joinAdultGuestNames(["A", "B", "C"])).toBe("A; B; C");
  });

  it("excludes any token, secret or storage URL column", () => {
    const header = SEND_QUEUE_COLUMNS as readonly string[];
    for (const forbidden of [
      "raw_token",
      "qr_token",
      "token_hash",
      "signing_secret",
      "storage_url",
      "supabase_key",
      "staff_user_id",
    ]) {
      expect(header).not.toContain(forbidden);
    }
  });
});
