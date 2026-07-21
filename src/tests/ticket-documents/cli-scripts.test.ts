/**
 * Regression tests for the CHECKIN-09A standalone CLI scripts.
 *
 * These prove the two integration defects that broke
 * `npm run tickets:configure-event` and `npm run tickets:verify-config`
 * cannot come back:
 *
 *  1. A CLI script (run under tsx, outside the Next.js server runtime) must
 *     never import a module chain that contains `import "server-only"`.
 *  2. The verifier must resolve the same Supabase credentials the base
 *     verifier already confirmed, and must never collapse unrelated
 *     failures into a misleading "credentials unavailable" message.
 *
 * The import-chain checks are static (they read source and follow relative
 * imports), so the vitest `server-only` alias stub cannot mask a real
 * server-only import the way a runtime import would.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearAssetCache,
  isSafeAssetName,
  loadPublicAsset,
  resolvePrimaryLogoAssetName,
} from "@/features/ticket-documents/assets.shared";
import {
  diffEventDisplay,
  diffTicketSettings,
  EVENT_NAME,
  EVENT_TIMEZONE,
  VENUE_NAME,
} from "../../../scripts/tickets/configure-plan";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function readRepo(relative: string): string {
  return readFileSync(join(repoRoot, ...relative.split("/")), "utf8");
}

// --------------------------------------------------------------------------
// Static import-graph walk
// --------------------------------------------------------------------------

const IMPORT_SPECIFIER =
  /(?:from\s+|import\s+|require\s*\(\s*)["']([^"']+)["']/g;

function resolveSpecifier(importer: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = join(repoRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(importer), specifier);
  } else {
    // A bare package specifier (node_modules). Not followed.
    return null;
  }
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    base,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

// Matches a real `import "server-only"` (or require) statement at the start
// of a line, not a mention inside a doc comment or backtick.
const SERVER_ONLY = /^\s*(?:import\s+|require\s*\(\s*)["']server-only["']/m;

/** Every repo file reachable from entry via relative/@ imports, plus entry. */
function collectImportGraph(entryRelative: string): Set<string> {
  const entry = join(repoRoot, ...entryRelative.split("/"));
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved !== null && !seen.has(resolved)) {
        stack.push(resolved);
      }
    }
  }
  return seen;
}

function serverOnlyModulesInGraph(entryRelative: string): string[] {
  const graph = collectImportGraph(entryRelative);
  const offenders: string[] = [];
  for (const file of graph) {
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (SERVER_ONLY.test(source)) {
      offenders.push(file);
    }
  }
  return offenders;
}

const CLI_SCRIPTS = [
  "scripts/tickets/configure-convocation-2026.ts",
  "scripts/tickets/verify-config.ts",
  "scripts/tickets/verify-documents.ts",
] as const;

describe("CLI scripts import no server-only chain", () => {
  for (const script of CLI_SCRIPTS) {
    it(`${script} pulls in no "server-only" module`, () => {
      const offenders = serverOnlyModulesInGraph(script).map((f) =>
        f.replace(repoRoot, "")
      );
      expect(offenders, offenders.join(", ")).toEqual([]);
    });
  }

  it("the walker actually reaches shared modules (sanity)", () => {
    const graph = collectImportGraph(CLI_SCRIPTS[0]);
    const names = [...graph].map((f) => f.replace(/\\/g, "/"));
    expect(
      names.some((n) => n.endsWith("ticket-documents/assets.shared.ts"))
    ).toBe(true);
    expect(names.some((n) => n.endsWith("scripts/mock-data/db.ts"))).toBe(true);
    // It must NOT reach the server-only asset barrel.
    expect(
      names.some((n) => n.endsWith("ticket-documents/assets.ts"))
    ).toBe(false);
  });
});

// --------------------------------------------------------------------------
// CLI asset resolution works outside Next.js
// --------------------------------------------------------------------------

describe("CLI asset resolution", () => {
  beforeEach(() => clearAssetCache());

  it("resolves a primary logo asset name to a real public file", () => {
    const name = resolvePrimaryLogoAssetName();
    expect(name.length).toBeGreaterThan(0);
    expect(loadPublicAsset(name)).not.toBeNull();
  });

  it("loads a committed public asset as a Buffer", () => {
    const buffer = loadPublicAsset("logo_final_full.png");
    expect(buffer).toBeInstanceOf(Buffer);
    expect((buffer as Buffer).length).toBeGreaterThan(0);
  });

  it("rejects traversal and nested paths", () => {
    expect(isSafeAssetName("../secret.png")).toBe(false);
    expect(isSafeAssetName("nested/logo.png")).toBe(false);
    expect(isSafeAssetName("logo_final_full.png")).toBe(true);
    expect(loadPublicAsset("../../.env.local")).toBeNull();
    expect(loadPublicAsset("does-not-exist.png")).toBeNull();
  });
});

