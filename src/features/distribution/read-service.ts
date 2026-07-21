import "server-only";

/**
 * Read model for the distribution administration surface. Resolves the
 * active event, then loads dashboard counts, delivery batches and the
 * document batches that are eligible to become delivery batches. Recipient
 * emails are never included in these list shapes.
 */

import { resolveActiveEvent } from "@/features/events/resolve-active-event";
import { listBatches as listDocumentBatches } from "@/features/ticket-documents/repository";

import { distributionSecretStatus } from "./secret";
import { getDistributionOverview } from "./service";

export interface DistributionAdminData {
  eventName: string;
  eventCode: string;
  eventIsTest: boolean;
  distributionConfigured: boolean;
  counts: Awaited<ReturnType<typeof getDistributionOverview>>["counts"];
  deliveryBatches: Awaited<ReturnType<typeof getDistributionOverview>>["batches"];
  sourceDocumentBatches: Array<{
    id: string;
    code: string;
    status: string;
    readyCount: number;
    createdAt: string;
  }>;
}

export type DistributionAdminResult =
  | { ok: true; data: DistributionAdminData }
  | { ok: false; message: string };

export async function loadDistributionAdminData(): Promise<DistributionAdminResult> {
  const event = await resolveActiveEvent();
  if (!event.ok) {
    return {
      ok: false,
      message: "The configured graduation event is not available.",
    };
  }

  const [overview, documentBatches] = await Promise.all([
    getDistributionOverview(event.event.id),
    listDocumentBatches(event.event.id),
  ]);
  const secret = distributionSecretStatus();

  return {
    ok: true,
    data: {
      eventName: event.event.event_name,
      eventCode: event.event.event_code,
      eventIsTest: event.event.is_test,
      distributionConfigured: secret.valid,
      counts: overview.counts,
      deliveryBatches: overview.batches,
      sourceDocumentBatches: documentBatches
        .filter(
          (batch) => batch.status === "ready" || batch.status === "exported"
        )
        .map((batch) => ({
          id: batch.id,
          code: batch.batch_code,
          status: batch.status,
          readyCount: batch.ready_count,
          createdAt: batch.created_at,
        })),
    },
  };
}
