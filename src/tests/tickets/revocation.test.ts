import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { StaffSession } from "@/features/auth/types";
import {
  revokeTicket,
  type TicketRevocationDeps,
} from "@/features/tickets/revocation";
import type { Json } from "@/types/database";

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

interface CapturedRevocation {
  actorUserId: string;
  ticketId: string;
  reason: string;
  requestId: string;
}

function makeDeps(
  captured: CapturedRevocation[],
  response?: Json
): TicketRevocationDeps {
  return {
    revokeTicket: async (actorUserId, ticketId, reason, requestId) => {
      captured.push({ actorUserId, ticketId, reason, requestId });
      return response ?? { ok: true };
    },
    newUuid: randomUUID,
  };
}

const VALID_INPUT = {
  reason: "Ticket issued to the wrong registration.",
  confirmationText: "REVOKE TICKET",
};

describe("ticket revocation", () => {
  it("revokes an active ticket and records the actor", async () => {
    const captured: CapturedRevocation[] = [];
    const session = admin();
    const ticketId = randomUUID();
    const result = await revokeTicket(
      makeDeps(captured),
      session,
      ticketId,
      VALID_INPUT
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ ticketId, status: "revoked" });
    }
    expect(captured).toHaveLength(1);
    expect(captured[0].actorUserId).toBe(session.userId);
    expect(captured[0].reason).toBe(VALID_INPUT.reason);
  });

  it("requires a reason between 5 and 500 characters", async () => {
    const captured: CapturedRevocation[] = [];
    for (const reason of ["", "abcd", "x".repeat(501)]) {
      const result = await revokeTicket(makeDeps(captured), admin(), randomUUID(), {
        reason,
        confirmationText: "REVOKE TICKET",
      });
      expect(result.ok).toBe(false);
    }
    expect(captured).toHaveLength(0);
  });

  it("requires the exact confirmation text", async () => {
    const captured: CapturedRevocation[] = [];
    const result = await revokeTicket(makeDeps(captured), admin(), randomUUID(), {
      reason: "Valid reason here.",
      confirmationText: "REVOKE",
    });
    expect(result.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("denies scanners and supervisors", async () => {
    const captured: CapturedRevocation[] = [];
    for (const session of [admin({ role: "scanner" }), admin({ role: "supervisor" })]) {
      const result = await revokeTicket(
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

  it("cannot revoke a ticket that is not active anymore", async () => {
    const result = await revokeTicket(
      makeDeps([], { ok: false, code: "ticket_not_active" }),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
    }
  });

  it("creates no replacement", async () => {
    const result = await revokeTicket(
      makeDeps([]),
      admin(),
      randomUUID(),
      VALID_INPUT
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.data).sort()).toEqual(["status", "ticketId"]);
      expect(JSON.stringify(result.data)).not.toContain("new");
    }
  });
});
