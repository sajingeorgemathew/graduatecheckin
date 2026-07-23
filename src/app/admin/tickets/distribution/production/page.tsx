import Link from "next/link";

import { requireAdministratorPage } from "@/features/auth/guards";
import { ExternalDeliveryForm } from "@/features/distribution/components/external-delivery-form";
import {
  PRODUCTION_EVENT_CODE,
  PRODUCTION_NORMAL_RUN_SIZE,
  PRODUCTION_PILOT_RUN_SIZE,
  RESEND_VS_REPLACEMENT_TEXT,
  EXTERNAL_DELIVERY_CHANNEL_LABELS,
  type ExternalDeliveryChannel,
} from "@/features/distribution/constants";
import { resolveProductionGateStatus } from "@/features/distribution/deployment";
import { loadProductionOverview } from "@/features/distribution/production-service";

/**
 * CHECKIN-10A production controls.
 *
 * Read-and-record only: this page shows the production eligibility preview and
 * the production progress panel, and lets an administrator record a delivery
 * that happened outside this system. It sends no email and prepares no batch —
 * preparation stays on the distribution control centre, behind the same gate.
 *
 * Administrator only. When the production gate is closed (development,
 * preview, or a test event) the numbers are still shown, clearly labelled, so
 * an administrator can rehearse reading them without any production control
 * being available.
 */
export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string | number;
  tone?: "plain" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-navy";
  return (
    <div className="rounded-lg border border-navy/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy/50">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : "—";
}

