/**
 * CHECKIN-10A deployment and event gates.
 *
 * Proves that production ticket distribution is available on exactly one
 * combination — the production deployment with the production event active —
 * and is refused everywhere else. Synthetic values only.
 */

import { describe, expect, it } from "vitest";

import {
  APP_ENVIRONMENTS,
  deploymentBannerLabel,
  describeProductionGate,
  evaluateModeRequest,
  evaluateProductionGate,
  eventBannerLabel,
  isProductionDeployment,
  isTestEventCode,
  type AppEnvironment,
  type ProductionGateInput,
} from "@/features/distribution/production-gate";
import {
  DEV_EVENT_CODE,
  PRODUCTION_EVENT_CODE,
} from "@/features/distribution/constants";

function input(overrides: Partial<ProductionGateInput> = {}): ProductionGateInput {
  return {
    appEnv: "production",
    activeEventCode: PRODUCTION_EVENT_CODE,
    eventIsTest: false,
    ...overrides,
  };
}

describe("CHECKIN-10A production gate", () => {
  it("blocks production preparation on local development", () => {
    const gate = evaluateProductionGate(input({ appEnv: "development" }));
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("not_production_deployment");
    }
  });

  it("blocks production preparation on a preview deployment", () => {
    const gate = evaluateProductionGate(input({ appEnv: "preview" }));
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("not_production_deployment");
    }
  });

  it("blocks a production deployment pointed at the test event", () => {
    const gate = evaluateProductionGate(
      input({ activeEventCode: DEV_EVENT_CODE, eventIsTest: true })
    );
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("not_production_event_code");
    }
  });

  it("blocks a production event code that is still flagged as a test event", () => {
    const gate = evaluateProductionGate(input({ eventIsTest: true }));
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.code).toBe("active_event_is_test");
    }
  });

  it("permits production only on the production deployment with the production event", () => {
    expect(evaluateProductionGate(input()).allowed).toBe(true);
  });

  it("permits a test batch from every environment", () => {
    for (const appEnv of APP_ENVIRONMENTS) {
      const gate = evaluateModeRequest(
        "test",
        input({ appEnv, activeEventCode: DEV_EVENT_CODE, eventIsTest: true })
      );
      expect(gate.allowed, appEnv).toBe(true);
    }
  });

  it("refuses a production batch from every non-production environment", () => {
    const blocked: AppEnvironment[] = ["development", "test", "preview"];
    for (const appEnv of blocked) {
      const gate = evaluateModeRequest("production", input({ appEnv }));
      expect(gate.allowed, appEnv).toBe(false);
    }
  });

  it("fails closed when the event cannot be resolved", () => {
    // An unresolved event is reported as a test event by the loader, so the
    // gate must stay shut rather than defaulting open.
    const gate = evaluateProductionGate(
      input({ activeEventCode: "", eventIsTest: true })
    );
    expect(gate.allowed).toBe(false);
  });
});

describe("CHECKIN-10A banners", () => {
  it("labels every deployment, marking development and preview as TEST", () => {
    expect(deploymentBannerLabel("development")).toBe("DEVELOPMENT / TEST");
    expect(deploymentBannerLabel("preview")).toBe("PREVIEW / TEST");
    expect(deploymentBannerLabel("production")).toBe("PRODUCTION");
  });

  it("keeps the event banner independent of the deployment banner", () => {
    // A production deployment pointed at a test event must still read
    // TEST EVENT. This is the case an administrator most needs to see.
    const status = describeProductionGate(
      input({ activeEventCode: DEV_EVENT_CODE, eventIsTest: true })
    );
    expect(status.deploymentLabel).toBe("PRODUCTION");
    expect(status.eventLabel).toBe("TEST EVENT");
    expect(status.productionAllowed).toBe(false);
  });

  it("reads PRODUCTION EVENT only for a non-test event", () => {
    expect(eventBannerLabel(false)).toBe("PRODUCTION EVENT");
    expect(eventBannerLabel(true)).toBe("TEST EVENT");
  });

  it("recognises only the production deployment as production", () => {
    expect(isProductionDeployment("production")).toBe(true);
    for (const appEnv of ["development", "test", "preview"] as AppEnvironment[]) {
      expect(isProductionDeployment(appEnv), appEnv).toBe(false);
    }
  });

  it("keeps GRAD-2026-DEV recognised as the test event code", () => {
    expect(isTestEventCode(DEV_EVENT_CODE)).toBe(true);
    expect(isTestEventCode(PRODUCTION_EVENT_CODE)).toBe(false);
  });

  it("reports a blocked reason whenever production is not allowed", () => {
    const status = describeProductionGate(input({ appEnv: "preview" }));
    expect(status.productionAllowed).toBe(false);
    expect(status.blockedReason).toBeTruthy();
    expect(status.blockedCode).toBe("not_production_deployment");
  });
});
