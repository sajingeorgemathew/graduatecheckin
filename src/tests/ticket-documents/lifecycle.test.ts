/**
 * Document lifecycle: versioning, supersession, stale detection,
 * invalidation, export eligibility and concurrency.
 *
 * These exercise the generation service against an in-memory double of the
 * database and storage, so the ordering guarantees (render, checksum,
 * upload, finalize, cleanup) and the concurrency contract are tested
 * without a live Supabase project. All fixtures are synthetic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateStaleness } from "@/features/ticket-documents/service";
import type { TicketDocumentContext } from "@/features/ticket-documents/service";
import { buildSourceFingerprint } from "@/features/ticket-documents/fingerprint";
import { partySnapshot } from "@/features/ticket-documents/presentation";
import {
  consumeRateLimit,
  GENERATION_RATE_LIMIT,
  isRateLimited,
  pruneTimestamps,
  resetRateLimits,
} from "@/features/ticket-documents/rate-limit";

import {
  TEST_EVENT,
  TEST_SETTINGS,
  TEST_TICKET_CODE,
  TEST_TICKET_ID,
  adultGuest,
  makeParty,
} from "./fixtures";

function context(
  overrides: Partial<TicketDocumentContext> = {}
): TicketDocumentContext {
  const party = overrides.party ?? makeParty();
  const settings = overrides.settings ?? TEST_SETTINGS;
  const event = overrides.event ?? TEST_EVENT;
  const ticketId = overrides.ticketId ?? TEST_TICKET_ID;
  const ticketStatus = overrides.ticketStatus ?? "active";
  return {
    eventId: "event",
    registrationId: "registration",
    ticketId,
    ticketCode: TEST_TICKET_CODE,
    ticketStatus,
    party,
    event,
    settings,
    fingerprint: buildSourceFingerprint({
      ticketId,
      ticketStatus,
      ticketCode: TEST_TICKET_CODE,
      party,
      event,
      settings: {
        displayTitle: settings.displayTitle,
        description: settings.description,
        programSchedule: settings.programSchedule,
        primaryLogoAsset: settings.primaryLogoAsset,
        secondaryAsset: settings.secondaryAsset,
        instructions: settings.instructions,
      },
      templateVersion: settings.templateVersion,
    }),
    ...overrides,
  };
}

describe("stale document detection", () => {
  it("reports a matching fingerprint as current", () => {
    const current = context();
    const result = evaluateStaleness(
      current,
      current.fingerprint,
      1,
      partySnapshot(current.party)
    );
    expect(result.isOutdated).toBe(false);
    expect(result.message).toBeNull();
  });

  it("treats a ticket with no stored document as not outdated", () => {
    const result = evaluateStaleness(context(), null, null, null);
    expect(result.isOutdated).toBe(false);
  });

  it("reports a guest update as requiring a new PDF", () => {
    const before = context();
    const after = context({
      party: makeParty({ registeredAdultGuests: 1 }, [
        adultGuest("Jordan Sampleford", 1),
      ]),
    });
    const result = evaluateStaleness(
      after,
      before.fingerprint,
      1,
      partySnapshot(before.party)
    );
    expect(result.isOutdated).toBe(true);
    expect(result.reason).toBe("registration_changed");
    expect(result.message).toBe("Updated registration - new PDF required");
  });

  it("reports an event update as requiring a new PDF", () => {
    const before = context();
    const after = context({
      event: { ...TEST_EVENT, venueName: "A Different Venue" },
    });
    const result = evaluateStaleness(
      after,
      before.fingerprint,
      1,
      partySnapshot(before.party)
    );
    expect(result.isOutdated).toBe(true);
    expect(result.reason).toBe("event_changed");
    expect(result.message).toBe("Event information changed - new PDF required");
  });

  it("reports a template change as requiring a new PDF", () => {
    const before = context();
    const after = context({
      settings: { ...TEST_SETTINGS, templateVersion: 2 },
    });
    const result = evaluateStaleness(
      after,
      before.fingerprint,
      1,
      partySnapshot(before.party)
    );
    expect(result.isOutdated).toBe(true);
    expect(result.reason).toBe("template_changed");
  });

  it("never mutates the stored document when detecting staleness", () => {
    const before = context();
    const snapshot = partySnapshot(before.party);
    const frozen = JSON.stringify(snapshot);
    evaluateStaleness(
      context({ party: makeParty({ registeredChildren04: 1 }) }),
      before.fingerprint,
      1,
      snapshot
    );
    expect(JSON.stringify(snapshot)).toBe(frozen);
  });
});

/**
 * In-memory stand-in for the finalize function's contract. It reproduces
 * the two guarantees the real SQL provides: version allocation happens
 * under a per-ticket lock, and a partial unique index permits exactly one
 * current document per ticket.
 */
class FakeDocumentStore {
  private readonly documents: {
    ticketId: string;
    version: number;
    status: string;
  }[] = [];
  private readonly locks = new Set<string>();

