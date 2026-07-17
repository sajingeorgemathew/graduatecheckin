import "server-only";

/**
 * Applying an approved import. The database function performs the actual
 * upsert atomically; this module verifies access, confirmation and state,
 * then reports summary counts only.
 */

import type { StaffSession } from "@/features/auth/types";
import type { Json, RegistrationImportStatus } from "@/types/database";
import { hasImportAccess } from "./access";
import { applyImportRpc, getImport } from "./repository";
import { applyImportSchema } from "./schemas";
import type { ApplyResult, StructuredError } from "./types";
import type { ServiceResult } from "./service";

/** Only a reviewed preview may be applied. Applied, cancelled, duplicate
 * and failed imports can never be applied or reapplied. */
export function canApplyStatus(status: RegistrationImportStatus): boolean {
  return status === "preview_ready";
}

function numberField(json: Json, key: string): number {
  if (json !== null && typeof json === "object" && !Array.isArray(json)) {
    const value = json[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

/** Reads the summary counts returned by the database apply function. */
export function parseApplySummary(json: Json): ApplyResult {
  return {
    applied_new: numberField(json, "applied_new"),
    applied_updated: numberField(json, "applied_updated"),
    applied_unchanged: numberField(json, "applied_unchanged"),
    skipped: numberField(json, "skipped"),
  };
}

function failure(
  status: number,
  code: string,
  message: string
): { ok: false; status: number; error: StructuredError } {
  return { ok: false, status, error: { error: { code, message } } };
}

/**
 * Applies the approved rows of a preview_ready import. Requires the exact
 * confirmation text and a client idempotency key. The database function
 * locks the batch, so a repeated submission is rejected instead of being
 * applied twice.
 */
export async function applyImport(
  actor: StaffSession,
  importId: string,
  body: unknown
): Promise<ServiceResult<ApplyResult>> {
  if (!hasImportAccess(actor)) {
    return failure(
      403,
      "not_authorized",
      "Administrator access is required for imports."
    );
  }

  const parsedBody = applyImportSchema.safeParse(body);
  if (!parsedBody.success) {
    return failure(
      400,
      "invalid_confirmation",
      "The apply confirmation is missing or incorrect."
    );
  }

  const importRecord = await getImport(importId);
  if (importRecord === null) {
    return failure(404, "import_not_found", "The import was not found.");
  }
  if (!canApplyStatus(importRecord.status)) {
    return failure(
      409,
      "import_not_applyable",
      "This import cannot be applied. Applied imports cannot be reapplied."
    );
  }

  const summary = await applyImportRpc(importId);
  return { ok: true, data: parseApplySummary(summary) };
}
