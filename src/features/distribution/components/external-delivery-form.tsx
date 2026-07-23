"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  EXTERNAL_DELIVERY_CHANNELS,
  EXTERNAL_DELIVERY_CHANNEL_LABELS,
  type ExternalDeliveryChannel,
} from "../constants";

/**
 * Records that a graduate already received their ticket outside this system.
 *
 * This form never sends anything. It writes one audit record whose only
 * operational effect is to take the graduate out of the initial batch while
 * leaving a deliberate resend available.
 */
export function ExternalDeliveryForm({
  registrations,
}: {
  registrations: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [registrationId, setRegistrationId] = useState("");
  const [documentReference, setDocumentReference] = useState("");
  const [previousSendDate, setPreviousSendDate] = useState("");
  const [channel, setChannel] =
    useState<ExternalDeliveryChannel>("office_email");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ready =
    registrationId.length > 0 && previousSendDate.length > 0 && !busy;

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        "/api/admin/tickets/distribution/external-deliveries",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registrationId,
            documentReference,
            previousSendDate,
            channel,
            note,
          }),
        }
      );
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        setMessage(payload.error?.message ?? "Could not record the delivery.");
      } else {
        setMessage(
          "Recorded. This graduate is no longer part of an initial batch. No email was sent."
        );
        setRegistrationId("");
        setDocumentReference("");
        setPreviousSendDate("");
        setNote("");
        router.refresh();
      }
    } catch {
      setMessage("Could not record the delivery.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-navy">
        Graduate
        <select
          className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
          value={registrationId}
          onChange={(event) => setRegistrationId(event.target.value)}
        >
          <option value="">Select a graduate…</option>
          {registrations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-navy">
        Previous send date
        <input
          type="date"
          className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
          value={previousSendDate}
          onChange={(event) => setPreviousSendDate(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold text-navy">
        Channel
        <select
          className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
          value={channel}
          onChange={(event) =>
            setChannel(event.target.value as ExternalDeliveryChannel)
          }
        >
          {EXTERNAL_DELIVERY_CHANNELS.map((value) => (
            <option key={value} value={value}>
              {EXTERNAL_DELIVERY_CHANNEL_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold text-navy">
        Ticket or document reference (optional)
        <input
          type="text"
          maxLength={120}
          className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
          value={documentReference}
          onChange={(event) => setDocumentReference(event.target.value)}
        />
      </label>
      <label className="text-sm font-semibold text-navy sm:col-span-2">
        Note
        <textarea
          maxLength={1000}
          rows={2}
          className="mt-1 w-full rounded-md border border-navy/20 p-2 text-sm"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="How and why this graduate already has their ticket."
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="button"
          disabled={!ready}
          onClick={submit}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Record previous external delivery
        </button>
        {message && (
          <p className="mt-3 text-sm text-navy/80" role="status">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
