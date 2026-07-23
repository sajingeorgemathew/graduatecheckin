/**
 * The CHECKIN-10A environment banner shown on every administrator page.
 *
 * Two independent labels, deliberately never merged: the deployment
 * (DEVELOPMENT / TEST, PREVIEW / TEST, PRODUCTION) and the active event
 * (TEST EVENT or PRODUCTION EVENT). A production deployment pointed at the
 * test event must still read TEST EVENT, which is precisely the case an
 * administrator has to be able to see at a glance.
 *
 * Presentation only: it receives an already-evaluated status and reads no
 * environment variable itself.
 */

import type { ProductionGateStatus } from "../production-gate";

export function EnvironmentBanner({ status }: { status: ProductionGateStatus }) {
  const production = status.isProductionDeployment;
  const deploymentTone = production
    ? "bg-emerald-700 text-white"
    : "bg-amber-500 text-navy";
  const eventTone = status.eventIsTest
    ? "bg-sky-100 text-sky-900 border-sky-300"
    : "bg-emerald-100 text-emerald-900 border-emerald-300";

  return (
    <div
      className={`flex flex-wrap items-center gap-3 px-6 py-2 text-xs font-bold uppercase tracking-widest sm:px-10 ${deploymentTone}`}
      data-testid="environment-banner"
    >
      <span>{status.deploymentLabel}</span>
      <span
        className={`rounded border px-2 py-0.5 text-[11px] font-bold tracking-wide ${eventTone}`}
      >
        {status.eventLabel}
      </span>
      <span className="font-mono text-[11px] font-semibold normal-case tracking-normal opacity-90">
        {status.activeEventCode || "no active event configured"}
      </span>
      {!status.productionAllowed && (
        <span className="text-[11px] font-semibold normal-case tracking-normal opacity-90">
          Production sending controls are disabled here.
        </span>
      )}
    </div>
  );
}
