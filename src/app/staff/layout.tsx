import { redirect } from "next/navigation";
import { StaffShell } from "@/features/auth/components/staff-shell";
import { ACCESS_DENIED_PATH, LOGIN_PATH } from "@/features/auth/constants";
import { resolveStaffSession } from "@/features/auth/session";

export const dynamic = "force-dynamic";

/**
 * Protected staff shell. The layout blocks anonymous and inactive callers
 * early; each page underneath still performs its own role authorization.
 */
export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const resolution = await resolveStaffSession();
  if (resolution.kind === "anonymous") {
    redirect(LOGIN_PATH);
  }
  if (resolution.kind !== "active") {
    redirect(ACCESS_DENIED_PATH);
  }
  return <StaffShell session={resolution.session}>{children}</StaffShell>;
}
