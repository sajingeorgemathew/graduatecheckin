import Link from "next/link";
import { requireAdministratorPage } from "@/features/auth/guards";
import { listImportHistory } from "@/features/imports/service";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (value === null) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-CA", { timeZone: "America/Toronto" });
}

export default async function ImportHistoryPage() {
  const session = await requireAdministratorPage("/admin/imports");

  const result = await listImportHistory(session);
  const imports = result.ok ? result.data : [];

  return (
    <main className="flex flex-1 flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-10 text-white sm:px-10">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-2 text-3xl font-bold">Registration imports</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85">
            Administrator workspace for uploading and reviewing registration
            workbooks. Original files are never stored.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-navy">Import history</h2>
          <Link
            href="/admin/imports/new"
            className="inline-block rounded-md bg-navy px-4 py-2 text-center text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light"
          >
            New import
          </Link>
        </div>

        {imports.length === 0 ? (
          <p className="mt-6 rounded-lg border border-navy/10 bg-white p-6 text-sm text-navy/70">
            No imports yet. Upload a registration workbook to create a
            reviewable preview.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-navy/10 bg-white shadow-sm">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-navy text-gold-light">
                <tr>
                  <th className="px-3 py-2 font-semibold">File</th>
                  <th className="px-3 py-2 font-semibold">Uploaded</th>
                  <th className="px-3 py-2 font-semibold">Worksheet</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 text-right font-semibold">Rows</th>
                  <th className="px-3 py-2 text-right font-semibold">New</th>
                  <th className="px-3 py-2 text-right font-semibold">Updated</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Unchanged
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Warnings
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Errors</th>
                  <th className="px-3 py-2 font-semibold">Applied</th>
                  <th className="px-3 py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10 text-navy">
                {imports.map((row) => (
                  <tr key={row.id}>
                    <td className="max-w-[220px] truncate px-3 py-2">
                      {row.original_filename}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-3 py-2">{row.worksheet_name}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">{row.total_rows}</td>
                    <td className="px-3 py-2 text-right">{row.new_rows}</td>
                    <td className="px-3 py-2 text-right">{row.updated_rows}</td>
                    <td className="px-3 py-2 text-right">
                      {row.unchanged_rows}
                    </td>
                    <td className="px-3 py-2 text-right">{row.warning_rows}</td>
                    <td className="px-3 py-2 text-right">{row.error_rows}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatDate(row.applied_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/imports/${row.id}`}
                        className="rounded-md border border-navy px-3 py-1 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
