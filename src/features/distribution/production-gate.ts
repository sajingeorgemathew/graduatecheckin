/**
 * CHECKIN-10A production cutover gates.
 *
 * Pure, runtime-neutral decisions about whether production ticket
 * distribution may be prepared or exported at all. Nothing here touches the
 * database, the network or a secret, so every branch is directly testable and
 * the same rules can be rendered in the browser and enforced on the server.
 *
 * The central rule: production controls exist only when BOTH the deployment
 * is the production deployment AND the configured active event is the
 * production event. Local development and Vercel Preview can never prepare or
 * export a production sending package, no matter what an administrator does
 * in the UI.
 */

import { DEV_EVENT_CODE, PRODUCTION_EVENT_CODE } from "./constants";
import type { DeliveryMode } from "./constants";

/** The deployment environments the application recognises. */
export const APP_ENVIRONMENTS = [
  "development",
  "test",
  "preview",
  "production",
] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/**
 * The banner every administrator page must show. Development, automated test
 * and preview deployments are all labelled as TEST so nobody can mistake a
 * preview URL for the live system.
 */
export const DEPLOYMENT_BANNER_LABELS: Record<AppEnvironment, string> = {
  development: "DEVELOPMENT / TEST",
  test: "TEST",
  preview: "PREVIEW / TEST",
  production: "PRODUCTION",
};

export function deploymentBannerLabel(appEnv: AppEnvironment): string {
  return DEPLOYMENT_BANNER_LABELS[appEnv];
}

/** True only for the one deployment that is allowed to send real tickets. */
export function isProductionDeployment(appEnv: AppEnvironment): boolean {
  return appEnv === "production";
}

/**
 * The event banner is deliberately separate from the deployment banner: a
 * production deployment pointed at the test event must still read TEST EVENT.
 */
export function eventBannerLabel(eventIsTest: boolean): string {
  return eventIsTest ? "TEST EVENT" : "PRODUCTION EVENT";
}

export type ProductionGateFailureCode =
  | "not_production_deployment"
  | "not_production_event_code"
  | "active_event_is_test";

export const PRODUCTION_GATE_MESSAGES: Record<
  ProductionGateFailureCode,
  string
> = {
  not_production_deployment:
    "Production distribution is only available on the production deployment. This deployment is for testing.",
  not_production_event_code: `Production distribution requires the active event to be ${PRODUCTION_EVENT_CODE}.`,
  active_event_is_test:
    "The active graduation event is a test event. Production distribution is blocked.",
};

export interface ProductionGateInput {
  appEnv: AppEnvironment;
  /** The configured ACTIVE_GRADUATION_EVENT_CODE, already trimmed. */
  activeEventCode: string;
  /** The resolved event's is_test flag, when the event has been loaded. */
  eventIsTest: boolean;
}

export type ProductionGateResult =
  | { allowed: true }
  | { allowed: false; code: ProductionGateFailureCode; message: string };

function deny(code: ProductionGateFailureCode): ProductionGateResult {
  return { allowed: false, code, message: PRODUCTION_GATE_MESSAGES[code] };
}

/**
 * The single production gate. Checked in this order so the most fundamental
 * reason is the one reported: wrong deployment, then wrong event code, then a
 * test event carrying the production code (a misconfiguration).
 */
export function evaluateProductionGate(
  input: ProductionGateInput
): ProductionGateResult {
  if (!isProductionDeployment(input.appEnv)) {
    return deny("not_production_deployment");
  }
  if (input.activeEventCode.trim() !== PRODUCTION_EVENT_CODE) {
    return deny("not_production_event_code");
  }
  if (input.eventIsTest) {
    return deny("active_event_is_test");
  }
  return { allowed: true };
}

/**
 * Gate applied to one requested delivery mode. A test batch is always
 * permitted (it never reaches a graduate); a production batch must pass the
 * full production gate.
 */
export function evaluateModeRequest(
  mode: DeliveryMode,
  input: ProductionGateInput
): ProductionGateResult {
  if (mode === "test") {
    return { allowed: true };
  }
  return evaluateProductionGate(input);
}

/**
 * A test event must never be converted into a production event. This guard is
 * a readable assertion of that rule for the surfaces that display both codes.
 */
export function isTestEventCode(eventCode: string): boolean {
  return eventCode.trim() === DEV_EVENT_CODE;
}

export interface ProductionGateStatus {
  appEnv: AppEnvironment;
  deploymentLabel: string;
  isProductionDeployment: boolean;
  activeEventCode: string;
  eventIsTest: boolean;
  eventLabel: string;
  productionAllowed: boolean;
  blockedReason: string | null;
  blockedCode: ProductionGateFailureCode | null;
}

/** Presentation shape used by the banner, the control panels and the tests. */
export function describeProductionGate(
  input: ProductionGateInput
): ProductionGateStatus {
  const gate = evaluateProductionGate(input);
  return {
    appEnv: input.appEnv,
    deploymentLabel: deploymentBannerLabel(input.appEnv),
    isProductionDeployment: isProductionDeployment(input.appEnv),
    activeEventCode: input.activeEventCode,
    eventIsTest: input.eventIsTest,
    eventLabel: eventBannerLabel(input.eventIsTest),
    productionAllowed: gate.allowed,
    blockedReason: gate.allowed ? null : gate.message,
    blockedCode: gate.allowed ? null : gate.code,
  };
}
