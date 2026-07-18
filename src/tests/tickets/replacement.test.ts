import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { StaffSession } from "@/features/auth/types";
import {
  replaceTicket,
  type TicketReplacementDeps,
} from "@/features/tickets/replacement";
import type { Json } from "@/types/database";

const SECRET = randomBytes(48).toString("base64");

function admin(overrides: Partial<StaffSession> = {}): StaffSession {
  return {
    userId: randomUUID(),
    email: "fictional.admin@example.com",
    displayName: "Fictional Admin",
    role: "administrator",
    isActive: true,
    mustChangePassword: false,
    ...overrides,
  };
}

interface CapturedReplacement {
  actorUserId: string;
  ticketId: string;
  newTicketId: string;
  newTicketCode: string;
  newTokenHash: string;
  newTokenVersion: number;
  reason: string;
  requestId: string;
}

function makeDeps(
  captured: CapturedReplacement[],
  response?: Json
): TicketReplacementDeps {
  return {
    replaceTicket: async (
      actorUserId,
      ticketId,
      newTicketId,
      newTicketCode,
      newTokenHash,
      newTokenVersion,
      reason,
      requestId
    ) => {
      captured.push({
        actorUserId,
        ticketId,
        newTicketId,
        newTicketCode,
        newTokenHash,
        newTokenVersion,
        reason,
        requestId,
      });
      return response ?? { ok: true };
    },
    getTicketSecret: () => SECRET,
    newUuid: randomUUID,
  };
}

const VALID_INPUT = {
  reason: "Ticket reported lost by the graduate.",
  confirmationText: "REPLACE TICKET",
};

describe("ticket replacement", () => {
  it("replaces an active ticket with a brand new server-generated ticket", async () => {
    const captured: CapturedReplacement[] = [];
    const ticketId = randomUUID();
    const result = await replaceTicket(
      makeDeps(captured),
      admin(),
      ticketId,
      VALID_INPUT
    );
    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].newTicketId).not.toBe(ticketId);
    expect(captured[0].newTicketCode).toMatch(/^GR26-/);
    expect(captured[0].newTokenHash).toMatch(/^[0-9a-f]{64}$/);
    if (result.ok) {
      expect(result.data.newTicketId).toBe(captured[0].newTicketId);
      expect(result.data.previousTicketId).toBe(ticketId);
    }
  });

  it("produces a different token hash than the previous ticket would have", async () => {
    // Two replacements of the same ticket produce different new IDs and
    // therefore different token hashes.
    const captured: CapturedReplacement[] = [];
    const ticketId = randomUUID();
    await replaceTicket(makeDeps(captured), admin(), ticketId, VALID_INPUT);
    await replaceTicket(makeDeps(captured), admin(), ticketId, VALID_INPUT);
    expect(captured[0].newTokenHash).not.toBe(captured[1].newTokenHash);
  });

  it("requires a reason of at least 5 characters", async () => {
    const captured: CapturedReplacement[] = [];
    const result = await replaceTicket(
      makeDeps(captured),
      admin(),
      randomUUID(),
      { reason: "abc", confirmationText: "REPLACE TICKET" }
    );
    expect(result.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("requires the exact confirmation text", async () => {
    const captured: CapturedReplacement[] = [];
    const result = await replaceTicket(
      makeDeps(captured),
      admin(),
      randomUUID(),
      { reason: "Valid reason here.", confirmationText: "replace ticket" }
    );
    expect(result.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("denies non-administrators", async () => {
    const captured: CapturedReplacement[] = [];
    for (const session of [
      admin({ role: "scanner" }),
      admin({ role: "supervisor" }),
      admin({ isActive: false }),
    ]) {
      const result = await replaceTicket(
        makeDeps(captured),
        session,
        randomUUID(),
        VALID_INPUT
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
      }
    }
    expect(captured).toHaveLength(0);
  });

  it("rejects invalid ticket IDs", async () => {
    const captured: CapturedReplacement[] = [];
    const result = await replaceTicket(
      makeDeps(captured),
      admin(),
      "not-a-uuid",
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("blocks replacement of tickets that are not active", async () => {
    const captured: CapturedReplacement[] = [];
    const result = await replaceTicket(
      makeDeps(captured, { ok: false, code: "ticket_not_active" }),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.code).toBe("ticket_not_active");
    }
  });

  it("blocks replacement when the registration is no longer eligible", async () => {
    const result = await replaceTicket(
      makeDeps([], { ok: false, code: "registration_not_eligible" }),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error.code).toBe("registration_not_eligible");
    }
  });

  it("maps a repeated replacement to a safe 409 conflict, never a 500", async () => {
    // After a successful replacement the old ticket is no longer active,
    // so repeating the same request yields ticket_not_active.
    const result = await replaceTicket(
      makeDeps([], { ok: false, code: "ticket_not_active" }),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.message).not.toMatch(/postgres|sqlstate|23503/i);
    }
  });

  it("maps a database replacement_conflict race to a 409", async () => {
    const result = await replaceTicket(
      makeDeps([], { ok: false, code: "replacement_conflict" }),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error.error.code).toBe("replacement_conflict");
      expect(result.error.error.message).not.toMatch(/constraint|violat/i);
    }
  });

  it("maps invalid_replacement to a 422 validation failure", async () => {
    const result = await replaceTicket(
      makeDeps([], { ok: false, code: "invalid_replacement" }),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error.error.code).toBe("invalid_replacement");
    }
  });

  it("keeps unknown database codes as a generic safe 500", async () => {
    const result = await replaceTicket(
      makeDeps([], { ok: false, code: "totally_unexpected" }),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error.error.code).toBe("ticket_operation_failed");
      expect(JSON.stringify(result.error)).not.toMatch(/postgres|sqlstate|stack/i);
    }
  });

  it("never returns a raw token or token hash", async () => {
    const result = await replaceTicket(
      makeDeps([]),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.data);
      expect(Object.keys(result.data).sort()).toEqual([
        "newTicketCode",
        "newTicketId",
        "previousTicketId",
      ]);
      expect(serialized).not.toContain("v1.");
      expect(serialized).not.toMatch(/[0-9a-f]{64}/);
    }
  });
});
