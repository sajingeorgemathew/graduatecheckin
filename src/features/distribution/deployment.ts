import "server-only";

/**
 * Server-side resolution of the CHECKIN-10A production gate.
 *
 * APP_ENV and ACTIVE_GRADUATION_EVENT_CODE are server-only variables and are
 * never accepted from browser input, so a client can never talk its way into
 * production controls. When the active event cannot be resolved the gate fails
 * closed: the deployment is treated as pointing at a test event.
 */

import { getServerEnv } from "@/lib/env/server";
import {
  getActiveEventCode,
  resolveActiveEvent,
} from "@/features/events/resolve-active-event";

import {
  describeProductionGate,
  evaluateModeRequest,
  evaluateProductionGate,
  type AppEnvironment,
  type ProductionGateInput,
  type ProductionGateResult,
  type ProductionGateStatus,
} from "./production-gate";
import type { DeliveryMode } from "./constants";

export function getAppEnvironment(): AppEnvironment {
  return getServerEnv().APP_ENV;
}

/**
 * Builds the gate input from the server environment and the resolved event.
 * An unresolved event is reported as a test event so production stays blocked.
 */
export async function loadProductionGateInput(): Promise<ProductionGateInput> {
  const activeEventCode = getActiveEventCode();
  const resolution = await resolveActiveEvent();
  return {
    appEnv: getAppEnvironment(),
    activeEventCode,
    eventIsTest: resolution.ok ? resolution.event.is_test : true,
  };
}

export async function resolveProductionGate(): Promise<ProductionGateResult> {
  return evaluateProductionGate(await loadProductionGateInput());
}

export async function resolveProductionGateStatus(): Promise<ProductionGateStatus> {
  return describeProductionGate(await loadProductionGateInput());
}

/** Gate for one requested delivery mode; test batches always pass. */
export async function resolveModeGate(
  mode: DeliveryMode
): Promise<ProductionGateResult> {
  return evaluateModeRequest(mode, await loadProductionGateInput());
}
