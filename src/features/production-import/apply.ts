import "server-only";

/**
 * Applying a reviewed production import.
 *
 * The database function performs the whole upsert atomically. This module
 * verifies access, the confirmation text and the import state, then reports
 * summary counts only.
 *
 * Applying is idempotent. A registration is matched through any of its
 * linked source order IDs, so re-importing the same workbook - or a later
 * workbook that repeats orders already seen - updates the same registration
 * and never creates a second one. No ticket, PDF or delivery is created or
 * changed here.
 */

import { canImportRegistrations } from "@/features/auth/permissions";
import type { StaffSession } from "@/features/auth/types";
import type { Json, ProductionImportStatusEnum } from "@/types/database";
import { applyProductionImportRpc, getProductionImport, listGraduates } from "./repository";
import { applyProductionImportSchema } from "./schemas";
import { failure, type ServiceResult } from "./service";
import type { ApplyProductionImportResult } from "./types";

/** Only a reviewed preview may be applied. */
export function canApplyStatus(status: ProductionImportStatusEnum): boolean {
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

export function parseApplySummary(json: Json): ApplyProductionImportResult {
  return {
    createdRegistrations: numberField(json, "created_registrations"),
    updatedRegistrations: numberField(json, "updated_registrations"),
    skippedGroups: numberField(json, "skipped_groups"),
    linkedSourceOrders: numberField(json, "linked_source_orders"),
  };
}

export async function applyProductionImport(
  actor: StaffSession,
  importId: string,
  body: unknown
): Promise<ServiceResult<ApplyProductionImportResult>> {
  if (!canImportRegistrations(actor.role)) {
    return failure(
      403,
      "not_authorized",
      "Administrator access is required for the production import."
    );
  }

  const parsedBody = applyProductionImportSchema.safeParse(body);
  if (!parsedBody.success) {
    return failure(
      400,
      "invalid_confirmation",
      "The apply confirmation text is missing or incorrect."
    );
  }

  const importRecord = await getProductionImport(importId);
  if (importRecord === null) {
    return failure(404, "import_not_found", "The import was not found.");
  }
  if (!canApplyStatus(importRecord.status)) {
    return failure(
      409,
      "import_not_applyable",
      "This import cannot be applied. Only an import awaiting review is " +
        "applyable, and an applied import is never reapplied."
    );
  }

  // Every graduate must carry an explicit decision. A graduate still at
  // needs_review would be silently skipped, which is exactly the surprise
  // this workflow exists to prevent.
  const graduates = await listGraduates(importId);
  const unresolved = graduates.filter(
    (row) => row.decision === "needs_review"
  ).length;
  if (unresolved > 0) {
    return failure(
      409,
      "unresolved_reconciliation",
      `${unresolved} graduate(s) still need a reconciliation decision. ` +
        "Approve or exclude each one before applying."
    );
  }

  const summary = await applyProductionImportRpc(importId, actor.userId);
  return { ok: true, data: parseApplySummary(summary) };
}