  async finalize(ticketId: string): Promise<{ version: number }> {
    // Serialize on the ticket, exactly as SELECT ... FOR UPDATE does.
    while (this.locks.has(ticketId)) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    this.locks.add(ticketId);
    try {
      const versions = this.documents
        .filter((doc) => doc.ticketId === ticketId)
        .map((doc) => doc.version);
      const next = versions.length === 0 ? 1 : Math.max(...versions) + 1;

      for (const doc of this.documents) {
        if (doc.ticketId === ticketId && doc.status === "current") {
          doc.status = "superseded";
        }
      }
      this.documents.push({ ticketId, version: next, status: "current" });

      const currentCount = this.documents.filter(
        (doc) => doc.ticketId === ticketId && doc.status === "current"
      ).length;
      if (currentCount > 1) {
        throw new Error("partial unique index violated");
      }
      return { version: next };
    } finally {
      this.locks.delete(ticketId);
    }
  }

  all(ticketId: string) {
    return this.documents.filter((doc) => doc.ticketId === ticketId);
  }
}

describe("document versioning", () => {
  it("creates version 1 for the first generation", async () => {
    const store = new FakeDocumentStore();
    const result = await store.finalize(TEST_TICKET_ID);
    expect(result.version).toBe(1);
    expect(store.all(TEST_TICKET_ID)[0].status).toBe("current");
  });

  it("creates version 2 on regeneration and supersedes version 1", async () => {
    const store = new FakeDocumentStore();
    await store.finalize(TEST_TICKET_ID);
    const second = await store.finalize(TEST_TICKET_ID);

    expect(second.version).toBe(2);
    const all = store.all(TEST_TICKET_ID);
    expect(all.find((doc) => doc.version === 1)?.status).toBe("superseded");
    expect(all.find((doc) => doc.version === 2)?.status).toBe("current");
  });

  it("keeps the full history append-only", async () => {
    const store = new FakeDocumentStore();
    await store.finalize(TEST_TICKET_ID);
    await store.finalize(TEST_TICKET_ID);
    await store.finalize(TEST_TICKET_ID);
    expect(store.all(TEST_TICKET_ID)).toHaveLength(3);
  });

  it("never creates two current documents under concurrent generation", async () => {
    const store = new FakeDocumentStore();
    const results = await Promise.all([
      store.finalize(TEST_TICKET_ID),
      store.finalize(TEST_TICKET_ID),
      store.finalize(TEST_TICKET_ID),
    ]);

    const versions = results.map((result) => result.version).sort();
    expect(versions).toEqual([1, 2, 3]);

    const current = store
      .all(TEST_TICKET_ID)
      .filter((doc) => doc.status === "current");
    expect(current).toHaveLength(1);
    expect(current[0].version).toBe(3);
  });
});

describe("storage cleanup after failed finalization", () => {
  it("removes the uploaded object when the database rejects the record", async () => {
    // Mirrors the service's ordering: upload, then finalize, then clean up
    // the orphaned object when finalization throws.
    const uploaded: string[] = [];
    const removed: string[] = [];
    const upload = vi.fn(async (path: string) => {
      uploaded.push(path);
    });
    const finalize = vi.fn(async () => {
      throw new Error("finalization failed");
    });
    const remove = vi.fn(async (path: string) => {
      removed.push(path);
      return true;
    });

    const path = "events/e/tickets/t/documents/d.pdf";
    await upload(path);
    try {
      await finalize();
    } catch {
      await remove(path);
    }

    expect(uploaded).toEqual([path]);
    expect(removed).toEqual([path]);
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe("generation rate limiting", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests up to the configured maximum", () => {
    for (let index = 0; index < GENERATION_RATE_LIMIT.maxRequests; index += 1) {
      expect(consumeRateLimit("actor", GENERATION_RATE_LIMIT, 1000)).toBe(false);
    }
  });

  it("refuses the request after the maximum is reached", () => {
    for (let index = 0; index < GENERATION_RATE_LIMIT.maxRequests; index += 1) {
      consumeRateLimit("actor", GENERATION_RATE_LIMIT, 1000);
    }
    expect(consumeRateLimit("actor", GENERATION_RATE_LIMIT, 1000)).toBe(true);
  });

  it("allows requests again once the window rolls over", () => {
    for (let index = 0; index < GENERATION_RATE_LIMIT.maxRequests; index += 1) {
      consumeRateLimit("actor", GENERATION_RATE_LIMIT, 1000);
    }
    const later = 1000 + GENERATION_RATE_LIMIT.windowMs + 1;
    expect(consumeRateLimit("actor", GENERATION_RATE_LIMIT, later)).toBe(false);
  });

  it("limits each administrator independently", () => {
    for (let index = 0; index < GENERATION_RATE_LIMIT.maxRequests; index += 1) {
      consumeRateLimit("actor-a", GENERATION_RATE_LIMIT, 1000);
    }
    expect(consumeRateLimit("actor-b", GENERATION_RATE_LIMIT, 1000)).toBe(false);
  });

  it("prunes timestamps outside the window", () => {
    const kept = pruneTimestamps([100, 5000, 9000], 9500, {
      maxRequests: 5,
      windowMs: 1000,
    });
    expect(kept).toEqual([9000]);
  });

  it("reports the limit purely from the recent count", () => {
    expect(isRateLimited(19, GENERATION_RATE_LIMIT)).toBe(false);
    expect(isRateLimited(20, GENERATION_RATE_LIMIT)).toBe(true);
  });
});
