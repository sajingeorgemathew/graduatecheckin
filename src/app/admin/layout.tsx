import { StaffShell } from "@/features/auth/components/staff-shell";
import { requireAdministratorPage } from "@/features/auth/guards";
import { EnvironmentBanner } from "@/features/distribution/components/environment-banner";
import { resolveProductionGateStatus } from "@/features/distribution/deployment";
import { describeProductionGate } from "@/features/distribution/production-gate";
import { getServerEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

/**
 * Protected administrator shell. Non-administrators are redirected before
 * anything renders; each admin page and API route still performs its own
 * authorization next to the protected operation.
 *
 * CHECKIN-10A: every administrator page carries the deployment and event
 * banner. If the event cannot be resolved the banner still renders, showing
 * the deployment and a test event, so the page never silently loses the
 * production/test distinction.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdministratorPage("/admin");

  let status;
  try {
    status = await resolveProductionGateStatus();
  } catch {
    status = describeProductionGate({
      appEnv: getServerEnv().APP_ENV,
      activeEventCode: "",
      eventIsTest: true,
    });
  }

  return (
    <StaffShell session={session}>
      <EnvironmentBanner status={status} />
      {children}
    </StaffShell>
  );
}