export default async function ProductionControlsPage() {
  await requireAdministratorPage("/admin/tickets/distribution/production");
  const gate = await resolveProductionGateStatus();
  const result = await loadProductionOverview();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-10">
      <Link
        href="/admin/tickets/distribution"
        className="text-sm font-semibold text-navy/70 hover:text-navy"
      >
        ← Ticket distribution
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Production controls</h1>
          <p className="mt-1 text-sm text-navy/70">
            Everything on this page is about real graduates. Read the
            eligibility preview before preparing any batch.
          </p>
        </div>
        <Link
          href="/admin/tickets/distribution/runbook"
          className="rounded-md border border-navy/20 bg-white px-4 py-2 text-sm font-semibold text-navy hover:border-navy/40"
        >
          Operator runbook
        </Link>
      </div>

      {!gate.productionAllowed && (
        <p
          className="mt-4 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-navy"
          data-testid="production-gate-notice"
        >
          {gate.blockedReason} Figures below are shown for reference only.
        </p>
      )}

      {!result.ok ? (
        <p className="mt-6 rounded-md border border-gold bg-gold/10 p-4 text-sm text-navy">
          {result.message}
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-navy/70">
            Active event: <strong>{result.data.eventCode}</strong> —{" "}
            {result.data.eventTitle}.{" "}
            {result.data.isProductionEvent
              ? `This is the production event (${PRODUCTION_EVENT_CODE}).`
              : "This is not the production event, so production counters stay empty."}
          </p>

          {/* ---- Production progress panel ---- */}
          <section className="mt-8">
            <h2 className="text-lg font-bold text-navy">Production progress</h2>
            <p className="mt-1 text-sm text-navy/70">
              Counted from production batches only. Test batches never appear
              here.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat
                label="Total deliveries"
                value={result.data.progress.totalDeliveries}
              />
              <Stat
                label="Production sent"
                value={result.data.progress.productionSent}
                tone="good"
              />
              <Stat
                label="Failed"
                value={result.data.progress.failed}
                tone={result.data.progress.failed > 0 ? "warn" : "plain"}
              />
              <Stat label="Bounced" value={result.data.progress.bounced} />
              <Stat
                label="Resend required"
                value={result.data.progress.resendRequired}
              />
              <Stat
                label="Remaining prepared"
                value={result.data.progress.remainingPrepared}
              />
              <Stat
                label="Last run attempted"
                value={result.data.progress.lastRunAttempted}
              />
              <Stat
                label="Last run sent"
                value={result.data.progress.lastRunSent}
              />
              <Stat
                label="Last run failed"
                value={result.data.progress.lastRunFailed}
              />
              <Stat
                label="Attempts awaiting import"
                value={result.data.progress.awaitingResultImport}
                tone={
                  result.data.progress.awaitingResultImport > 0
                    ? "warn"
                    : "good"
                }
              />
            </div>
            <p className="mt-3 text-sm text-navy/70">
              Last send attempt:{" "}
              {formatTime(result.data.progress.lastSendAttemptAt)} · Last
              results imported:{" "}
              {formatTime(result.data.progress.lastResultsImportedAt)}
            </p>
            <p className="mt-2 text-sm text-navy/70">
              The daily email quota is reported by the Google Sheet, not by this
              application. Use “Show Remaining Email Quota” in the workbook.
            </p>
          </section>

          {/* ---- Result checkpoint ---- */}
          <section className="mt-8">
            <h2 className="text-lg font-bold text-navy">Result checkpoint</h2>
            {result.data.progress.awaitingResultImport > 0 ? (
              <p
                className="mt-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-navy"
                data-testid="unimported-results-warning"
              >
                {result.data.progress.awaitingResultImport} prepared{" "}
                {result.data.progress.awaitingResultImport === 1
                  ? "delivery is"
                  : "deliveries are"}{" "}
                in a production batch whose results have never been imported. Do
                not start another send run. Export the results from the workbook
                and import them first, then check these counts again.
              </p>
            ) : (
              <p className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-navy">
                No production attempts are waiting to be imported. It is safe to
                continue with the next run.
              </p>
            )}
            <p className="mt-2 text-sm text-navy/70">
              After every run: Send → Export New Results for Active Batch →
              Import results → verify these counts → continue.
            </p>
          </section>

          {/* ---- Eligibility preview ---- */}
          <section className="mt-8">
            <h2 className="text-lg font-bold text-navy">
              Production eligibility preview
            </h2>
            <p className="mt-1 text-sm text-navy/70">
              Every registration falls into exactly one category. No
              registration may sit in two open production batches for the same
              purpose.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat
                label="Total registrations"
                value={result.data.summary.totalRegistrations}
              />
              <Stat
                label="Eligible for initial delivery"
                value={result.data.summary.eligibleForInitial}
                tone="good"
              />
              <Stat
                label="Already production sent"
                value={result.data.summary.alreadyProductionSent}
              />
              <Stat
                label="Previously sent externally"
                value={result.data.summary.previouslySentExternally}
              />
              <Stat
                label="Invalid or missing email"
                value={result.data.summary.invalidEmail}
                tone={result.data.summary.invalidEmail > 0 ? "warn" : "plain"}
              />
              <Stat
                label="In an open production batch"
                value={result.data.summary.inOpenProductionBatch}
              />
              <Stat
                label="Cancelled or suppressed"
                value={result.data.summary.cancelledOrSuppressed}
              />
              <Stat
                label="Replacement required"
                value={result.data.summary.replacementRequired}
                tone={
                  result.data.summary.replacementRequired > 0 ? "warn" : "plain"
                }
              />
              <Stat
                label="No current ticket or PDF"
                value={result.data.summary.notReady}
              />
              <Stat
                label="Resend eligible"
                value={result.data.summary.resendEligible}
              />
              <Stat
                label="Failed-retry eligible"
                value={result.data.summary.retryEligible}
              />
            </div>
            <div className="mt-4 rounded-lg border border-navy/10 bg-white p-4 text-sm text-navy/80">
              <p className="font-semibold text-navy">Batches you can prepare</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Initial production batch</strong> — the{" "}
                  {result.data.summary.eligibleForInitial} graduates who have
                  never received a ticket from this system or any other way.
                </li>
                <li>
                  <strong>Selected resend batch</strong> — the same valid ticket
                  sent again. A reason is required.
                </li>
                <li>
                  <strong>Failed-delivery retry batch</strong> — the{" "}
                  {result.data.summary.retryEligible} deliveries whose last
                  production attempt failed or bounced.
                </li>
                <li>
                  <strong>Replacement batch</strong> — a new ticket that
                  invalidates the old one. A reason is required.
                </li>
              </ul>
              <p className="mt-3 font-semibold text-navy">
                {RESEND_VS_REPLACEMENT_TEXT}
              </p>
            </div>
          </section>

          {/* ---- Safe run sizes ---- */}
          <section className="mt-8">
            <h2 className="text-lg font-bold text-navy">Safe run sizes</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-navy/10 bg-white p-4 text-sm text-navy/80">
                <p className="font-semibold text-navy">
                  Send {PRODUCTION_PILOT_RUN_SIZE}-Recipient Production Pilot
                </p>
                <p className="mt-1">
                  Sends at most {PRODUCTION_PILOT_RUN_SIZE} prepared rows, then
                  stops. It never continues on its own. Export and import the
                  results and verify them before any larger run.
                </p>
              </div>
              <div className="rounded-lg border border-navy/10 bg-white p-4 text-sm text-navy/80">
                <p className="font-semibold text-navy">
                  Send Next {PRODUCTION_NORMAL_RUN_SIZE}
                </p>
                <p className="mt-1">
                  Sends at most {PRODUCTION_NORMAL_RUN_SIZE} prepared rows. Each
                  row is written back the instant it succeeds or fails, so an
                  interrupted run resumes on the remaining rows only and never
                  re-sends a successful one.
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-navy/70">
              Both runs happen in the production Google Sheet, not here. Both
              require you to type the exact active batch code first.
            </p>
          </section>

          {/* ---- Previous external delivery ---- */}
          <section className="mt-8">
            <h2 className="text-lg font-bold text-navy">
              Record previous external delivery
            </h2>
            <p className="mt-1 text-sm text-navy/70">
              For a graduate who already has their ticket by some other route.
              This records history only: it sends nothing, creates no send
              attempt, and the system never claims it sent that email. The
              graduate leaves the initial batch and a deliberate resend stays
              available.
            </p>
            <ExternalDeliveryForm registrations={result.data.registrations} />

            <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-navy/60">
              Recorded external deliveries ({result.data.externalDeliveries.length})
            </h3>
            {result.data.externalDeliveries.length === 0 ? (
              <p className="mt-2 text-sm text-navy/70">
                No external deliveries have been recorded.
              </p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-navy/10 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy/5 text-xs uppercase tracking-wide text-navy/60">
                    <tr>
                      <th className="p-3">Graduate</th>
                      <th className="p-3">Sent on</th>
                      <th className="p-3">Channel</th>
                      <th className="p-3">Reference</th>
                      <th className="p-3">Recorded by</th>
                      <th className="p-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.externalDeliveries.map((row) => (
                      <tr key={row.id} className="border-t border-navy/10">
                        <td className="p-3 font-semibold text-navy">
                          {row.graduateName}
                        </td>
                        <td className="p-3">{row.previousSendDate}</td>
                        <td className="p-3">
                          {EXTERNAL_DELIVERY_CHANNEL_LABELS[
                            row.channel as ExternalDeliveryChannel
                          ] ?? row.channel}
                        </td>
                        <td className="p-3">{row.documentReference || "—"}</td>
                        <td className="p-3">{row.recordedBy}</td>
                        <td className="p-3 text-navy/70">{row.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
