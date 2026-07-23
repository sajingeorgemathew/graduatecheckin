import Link from "next/link";
import { requireAdministratorPage } from "@/features/auth/guards";
import { loadRoster } from "@/features/roster/service";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ search?: string }>;
}

/**
 * The future full graduate roster. Roster candidates are kept apart from
 * event registrations: nobody here holds a ticket until an administrator
 * creates a production registration for them. The roster is not required
 * to send tickets to the current RSVP graduates.
 */
export default async function RosterPage({ searchParams }: PageProps) {
  const session = await requireAdministratorPage("/admin/roster");
  const params = await searchParams;
  const search = (params.search ?? "").slice(0, 120);

  const result = await loadRoster(session, search);

  return (
    <main className="flex flex-1 flex-col bg-cream">
      <div className="border-b-4 border-gold bg-navy px-6 py-8 text-white sm:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h1 className="mt-2 text-2xl font-bold">Graduate roster</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/80">
            The full graduating class, held separately from event
            registrations. A candidate receives no ticket until you create a
            production registration for them.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8 sm:px-10">
        {!result.ok ? (
          <p
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800"
          >
            {result.error.error.message}
          </p>
        ) : (
          <>
            <form method="get" className="flex flex-wrap gap-2">
              <input
                name="search"
                defaultValue={result.data.search}
                placeholder="Search student ID, name, email, phone, program or batch"
                className="w-full max-w-md rounded-md border border-navy/20 bg-white p-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light"
              >
                Search
              </button>
            </form>

            <p className="mt-4 text-sm text-navy/70">
              {result.data.totalCandidates} roster candidate
              {result.data.totalCandidates === 1 ? "" : "s"} recorded.
              {result.data.totalCandidates === 0 &&
                " Import the full roster when it is available; it is not " +
                  "needed to send tickets to the current RSVP graduates."}
            </p>

            {result.data.candidates.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-lg border border-navy/10 bg-white shadow-sm">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-navy/15 text-xs text-navy/70">
                      <th className="p-3 font-semibold">Student ID</th>
                      <th className="p-3 font-semibold">Name</th>
                      <th className="p-3 font-semibold">Email</th>
                      <th className="p-3 font-semibold">Program</th>
                      <th className="p-3 font-semibold">Batch</th>
                      <th className="p-3 font-semibold">Registration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.candidates.map((candidate) => (
                      <tr
                        key={candidate.candidateId}
                        className="border-b border-navy/5"
                      >
                        <td className="p-3 font-mono text-xs">
                          {candidate.studentId ?? "-"}
                        </td>
                        <td className="p-3">{candidate.fullName}</td>
                        <td className="p-3 text-xs">
                          {candidate.email ?? "-"}
                        </td>
                        <td className="p-3 text-xs">
                          {candidate.program ?? "-"}
                        </td>
                        <td className="p-3 text-xs">
                          {candidate.batch ?? "-"}
                        </td>
                        <td className="p-3 text-xs">
                          {candidate.registrationId === null ? (
                            <span className="text-navy/60">
                              Not registered
                            </span>
                          ) : (
                            <Link
                              href={`/admin/tickets/manual-delivery/${candidate.registrationId}`}
                              className="font-semibold text-navy underline"
                            >
                              Open delivery desk
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <p className="mt-8 flex flex-wrap gap-4 text-sm text-navy/60">
          <Link href="/admin/registrations/new" className="underline">
            Add a graduate manually
          </Link>
          <Link href="/admin/tickets/manual-delivery" className="underline">
            Manual Delivery Desk
          </Link>
        </p>
      </div>
    </main>
  );
}
