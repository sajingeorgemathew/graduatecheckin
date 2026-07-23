"use client";

/**
 * The reconciliation preview.
 *
 * Shows every reconciled graduate together with the source orders behind
 * them, so the administrator can see exactly which order paid for which
 * guest before anything is written. A graduate flagged for review cannot be
 * applied until an explicit decision is recorded.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { APPLY_CONFIRMATION_TEXT } from "../constants";
import type {
  OrderRole,
  PreviewGraduate,
  PreviewSourceOrder,
  ProductionImportDetail,
} from "../types";

const ROLE_LABELS: Record<OrderRole, string> = {
  primary: "Primary RSVP",
  supplemental: "Supplemental guest order",
  duplicate_submission: "Likely duplicate submission",
  excluded: "Excluded",
};

const ROLE_STYLES: Record<OrderRole, string> = {
  primary: "bg-navy text-gold-light",
  supplemental: "bg-gold text-navy",
  duplicate_submission: "bg-navy/10 text-navy",
  excluded: "bg-red-100 text-red-800",
};

function money(value: number | null): string {
  if (value === null) {
    return "-";
  }
  return `$${value.toFixed(2)}`;
}

function errorMessageOf(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: { message?: unknown } }).error?.message ===
      "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  return "The request failed.";
}

interface OrderTableProps {
  orders: PreviewSourceOrder[];
}

function OrderTable({ orders }: OrderTableProps) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-navy/15 text-navy/70">
            <th className="py-2 pr-3 font-semibold">Row</th>
            <th className="py-2 pr-3 font-semibold">Order ID</th>
            <th className="py-2 pr-3 font-semibold">Role</th>
            <th className="py-2 pr-3 font-semibold">Guests on this order</th>
            <th className="py-2 pr-3 font-semibold">Kids 0-4</th>
            <th className="py-2 pr-3 font-semibold">Kids 5-10</th>
            <th className="py-2 pr-3 font-semibold">Fee</th>
            <th className="py-2 pr-3 font-semibold">Tax</th>
            <th className="py-2 pr-3 font-semibold">Total</th>
            <th className="py-2 font-semibold">Note</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-navy/5 align-top">
              <td className="py-2 pr-3">{order.sourceRowNumber}</td>
              <td className="py-2 pr-3 font-mono">{order.sourceOrderId}</td>
              <td className="py-2 pr-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_STYLES[order.orderRole]}`}
                >
                  {ROLE_LABELS[order.orderRole]}
                </span>
              </td>
              <td className="py-2 pr-3">
                {[order.guest1Name, order.guest2Name]
                  .filter((name): name is string => name !== null)
                  .join(", ") || "-"}
              </td>
              <td className="py-2 pr-3">{order.kids04}</td>
              <td className="py-2 pr-3">{order.kids510}</td>
              <td className="py-2 pr-3">{money(order.feeTotal)}</td>
              <td className="py-2 pr-3">{money(order.taxTotal)}</td>
              <td className="py-2 pr-3">{money(order.orderTotal)}</td>
              <td className="py-2 max-w-[16rem]">{order.note ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface GraduateCardProps {
  importId: string;
  graduate: PreviewGraduate;
  editable: boolean;
  onSaved: () => void;
}

function GraduateCard({
  importId,
  graduate,
  editable,
  onSaved,
}: GraduateCardProps) {
  const [expanded, setExpanded] = useState(
    graduate.decision === "needs_review"
  );
  const [name, setName] = useState(graduate.canonicalFullName);
  const [email, setEmail] = useState(graduate.email ?? "");
  const [phone, setPhone] = useState(graduate.phone ?? "");
  const [adults, setAdults] = useState(graduate.approvedAdultGuests);
  const [children04, setChildren04] = useState(graduate.approvedChildren04);
  const [children510, setChildren510] = useState(graduate.approvedChildren510);
  const [guestNames, setGuestNames] = useState(
    graduate.approvedAdultGuestNames.join(", ")
  );
  const [note, setNote] = useState(graduate.reconciliationNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partySize = 1 + adults + children04 + children510;

  async function save(decision: "approved" | "excluded" | "needs_review") {
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/production-import/${importId}/graduates/${graduate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            canonicalFullName: name.trim(),
            email: email.trim(),
            phone: phone.trim(),
            gownSize: graduate.gownSize ?? "",
            namePronunciation: graduate.namePronunciation ?? "",
            approvedAdultGuests: adults,
            approvedChildren04: children04,
            approvedChildren510: children510,
            approvedAdultGuestNames: guestNames
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
              .slice(0, adults),
            reconciliationNote: note.trim(),
          }),
        }
      );
      if (!response.ok) {
        setError(errorMessageOf(await response.json()));
        return;
      }
      onSaved();
    } catch {
      setError("The decision could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const decisionBadge =
    graduate.decision === "approved"
      ? "bg-green-100 text-green-900"
      : graduate.decision === "excluded"
        ? "bg-red-100 text-red-800"
        : "bg-gold text-navy";

  return (
    <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-navy">
            {graduate.canonicalFullName}
          </h3>
          <p className="mt-0.5 text-xs text-navy/70">
            {graduate.email ?? "no email recorded"}
            {" · "}
            {graduate.orders.length} source order
            {graduate.orders.length === 1 ? "" : "s"}
            {" · "}approved party of {graduate.approvedPartySize}
            {" · "}
            {money(graduate.orderTotal)} recorded
          </p>
          {graduate.existingRegistrationId !== null && (
            <p className="mt-1 text-xs text-navy/60">
              Matches an existing registration. Applying updates it in place.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${decisionBadge}`}
          >
            {graduate.decision === "needs_review"
              ? "Needs review"
              : graduate.decision === "approved"
                ? "Approved"
                : "Excluded"}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md border border-navy px-3 py-1 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
          >
            {expanded ? "Hide" : "Review"}
          </button>
        </div>
      </div>

      {graduate.reviewReasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {graduate.reviewReasons.map((entry) => (
            <li
              key={entry.code}
              className={
                entry.blocking
                  ? "rounded-md border border-gold bg-cream p-2 text-xs text-navy"
                  : "rounded-md border border-navy/10 bg-white p-2 text-xs text-navy/70"
              }
            >
              {entry.message}
            </li>
          ))}
        </ul>
      )}

      {expanded && (
        <>
          <OrderTable orders={graduate.orders} />

          {editable && (
            <div className="mt-4 rounded-md border border-navy/10 bg-cream p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy/70">
                Approved registration
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-navy">
                  Graduate name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-navy">
                  Email
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-navy">
                  Phone
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
                  />
                </label>
                <label className="text-xs font-semibold text-navy">
                  Approved adult guest names (comma separated)
                  <input
                    value={guestNames}
                    onChange={(event) => setGuestNames(event.target.value)}
                    className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {(
                  [
                    ["Paid adult guests", adults, setAdults],
                    ["Children 0-4 (free)", children04, setChildren04],
                    ["Paid children 5-10", children510, setChildren510],
                  ] as const
                ).map(([label, value, setter]) => (
                  <label key={label} className="text-xs font-semibold text-navy">
                    {label}
                    <select
                      value={value}
                      onChange={(event) => setter(Number(event.target.value))}
                      className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                ))}
              </div>

              <p className="mt-2 text-xs text-navy/70">
                Approved party size: {partySize}. One ticket covers the
                graduate and this whole party.
              </p>

              <label className="mt-3 block text-xs font-semibold text-navy">
                Reconciliation note (required to approve a graduate flagged
                for review)
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
                />
              </label>

              {error !== null && (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800"
                >
                  {error}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save("approved")}
                  className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-gold-light hover:bg-navy-light disabled:opacity-60"
                >
                  Approve this graduate
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save("excluded")}
                  className="rounded-md border border-red-400 px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60"
                >
                  Exclude
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save("needs_review")}
                  className="rounded-md border border-navy px-3 py-2 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:opacity-60"
                >
                  Keep for review
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ReconciliationWorkspace({
  detail,
}: {
  detail: ProductionImportDetail;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const summary = detail.summary;
  const editable = summary.status === "preview_ready";

  const unresolved = useMemo(
    () =>
      detail.graduates.filter(
        (graduate) => graduate.decision === "needs_review"
      ).length,
    [detail.graduates]
  );

  async function apply() {
    if (applying) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/production-import/${summary.importId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmationText: confirmation.trim() }),
        }
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessageOf(payload));
        return;
      }
      setApplied(
        "The import was applied. Generate any missing tickets next, then " +
          "open the Manual Delivery Desk."
      );
      router.refresh();
    } catch {
      setError("The import could not be applied.");
    } finally {
      setApplying(false);
    }
  }

  const cards = [
    ["Source order rows", summary.sourceOrderCount],
    ["Reconciled graduates", summary.graduateCount],
    ["Supplemental guest orders", summary.supplementalOrderCount],
    ["Likely duplicate submissions", summary.duplicateSubmissionCount],
    ["Needing review", summary.needsReviewCount],
    ["Expected tickets", summary.expectedTicketCount],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm"
          >
            <p className="text-2xl font-bold text-navy">{value}</p>
            <p className="mt-1 text-xs text-navy/70">{label}</p>
          </div>
        ))}
      </div>

      {summary.notices.length > 0 && (
        <ul className="space-y-2">
          {summary.notices.map((notice) => (
            <li
              key={notice.code}
              className="rounded-md border border-navy/10 bg-white p-3 text-sm text-navy/80"
            >
              {notice.message}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-4">
        {detail.graduates.map((graduate) => (
          <GraduateCard
            key={graduate.id}
            importId={summary.importId}
            graduate={graduate}
            editable={editable}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>

      {detail.rejected.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5">
          <h3 className="font-semibold text-red-900">
            {detail.rejected.length} row(s) could not be read
          </h3>
          <p className="mt-1 text-sm text-red-800">
            These rows carried no usable order ID or graduate name. They are
            recorded for audit and are never applied.
          </p>
          <OrderTable orders={detail.rejected} />
        </div>
      )}

      {editable && (
        <div className="rounded-lg border border-gold bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-navy">Apply this import</h3>
          <p className="mt-1 text-sm text-navy/75">
            Applying creates at most one registration per reconciled
            graduate and links every source order ID, including supplemental
            guest orders. No ticket, PDF or email is created here. Applying
            the same workbook twice is safe.
          </p>
          {unresolved > 0 && (
            <p className="mt-3 rounded-md border border-gold bg-cream p-3 text-sm text-navy">
              {unresolved} graduate(s) still need a decision. Approve or
              exclude each one before applying.
            </p>
          )}
          <label className="mt-4 block text-xs font-semibold text-navy">
            Type {APPLY_CONFIRMATION_TEXT} to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className="mt-1 w-full max-w-sm rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          {error !== null && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={applying || unresolved > 0}
            onClick={apply}
            className="mt-4 rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applying ? "Applying..." : "Apply production import"}
          </button>
        </div>
      )}

      {applied !== null && (
        <p
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900"
        >
          {applied}
        </p>
      )}
    </div>
  );
}
