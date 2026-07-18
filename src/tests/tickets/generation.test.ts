import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { StaffSession } from "@/features/auth/types";
import {
  runTicketGeneration,
  type TicketGenerationDeps,
} from "@/features/tickets/generation";
import type { BatchItemInput } from "@/features/tickets/repository";
import type { RegistrationWithTickets } from "@/features/tickets/types";
import type { GraduationEventRow, Json } from "@/types/database";

const SECRET = randomBytes(48).toString("base64");
const EVENT_ID = "11111111-2222-4333-8444-555555555555";

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

function event(): GraduationEventRow {
  return {
    id: EVENT_ID,
    event_code: "GRAD-2026-DEV",
    event_name: "Test Graduation 2026",
    starts_at: "2026-08-01T17:00:00Z",
    ends_at: null,
    timezone: "America/Toronto",
    venue_name: "Test Hall",
    venue_address: "1 Fictional Street, Toronto",
    status: "active",
    is_test: true,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
  };
}

let regCounter = 0;

function registration(
  overrides: Partial<RegistrationWithTickets> = {}
): RegistrationWithTickets {
  regCounter += 1;
  return {
    id: randomUUID(),
    event_id: EVENT_ID,
    graduate_full_name: `Test Graduate ${String(regCounter).padStart(3, "0")}`,
    source_registration_id: `MOCK-${2000 + regCounter}`,
    registration_status: "eligible",
    expected_party_size: 3,
    registered_adult_guests: 2,
    registered_children_0_4: 0,
    registered_children_5_10: 0,
    is_test: true,
    tickets: [],
    ...overrides,
  };
}

interface CapturedBatch {
  actorUserId: string;
  eventId: string;
  idempotencyKey: string;
  requestId: string;
  items: BatchItemInput[];
}

function makeDeps(
  registrations: RegistrationWithTickets[],
  captured: CapturedBatch[],
  batchResponse?: Json
): TicketGenerationDeps {
  return {
    resolveActiveEvent: async () => ({ ok: true, event: event() }),
    fetchRegistrations: async () => registrations,
    applyBatch: async (actorUserId, eventId, idempotencyKey, requestId, items) => {
      captured.push({ actorUserId, eventId, idempotencyKey, requestId, items });
      return (
        batchResponse ?? {
          ok: true,
          duplicate: false,
          batch_id: randomUUID(),
          candidate_count: items.length,
          generated_count: items.length,
          skipped_count: 0,
          error_count: 0,
        }
      );
    },
    getTicketSecret: () => SECRET,
    newUuid: randomUUID,
  };
}

function validInput(registrationIds: string[]): unknown {
  return {
    registrationIds,
    confirmationText: "GENERATE TICKETS",
    idempotencyKey: randomUUID(),
  };
}

