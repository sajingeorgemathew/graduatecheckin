import { requireStaffPage } from "@/features/auth/guards";
import { AttendanceDashboard } from "@/features/attendance/components/attendance-dashboard";
import { ATTENDANCE_DASHBOARD_PATH } from "@/features/attendance/constants";

export const dynamic = "force-dynamic";

/**
 * Live attendance dashboard page. Authorizes supervisor-level roles
 * server-side independently of the layout and proxy; scanner, anonymous,
 * inactive and password-change-required callers are redirected. All data
 * fetching happens through the private, no-store attendance APIs in the
 * client dashboard component.
 */
export default async function AttendanceDashboardPage() {
  await requireStaffPage(ATTENDANCE_DASHBOARD_PATH, "supervisor");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-bold text-navy">Attendance Dashboard</h1>
      <p className="mt-1 text-sm text-navy/70">
        Monitor arrivals, find registrations, and correct attendance records.
      </p>
      <div className="mt-6">
        <AttendanceDashboard />
      </div>
    </main>
  );
}
