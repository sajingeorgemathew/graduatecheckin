"use client";

/**
 * Administrator party editor for one graduate.
 *
 * Raises or lowers the registered party while keeping the exact same ticket
 * and QR. There is no business maximum on any count. Before saving, the
 * administrator sees a before-and-after preview, must give a reason of at
 * least five characters and must confirm they understand the same QR stays
 * active. A fresh idempotency key and a busy state prevent a double submit.
 *
 * On success the server has already updated the live party and generated a
 * new PDF version for the same ticket; the page is refreshed so the summary,
 * email preview, PDF version and delivery status all reflect the change. If
 * the PDF could not be regenerated the save still succeeded: the warning is
 * shown and the desk blocks sending until a new PDF is generated.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ManualDeliveryRow } from "../types";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `party-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  return "The party could not be adjusted.";
}

function partyLine(
  adults: number,
  children04: number,
  children510: number
): string {
  const total = 1 + adults + children04 + children510;
  return (
    `${total} in party — ${adults} adult guest${adults === 1 ? "" : "s"}, ` +
    `${children04} aged 0-4, ${children510} aged 5-10`
  );
}

export function PartyEditor({ row }: { row: ManualDeliveryRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [adultGuestCount, setAdultGuestCount] = useState(row.approvedAdultGuests);
  const [guestNames, setGuestNames] = useState(row.adultGuestNames.join(", "));
  const [children04, setChildren04] = useState(row.approvedChildren04);
  const [children510, setChildren510] = useState(row.approvedChildren510);
  const [reason, setReason] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const names = useMemo(
    () =>
      guestNames
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, adultGuestCount),
    [guestNames, adultGuestCount]
  );

  const namesTooMany =
    guestNames.split(",").map((v) => v.trim()).filter((v) => v.length > 0)
      .length > adultGuestCount;

  const canSubmit =
    !busy && reason.trim().length >= 5 && confirm && !namesTooMany;

  function numberInput(
    label: string,
    value: number,
    setter: (next: number) => void
  ) {
    return (
      <label className="text-xs font-semibold text-navy">
        {label}
        <input
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(event) => {
            const next = Math.floor(Number(event.target.value));
            setter(Number.isFinite(next) && next > 0 ? next : 0);
          }}
          className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
        />
      </label>
    );
  }

  async function submit() {
    if (!canSubmit) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        "/api/admin/tickets/manual-delivery/adjust-party",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId: row.registrationId,
            adultGuestCount,
            adultGuestNames: names,
            children04,
            children510,
            reason,
            paymentNote,
            confirmSameQr: true,
            idempotencyKey: newIdempotencyKey(),
            expectedUpdatedAt: row.registrationUpdatedAt,
          }),
        }
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessageOf(payload));
        return;
      }
      const result = payload as {
        noChange: boolean;
        pdfStatus: string;
        pdfWarning: string | null;
        ticketCode: string | null;
      };
      if (result.noChange) {
        setMessage(
          "The proposed party matches the current party. Nothing was changed."
        );
      } else if (result.pdfStatus === "generation_failed") {
        setMessage(
          result.pdfWarning ??
            "The party was updated and the same QR remains valid, but the " +
              "updated PDF could not be generated. Generate it before sending."
        );
      } else {
        setMessage(
          "The party was updated. The same ticket and QR remain valid and a " +
            "new PDF version was generated."
        );
      }
      setReason("");
      setConfirm(false);
      router.refresh();
    } catch {
      setError("The request failed. The party may not have been changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-navy">Edit registered party</h3>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-md border border-navy px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
        >
          {open ? "Close" : "Edit party"}
        </button>
      </div>

      <p className="mt-1 text-sm text-navy/75">
        The same ticket code{" "}
        <span className="font-mono font-semibold">
          {row.ticketCode ?? "(not generated)"}
        </span>{" "}
        and QR stay active. Current PDF{" "}
        {row.documentVersion === null
          ? "not generated"
          : `version ${row.documentVersion}`}
        , {row.sendCount} recorded send{row.sendCount === 1 ? "" : "s"}.
      </p>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {numberInput("Adult guests", adultGuestCount, setAdultGuestCount)}
            {numberInput("Children aged 0-4", children04, setChildren04)}
            {numberInput("Children aged 5-10", children510, setChildren510)}
          </div>

          <label className="block text-xs font-semibold text-navy">
            Adult guest names (comma separated, up to {adultGuestCount})
            <input
              value={guestNames}
              onChange={(event) => setGuestNames(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          {namesTooMany && (
            <p className="text-xs font-semibold text-red-700">
              More guest names were supplied than adult guests.
            </p>
          )}

          <label className="block text-xs font-semibold text-navy">
            Adjustment reason (required, at least 5 characters)
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. paid for one additional guest, receipt 1042"
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>

          <label className="block text-xs font-semibold text-navy">
            Payment or approval note (optional)
            <input
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>

          <div className="rounded-md border border-navy/15 bg-cream p-3 text-sm text-navy">
            <p className="font-semibold">Before and after</p>
            <p className="mt-1">
              Current: {partyLine(
                row.approvedAdultGuests,
                row.approvedChildren04,
                row.approvedChildren510
              )}
            </p>
            <p className="mt-0.5">
              Proposed: {partyLine(adultGuestCount, children04, children510)}
            </p>
            {names.length > 0 && (
              <p className="mt-0.5 text-navy/70">
                Adult guest names: {names.join(", ")}
              </p>
            )}
          </div>

          <label className="flex items-start gap-2 text-sm text-navy">
            <input
              type="checkbox"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
              className="mt-1"
            />
            <span>
              I understand the same QR code and ticket stay active. Only the
              registered party, the current PDF version and the delivery
              status change.
            </span>
          </label>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Saving..." : "Save party and regenerate PDF"}
          </button>
        </div>
      )}

      {message !== null && (
        <p
          role="status"
          className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900"
        >
          {message}
        </p>
      )}
      {error !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