describe("bulk ticket generation", () => {
  it("generates server-side items for selected eligible registrations", async () => {
    const regs = [registration(), registration()];
    const captured: CapturedBatch[] = [];
    const result = await runTicketGeneration(
      makeDeps(regs, captured),
      admin(),
      validInput(regs.map((r) => r.id))
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.generatedCount).toBe(2);
      expect(result.data.duplicate).toBe(false);
    }
    expect(captured).toHaveLength(1);
    expect(captured[0].items).toHaveLength(2);
    for (const item of captured[0].items) {
      expect(item.ticket_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.ticket_code).toMatch(/^GR26-/);
      expect(item.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(item.token_version).toBe(1);
    }
  });

  it("never places a raw token or token field in batch items", async () => {
    const regs = [registration()];
    const captured: CapturedBatch[] = [];
    await runTicketGeneration(
      makeDeps(regs, captured),
      admin(),
      validInput([regs[0].id])
    );
    const keys = Object.keys(captured[0].items[0]);
    expect(keys.sort()).toEqual(
      [
        "registration_id",
        "ticket_code",
        "ticket_id",
        "token_hash",
        "token_version",
      ].sort()
    );
    const serialized = JSON.stringify(captured[0]);
    expect(serialized).not.toContain("v1.");
    expect(serialized).not.toContain("TAE-GRAD1");
  });

  it("assigns a unique ticket code to every batch item", async () => {
    const regs = Array.from({ length: 20 }, () => registration());
    const captured: CapturedBatch[] = [];
    await runTicketGeneration(
      makeDeps(regs, captured),
      admin(),
      validInput(regs.map((r) => r.id))
    );
    const codes = captured[0].items.map((item) => item.ticket_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("returns the previous batch result on double submission", async () => {
    const regs = [registration()];
    const captured: CapturedBatch[] = [];
    const duplicateResponse: Json = {
      ok: true,
      duplicate: true,
      batch_id: randomUUID(),
      candidate_count: 1,
      generated_count: 1,
      skipped_count: 0,
      error_count: 0,
    };
    const result = await runTicketGeneration(
      makeDeps(regs, captured, duplicateResponse),
      admin(),
      validInput([regs[0].id])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.duplicate).toBe(true);
      expect(result.data.generatedCount).toBe(1);
    }
  });

  it("drops registrations that do not belong to the active event", async () => {
    const regs = [registration()];
    const captured: CapturedBatch[] = [];
    const foreignId = randomUUID();
    await runTicketGeneration(
      makeDeps(regs, captured),
      admin(),
      validInput([regs[0].id, foreignId])
    );
    expect(captured[0].items).toHaveLength(1);
    expect(captured[0].items[0].registration_id).toBe(regs[0].id);
  });

  it("fails when no selected registration belongs to the event", async () => {
    const captured: CapturedBatch[] = [];
    const result = await runTicketGeneration(
      makeDeps([registration()], captured),
      admin(),
      validInput([randomUUID()])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error.code).toBe("no_valid_candidates");
    }
    expect(captured).toHaveLength(0);
  });

  it("denies scanners, supervisors, inactive staff and pending password changes", async () => {
    const regs = [registration()];
    const sessions = [
      admin({ role: "scanner" }),
      admin({ role: "supervisor" }),
      admin({ isActive: false }),
      admin({ mustChangePassword: true }),
    ];
    for (const session of sessions) {
      const captured: CapturedBatch[] = [];
      const result = await runTicketGeneration(
        makeDeps(regs, captured),
        session,
        validInput([regs[0].id])
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(403);
      }
      expect(captured).toHaveLength(0);
    }
  });

  it("rejects a wrong confirmation text", async () => {
    const regs = [registration()];
    const captured: CapturedBatch[] = [];
    const result = await runTicketGeneration(
      makeDeps(regs, captured),
      admin(),
      {
        registrationIds: [regs[0].id],
        confirmationText: "generate tickets",
        idempotencyKey: randomUUID(),
      }
    );
    expect(result.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("fails safely when the ticket secret is missing or weak", async () => {
    const regs = [registration()];
    const captured: CapturedBatch[] = [];
    const deps = { ...makeDeps(regs, captured), getTicketSecret: () => "weak" };
    const result = await runTicketGeneration(
      deps,
      admin(),
      validInput([regs[0].id])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error.error.code).toBe("ticket_configuration_invalid");
      expect(JSON.stringify(result.error)).not.toContain("weak");
    }
    expect(captured).toHaveLength(0);
  });

  it("reports the configured-event failure without generating", async () => {
    const captured: CapturedBatch[] = [];
    const deps: TicketGenerationDeps = {
      ...makeDeps([registration()], captured),
      resolveActiveEvent: async () => ({ ok: false, code: "event_not_open" }),
    };
    const result = await runTicketGeneration(
      deps,
      admin(),
      validInput([randomUUID()])
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error.code).toBe("event_not_open");
    }
    expect(captured).toHaveLength(0);
  });

  it("returns counts only, never tokens or hashes", async () => {
    const regs = [registration()];
    const captured: CapturedBatch[] = [];
    const result = await runTicketGeneration(
      makeDeps(regs, captured),
      admin(),
      validInput([regs[0].id])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(result.data);
      expect(keys.sort()).toEqual(
        [
          "batchId",
          "candidateCount",
          "duplicate",
          "errorCount",
          "generatedCount",
          "skippedCount",
        ].sort()
      );
    }
  });
});
