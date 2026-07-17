import { StaffShell } from "@/features/auth/components/staff-shell";
import { requireAdministratorPage } from "@/features/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Protected administrator shell. Non-administrators are redirected before
 * anything renders; each admin page and API route still performs its own
 * authorization next to the protected operation.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdministratorPage("/admin");
  return <StaffShell session={session}>{children}</StaffShell>;
}
