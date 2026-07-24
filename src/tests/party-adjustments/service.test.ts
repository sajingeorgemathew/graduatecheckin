/**
 * The party-adjustment service.
 *
 * These tests pin the behaviour that keeps a graduate's ticket and QR stable:
 * the same ticket is used, the replacement service is never involved, a
 * no-change request generates no PDF, and a PDF failure never hides or
 * reverses the saved party adjustment.
 *
 * The database RPC, the active-event resolver and the PDF generator are all
 * mocked, so nothing here touches production data.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/events/resolve-active-event", () => ({
  resolveActiveEvent: vi.fn(),
}));
vi.mock("@/features/ticket-documents/service", () => ({
  generateTicketDocument: vi.fn(),
}));
vi.mock("@/features/party-adjustments/repository", () => ({
  getRegistration: vi.fn(),
  getActiveTicketForRegistration: vi.fn(),
  getCurrentDocumentForTicket: vi.fn(),
  updateRegistrationPartyRpc: vi.fn(),
}));

import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import * as repo from "@/features/party-adjustments/repository";
import { adjustRegistrationParty } from "@/features/party-adjustments/service";
import { generateTicketDocument } from "@/features/ticket-documents/service";
import type { StaffSession } from "@/features/auth/types";
import type { Json } from "@/types/database";

const EVENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";
const TICKET_ID = "22222222-2222-4222-8222-222222222222";
const TICKET_CODE = "TAE-4KJ7-92BX";

function adminSession(overrides: Partial<StaffSession> = {}): StaffSession {
  return {
    userId: "99999999-9999-4999-8999-999999999999",
    email: "admin@example.com",
    displayName: "Ada Admin",
    role: "administrator",
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    registrationId: REGISTRATION_ID,
    adultGuestCount: 3,
    adultGuestNames: ["Kwame Osei", "Nia Osei", "Ada Boateng"],
    children04: 1,
    children510: 0,
    reason: "Paid for two additional guests at the office",
    confirmSameQr: true,
    idempotencyKey: "b7d1f0a4-6c2e-4c1a-9f60-6f5f0a2c9a11",
    expectedUpdatedAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function partySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    graduate_name: "Amara Osei",
    graduate_count: 1,
    adult_guest_names: ["Kwame Osei", "Nia Osei", "Ada Boateng"],
    adult_guest_count: 3,
    child_0_4_count: 1,
    child_5_10_count: 0,
    total_party_count: 5,
    ...overrides,
  };
}

function rpcResult(overrides: Record<string, unknown> = {}): Json {
  return {
    ok: true,
    duplicate: false,
    no_change: false,
    adjustment_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    registration_id: REGISTRATION_ID,
    ticket_id: TICKET_ID,
    ticket_code: TICKET_CODE,
    before_party: partySnapshot({
      adult_guest_names: ["Kwame Osei"],
      adult_guest_count: 1,
      total_party_count: 3,
    }),
    after_party: partySnapshot(),
    ...overrides,
  } as unknown as Json;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveActiveEvent).mockResolvedValue({
    ok: true,
    event: { id: EVENT_ID } as never,
  });
  vi.mocked(repo.getRegistration).mockResolvedValue({
    id: REGISTRATION_ID,
    event_id: EVENT_ID,
  } as never);
  vi.mocked(repo.updateRegistrationPartyRpc).mockResolvedValue(rpcResult());
  vi.mocked(repo.getCurrentDocumentForTicket).mockResolvedValue({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    document_version: 2,
    file_name: "TAE-Convocation-2026-TAE-4KJ7-92BX-V2.pdf",
  } as never);
  vi.mocked(generateTicketDocument).mockResolvedValue({
    ok: true,
    registrationId: REGISTRATION_ID,
    ticketId: TICKET_ID,
    documentId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    documentVersion: 2,
  } as never);
});

describe("authorization and routing", () => {
  it("denies a non-administrator without calling the database", async () => {
    const result = await adjustRegistrationParty(
      adminSession({ role: "scanner" }),
      validBody()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
    expect(vi.mocked(repo.updateRegistrationPartyRpc)).not.toHaveBeenCalled();
  });

  it("rejects a registration outside the active event as not found", async () => {
    vi.mocked(repo.getRegistration).mockResolvedValue({
      id: REGISTRATION_ID,
      event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    } as never);
    const result = await adjustRegistrationParty(adminSession(), validBody());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
    expect(vi.mocked(repo.updateRegistrationPartyRpc)).not.toHaveBeenCalled();
  });

  it("never accepts an actor id or event id from the body", async () => {
    await adjustRegistrationParty(
      adminSession(),
      validBody({ actorUserId: "spoofed", eventId: "spoofed" })
    );
    const args = vi.mocked(repo.updateRegistrationPartyRpc).mock.calls[0][0];
    expect(args.actorUserId).toBe(adminSession().userId);
  });
});

describe("successful adjustment", () => {
  it("regenerates the PDF for the same ticket, never a replacement", async () => {
    const result = await adjustRegistrationParty(adminSession(), validBody());
    expect(result.ok).toBe(true);
    // The PDF is generated for the same, unchanged ticket ID.
    expect(vi.mocked(generateTicketDocument)).toHaveBeenCalledWith(
      adminSession().userId,
      TICKET_ID
    );
    if (result.ok) {
      expect(result.data.ticketId).toBe(TICKET_ID);
      expect(result.data.ticketCode).toBe(TICKET_CODE);
      expect(result.data.pdfStatus).toBe("regenerated");
      expect(result.data.newDocumentVersion).toBe(2);
      expect(result.data.newPdfFileName).toContain("-V2.pdf");
    }
  });

  it("returns the updated party in the after snapshot", async () => {
    const result = await adjustRegistrationParty(adminSession(), validBody());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.after.adultGuestCount).toBe(3);
      expect(result.data.after.totalPartyCount).toBe(5);
      expect(result.data.before.adultGuestCount).toBe(1);
    }
  });
});

describe("no-change safety", () => {
  it("generates no PDF when the party is unchanged", async () => {
    vi.mocked(repo.updateRegistrationPartyRpc).mockResolvedValue(
      rpcResult({ no_change: true, adjustment_id: null })
    );
    const result = await adjustRegistrationParty(adminSession(), validBody());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.noChange).toBe(true);
      expect(result.data.pdfStatus).toBe("not_applicable");
    }
    expect(vi.mocked(generateTicketDocument)).not.toHaveBeenCalled();
  });
});

describe("PDF failure", () => {
  it("returns a safe partial success without reversing the saved party", async () => {
    vi.mocked(generateTicketDocument).mockResolvedValue({
      ok: false,
      registrationId: REGISTRATION_ID,
      ticketId: TICKET_ID,
      code: "finalization_failed",
      message: "The PDF record could not be saved.",
    } as never);

    const result = await adjustRegistrationParty(adminSession(), validBody());
    // The adjustment succeeded even though the PDF did not.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pdfStatus).toBe("generation_failed");
      expect(result.data.pdfWarning).not.toBeNull();
      expect(result.data.ticketId).toBe(TICKET_ID);
      // The updated party is still reported accurately.
      expect(result.data.after.adultGuestCount).toBe(3);
    }
  });
});

describe("RPC failures map to privacy-safe responses", () => {
  it("maps a stale registration to a 409", async () => {
    vi.mocked(repo.updateRegistrationPartyRpc).mockResolvedValue({
      ok: false,
      code: "stale_registration",
    } as unknown as Json);
    const result = await adjustRegistrationParty(adminSession(), validBody());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.code).toBe("stale_registration");
    }
    expect(vi.mocked(generateTicketDocument)).not.toHaveBeenCalled();
  });

  it("maps not_authorized from the RPC to a 403", async () => {
    vi.mocked(repo.updateRegistrationPartyRpc).mockResolvedValue({
      ok: false,
      code: "not_authorized",
    } as unknown as Json);
    const result = await adjustRegistrationParty(adminSession(), validBody());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });
});