// --------------------------------------------------------------------------
// CLI Supabase configuration
// --------------------------------------------------------------------------

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

describe("CLI Supabase configuration", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("recognizes NEXT_PUBLIC_SUPABASE_URL and builds a client without a native WebSocket", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-key";
    const { createScriptAdminClient } = await import(
      "../../../scripts/mock-data/db"
    );
    // Regression: on Node < 22 createClient used to throw
    // "native WebSocket not found" here. The noop realtime transport
    // prevents that so administrative scripts can run.
    expect(() => createScriptAdminClient()).not.toThrow();
  });

  it("requires SUPABASE_SERVICE_ROLE_KEY with an accurate message", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.co";
    const { createScriptAdminClient, MissingEnvError } = await import(
      "../../../scripts/mock-data/db"
    );
    let thrown: unknown;
    try {
      createScriptAdminClient();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MissingEnvError);
    expect((thrown as InstanceType<typeof MissingEnvError>).missing).toContain(
      "SUPABASE_SERVICE_ROLE_KEY"
    );
    // The message names the missing variable but never a value.
    expect((thrown as Error).message).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("reports every missing credential when nothing is set", async () => {
    const { createScriptAdminClient, MissingEnvError } = await import(
      "../../../scripts/mock-data/db"
    );
    let thrown: unknown;
    try {
      createScriptAdminClient();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(MissingEnvError);
    const missing = (thrown as InstanceType<typeof MissingEnvError>).missing;
    expect(missing).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns null for the anon client when the publishable key is absent", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.co";
    const { createScriptAnonClient } = await import(
      "../../../scripts/mock-data/db"
    );
    expect(createScriptAnonClient()).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Secrets are never printed
// --------------------------------------------------------------------------

describe("CLI scripts never print secrets", () => {
  const sources = [
    ...CLI_SCRIPTS.map(readRepo),
    readRepo("scripts/mock-data/db.ts"),
    readRepo("scripts/tickets/configure-plan.ts"),
  ];

  it("does not log a service-role key, publishable key or ticket secret value", () => {
    for (const source of sources) {
      // Printing a VALUE looks like a process.env read, a bare secret
      // variable, or a `${secret}` interpolation. Naming a variable in
      // guidance text (e.g. "set SUPABASE_SERVICE_ROLE_KEY") is allowed, and
      // a one-way fingerprint of the secret is allowed.
      expect(source).not.toMatch(
        /console\.\w+\s*\([^)]*process\.env\.SUPABASE_SERVICE_ROLE_KEY/
      );
      expect(source).not.toMatch(
        /console\.\w+\s*\([^)]*process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/
      );
      expect(source).not.toMatch(
        /console\.\w+\s*\([^)]*process\.env\.TICKET_TOKEN_SECRET/
      );
      expect(source).not.toMatch(
        /console\.\w+\s*\([^)]*\$\{\s*(serviceRoleKey|anonKey|serviceKey|secret)\s*\}/
      );
      expect(source).not.toMatch(
        /console\.\w+\s*\(\s*(serviceRoleKey|anonKey|secret)\s*[),]/
      );
    }
  });
});

// --------------------------------------------------------------------------
// Configure command: dry-run and idempotency
// --------------------------------------------------------------------------

describe("configure command safety", () => {
  // Line-ending agnostic: the working copy may be checked out with CRLF.
  const configureSource = readRepo(
    "scripts/tickets/configure-convocation-2026.ts"
  ).replace(/\r\n/g, "\n");

  it("performs no write before the dry-run early return", () => {
    const dryRunReturn = configureSource.indexOf("Dry-run complete.");
    const firstInsert = configureSource.indexOf(".insert(");
    const firstWriteUpdate = configureSource.indexOf(
      ".update({\n      event_name"
    );
    expect(dryRunReturn).toBeGreaterThan(0);
    expect(firstInsert).toBeGreaterThan(dryRunReturn);
    expect(firstWriteUpdate).toBeGreaterThan(dryRunReturn);
  });

  it("is idempotent: matching state yields no changes", () => {
    const matchingEvent = {
      event_name: EVENT_NAME,
      starts_at: "2026-07-26T16:00:00.000Z",
      ends_at: "2026-07-26T20:00:00.000Z",
      timezone: EVENT_TIMEZONE,
      venue_name: VENUE_NAME,
      venue_address: "35 Brunel Road, Mississauga, ON L4Z 3E8",
    };
    expect(diffEventDisplay(matchingEvent)).toEqual([]);

    const matchingSettings = {
      display_title: EVENT_NAME,
      description:
        "Celebrate this important milestone with Toronto Academy of Education " +
        "at Convocation Ceremony 2026. This single admission ticket covers the " +
        "graduate and all registered guests shown on this ticket. No separate " +
        "guest ticket is required. Save the PDF on your phone or bring a " +
        "printed copy and present the QR code at check-in.",
      program_schedule: [{}, {}, {}],
      primary_logo_asset: "logo_final_full.png",
      template_version: 1,
    };
    const plan = diffTicketSettings(matchingSettings, "logo_final_full.png");
    expect(plan.action).toBe("update");
    expect(plan.changes).toEqual([]);
  });

  it("reports changes when the stored state differs", () => {
    const staleEvent = {
      event_name: "Old Name",
      starts_at: "2026-01-01T00:00:00.000Z",
      ends_at: "2026-01-01T01:00:00.000Z",
      timezone: "UTC",
      venue_name: "Old Venue",
      venue_address: "Old Address",
    };
    expect(diffEventDisplay(staleEvent).length).toBeGreaterThan(0);
    const plan = diffTicketSettings(null, "logo_final_full.png");
    expect(plan.action).toBe("create");
    expect(plan.changes.length).toBeGreaterThan(0);
  });
});

// --------------------------------------------------------------------------
// Verifier accuracy (static)
// --------------------------------------------------------------------------

describe("verifier reports failures accurately", () => {
  const verifySource = readRepo("scripts/tickets/verify-documents.ts");

  it("never collapses failures into a generic credentials message", () => {
    expect(verifySource).not.toContain(
      "Supabase service credentials are unavailable"
    );
  });

  it("distinguishes missing environment, missing migration and query failure", () => {
    expect(verifySource).toContain("Required environment variable(s) missing");
    expect(verifySource).toContain("missing migration");
    expect(verifySource).toContain("could not be queried");
    expect(verifySource).toContain("MissingEnvError");
  });

  it("reports a missing ticket settings row distinctly", () => {
    expect(verifySource).toContain(
      "No ticket settings row exists. Run npm run tickets:configure-event."
    );
  });

  it("treats zero generated documents as a valid initial state", () => {
    expect(verifySource).toContain(
      "Zero generated documents is a valid initial state"
    );
    // The zero-document branch is info, never a failure.
    expect(verifySource).toMatch(/if \(rows\.length === 0\)[\s\S]{0,400}info\(/);
  });

  it("proves no raw QR token column is stored", () => {
    expect(verifySource).toContain("FORBIDDEN_TOKEN_COLUMNS");
    expect(verifySource).toContain("token_hash");
  });

  it("checks deny-by-default RLS against the public role", () => {
    expect(verifySource).toContain("createScriptAnonClient");
    expect(verifySource).toContain("RLS");
  });
});

// --------------------------------------------------------------------------
// Existing Next.js server-only protection remains
// --------------------------------------------------------------------------

describe("Next.js server-only safeguards remain", () => {
  const SENSITIVE_APP_MODULES = [
    "src/features/ticket-documents/assets.ts",
    "src/features/ticket-documents/render.ts",
    "src/features/ticket-documents/service.ts",
    "src/features/ticket-documents/storage.ts",
    "src/features/ticket-documents/repository.ts",
    "src/features/ticket-documents/read-service.ts",
    "src/features/ticket-documents/batches.ts",
    "src/lib/supabase/admin.ts",
  ] as const;

  for (const modulePath of SENSITIVE_APP_MODULES) {
    it(`${modulePath} keeps its "server-only" guard`, () => {
      expect(readRepo(modulePath)).toMatch(SERVER_ONLY);
    });
  }

  it("the pure shared asset module has no server-only guard", () => {
    expect(readRepo("src/features/ticket-documents/assets.shared.ts")).not.toMatch(
      SERVER_ONLY
    );
  });
});
