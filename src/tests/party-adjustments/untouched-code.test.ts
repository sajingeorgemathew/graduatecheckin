import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Regression guard: HOTFIX-PARTY-01 must not modify any scanner, check-in,
 * QR-token or ticket-token source file, nor their migrations. A party
 * adjustment resolves through the same ticket, so the scanner and check-in
 * implementation must remain byte-for-byte unchanged on this branch.
 *
 * This inspects the working tree with git rather than a database.
 */

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

/** Paths that this hotfix is forbidden to touch. */
const PROTECTED = [
  /^src\/features\/scanner\//,
  /^src\/features\/checkin\//,
  /^src\/features\/tickets\/(token|qr-payload|qr-renderer)\.ts$/,
  /^src\/app\/api\/.*\/scanner(\/|$)/,
  /^src\/app\/api\/.*\/checkin(\/|$)/,
  /^src\/app\/api\/staff\/(scanner|checkin)\//,
  /_create_ticket_scan_validation_audit\.sql$/,
  /_create_graduate_guest_checkin_workflow\.sql$/,
  /_create_attendance_supervisor_workflow\.sql$/,
];

function changedPaths(): string[] {
  const output = execSync("git status --porcelain", {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    // Porcelain: "XY path" or "R  old -> new".
    const rest = line.slice(3).trim();
    const arrow = rest.split(" -> ");
    paths.push(...arrow.map((value) => value.replace(/^"|"$/g, "")));
  }
  return paths;
}

describe("scanner, check-in and token code stays untouched", () => {
  const changed = changedPaths();

  it("changes no protected scanner, check-in or token file", () => {
    for (const path of changed) {
      for (const pattern of PROTECTED) {
        expect(
          pattern.test(path),
          `${path} matched forbidden pattern ${pattern}`
        ).toBe(false);
      }
    }
  });
});
