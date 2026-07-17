import Link from "next/link";
import { requireAdministratorPage } from "@/features/auth/guards";
import { ROLE_LABELS } from "@/features/auth/constants";
import { StaffActions } from "@/features/staff/components/staff-actions";
import {
  listStaffProfiles,
  STAFF_PAGE_SIZE,
} from "@/features/staff/repository";
import {
  staffListFilterSchema,
  staffListPageSchema,
} from "@/features/staff/schemas";
import type { StaffListFilter } from "@/features/staff/types";

export const dynamic = "force-dynamic";

const FILTERS: { value: StaffListFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "scanner", label: "Scanner" },
  { value: "supervisor", label: "Supervisor" },
  { value: "administrator", label: "Administrator" },
];

function formatDate(value: string | null): string {
  if (value === null) {
    return "Never";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

function pageHref(filter: StaffListFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter !== "all") {
    params.set("filter", filter);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query.length > 0 ? `/admin/staff?${query}` : "/admin/staff";
}

interface PageProps {
  searchParams: Promise<{ filter?: string; page?: string }>;
}

export default async function StaffManagementPage({ searchParams }: PageProps) {
  const session = await requireAdministratorPage("/admin/staff");

  const params = await searchParams;
  const filterParsed = staffListFilterSchema.safeParse(params.filter ?? "all");
  const filter: StaffListFilter = filterParsed.success
    ? filterParsed.data
    : "all";
  const pageParsed = staffListPageSchema.safeParse(params.page ?? "1");
  const page = pageParsed.success ? pageParsed.data : 1;

  const { rows, totalCount } = await listStaffProfiles(filter, page);
  const totalPages = Math.max(1, Math.ceil(totalCount / STAFF_PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Staff accounts</h1>
          <p className="mt-1 text-sm text-navy/70">
            {totalCount} account{totalCount === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/admin/staff/new"
          className="inline-block rounded-md bg-navy px-4 py-2 text-center text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light"
        >
          Create staff account
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((entry) => (
          <Link
            key={entry.value}
            href={pageHref(entry.value, 1)}
            className={
              entry.value === filter
                ? "rounded-full bg-navy px-3 py-1 text-xs font-semibold text-gold-light"
                : "rounded-full border border-navy/20 bg-white px-3 py-1 text-xs font-semibold text-navy hover:border-navy"
            }
          >
            {entry.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-lg border border-navy/10 bg-white p-6 text-sm text-navy/70">
          No staff accounts match this filter.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-x-auto rounded-lg border border-navy/10 bg-white shadow-sm lg:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-navy text-gold-light">
                <tr>
                  <th className="px-3 py-2 font-semibold">Name</th>
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Password change</th>
                  <th className="px-3 py-2 font-semibold">Last login</th>
                  <th className="px-3 py-2 font-semibold">Created</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10 text-navy">
                {rows.map((row) => (
                  <tr key={row.user_id}>
                    <td className="px-3 py-2 font-semibold">
                      {row.display_name}
                      {row.user_id === session.userId ? " (you)" : ""}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2">
                      {row.email_snapshot}
                    </td>
                    <td className="px-3 py-2">{ROLE_LABELS[row.role]}</td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          row.is_active
                            ? "rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-gold-light"
                            : "rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy/60"
                        }
                      >
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {row.must_change_password ? "Required" : "Completed"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(row.last_login_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <StaffActions
                        userId={row.user_id}
                        role={row.role}
                        isActive={row.is_active}
                        isSelf={row.user_id === session.userId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:hidden">
            {rows.map((row) => (
              <div
                key={row.user_id}
                className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-navy">
                      {row.display_name}
                      {row.user_id === session.userId ? " (you)" : ""}
                    </p>
                    <p className="break-all text-sm text-navy/70">
                      {row.email_snapshot}
                    </p>
                  </div>
                  <span
                    className={
                      row.is_active
                        ? "rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-gold-light"
                        : "rounded-full bg-navy/10 px-2 py-0.5 text-xs font-semibold text-navy/60"
                    }
                  >
                    {row.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <dl className="mt-3 space-y-1 text-sm text-navy">
                  <div className="flex gap-2">
                    <dt className="w-36 font-semibold">Role</dt>
                    <dd>{ROLE_LABELS[row.role]}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-36 font-semibold">Password change</dt>
                    <dd>{row.must_change_password ? "Required" : "Completed"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-36 font-semibold">Last login</dt>
                    <dd>{formatDate(row.last_login_at)}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-36 font-semibold">Created</dt>
                    <dd>{formatDate(row.created_at)}</dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <StaffActions
                    userId={row.user_id}
                    role={row.role}
                    isActive={row.is_active}
                    isSelf={row.user_id === session.userId}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-3">
          {page > 1 && (
            <Link
              href={pageHref(filter, page - 1)}
              className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              Previous
            </Link>
          )}
          <span className="text-sm text-navy/70">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageHref(filter, page + 1)}
              className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
