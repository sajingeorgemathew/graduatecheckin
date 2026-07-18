import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateScan } from "@/features/scanner/service";
import {
  isCompleteTicketCode,
  normalizeManualCode,
} from "@/features/scanner/validation";
import {
  fakeScannerWorld,
  fictionalScannerSession,
  fictionalTicket,
  scanRequest,
} from "./helpers";

const session = fictionalScannerSession();
const srcDir = fileURLToPath(new URL("../..", import.meta.url));

describe("manual ticket-code validation", () => {
  it("accepts a correct complete code", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("manual_code", ticket.ticket_code)
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("valid");
      expect(outcome.view.ticketCode).toBe(ticket.ticket_code);
    }
  });

  it("normalizes lowercase input and trims whitespace", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("manual_code", `  ${ticket.ticket_code.toLowerCase()}  `)
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("valid");
    }
    expect(world.codeLookups).toEqual([ticket.ticket_code]);
  });

  it("rejects an invalid format without any database lookup", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("manual_code", "NOT-A-CODE")
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
    }
    expect(world.codeLookups).toHaveLength(0);
  });

  it("never searches partial codes", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);
    const partial = ticket.ticket_code.slice(0, 9);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("manual_code", partial)
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
    }
    expect(world.codeLookups).toHaveLength(0);
  });

  it("returns no similar codes for a near miss", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket({ ticket_code: "GR26-ABCD-EFGH" });
    world.addTicket(ticket);

    const outcome = await validateScan(
      world.deps,
      session,
      scanRequest("manual_code", "GR26-ABCD-EFGJ")
    );
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(outcome.view.result).toBe("invalid");
      expect(outcome.view.ticketCode).toBeNull();
    }
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain("GR26-ABCD-EFGH");
  });

  it("records manual_code as the scan method", async () => {
    const world = fakeScannerWorld();
    const ticket = fictionalTicket();
    world.addTicket(ticket);

    await validateScan(
      world.deps,
      session,
      scanRequest("manual_code", ticket.ticket_code)
    );
    expect(world.attempts).toHaveLength(1);
    expect(world.attempts[0].method).toBe("manual_code");
  });

  it("normalization helpers behave exactly", () => {
    expect(normalizeManualCode("  gr26-abcd-efgh ")).toBe("GR26-ABCD-EFGH");
    expect(isCompleteTicketCode("GR26-ABCD-EFGH")).toBe(true);
    expect(isCompleteTicketCode("GR26-ABCD")).toBe(false);
    expect(isCompleteTicketCode("")).toBe(false);
  });

  it("never logs manual codes in scanner server modules", () => {
    for (const relative of [
      "features/scanner/service.ts",
      "features/scanner/repository.ts",
      "features/scanner/validation.ts",
    ]) {
      const source = readFileSync(
        join(srcDir, ...relative.split("/")),
        "utf8"
      );
      expect(source, relative).not.toContain("console.log");
      expect(source, relative).not.toContain("console.error");
      expect(source, relative).not.toContain("console.debug");
    }
  });
});
