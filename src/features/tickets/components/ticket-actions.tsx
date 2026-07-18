"use client";

/**
 * Replace and revoke actions for one active ticket. Both require a
 * reason and the exact confirmation text, prevent double submission and
 * call administrator-only API routes that revalidate the session and
 * eligibility server-side. Responses never contain raw tokens.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  REASON_MAX_LENGTH,
  REASON_MIN_LENGTH,
  REPLACE_CONFIRMATION_TEXT,
  REVOKE_CONFIRMATION_TEXT,
} from "@/features/tickets/constants";

interface TicketActionsProps {
  ticketId: string;
}

function errorMessageFrom(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: { message?: unknown } }).error?.message ===
      "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  return "The ticket action failed.";
}

type ActionKind = "replace" | "revoke";

const ACTION_CONFIG: Record<
  ActionKind,
  { title: string; confirmation: string; button: string; pending: string }
> = {
  replace: {
    title: "Replace Ticket",
    confirmation: REPLACE_CONFIRMATION_TEXT,
    button: "Replace ticket",
    pending: "Replacing...",
  },
  revoke: {
    title: "Revoke Ticket",
    confirmation: REVOKE_CONFIRMATION_TEXT,
    button: "Revoke ticket",
    pending: "Revoking...",
  },
};

export function TicketActions({ ticketId }: TicketActionsProps) {
  const router = useRouter();
  const [openAction, setOpenAction] = useState<ActionKind | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function open(action: ActionKind) {
    setOpenAction(action);
    setReason("");
    setConfirmation("");
    setErrorMessage(null);
  }

  const config = openAction !== null ? ACTION_CONFIG[openAction] : null;
  const reasonValid =
    reason.trim().length >= REASON_MIN_LENGTH &&
    reason.trim().length <= REASON_MAX_LENGTH;
  const canSubmit =
    config !== null &&
    reasonValid &&
    confirmation === config.confirmation &&
    !pending;

  async function submit() {
    if (openAction === null || config === null || !canSubmit) {
      return;
    }
    setPending(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/admin/tickets/${ticketId}/${openAction}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim(),
            confirmationText: confirmation,
          }),
        }
      );
      const payload: unknown = await response.json();
      if (!response.ok) {
        setErrorMessage(errorMessageFrom(payload));
        setPending(false);
        return;
      }
      if (openAction === "replace") {
        const newTicketId =
          typeof payload === "object" &&
          payload !== null &&
          "newTicketId" in payload &&
          typeof (payload as { newTicketId: unknown }).newTicketId === "string"
            ? (payload as { newTicketId: string }).newTicketId
            : null;
        if (newTicketId !== null) {
          router.push(`/admin/tickets/${newTicketId}`);
          return;
        }
      }
      router.refresh();
      setOpenAction(null);
      setPending(false);
    } catch {
      setErrorMessage("The ticket action failed.");
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-navy">Ticket actions</h2>
      <p className="mt-1 text-sm text-navy/70">
        Replacing issues a new ticket with a new QR code and marks this one
        replaced. Revoking invalidates this ticket without a replacement.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => open("replace")}
          disabled={pending}
          className="rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          Replace Ticket
        </button>
        <button
          type="button"
          onClick={() => open("revoke")}
          disabled={pending}
          className="rounded-md border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Revoke Ticket
        </button>
      </div>

      {config !== null && (
        <div className="mt-4 rounded-md border border-gold bg-cream p-4">
          <p className="font-semibold text-navy">{config.title}</p>
          <label
            htmlFor="ticket-action-reason"
            className="mt-3 block text-sm font-semibold text-navy"
          >
            Reason ({REASON_MIN_LENGTH} to {REASON_MAX_LENGTH} characters)
          </label>
          <textarea
            id="ticket-action-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={pending}
            rows={3}
            maxLength={REASON_MAX_LENGTH}
            className="mt-1 w-full rounded-md border border-navy/20 bg-white px-3 py-2 text-sm text-navy"
          />
          <label
            htmlFor="ticket-action-confirmation"
            className="mt-3 block text-sm font-semibold text-navy"
          >
            Type {config.confirmation} to confirm
          </label>
          <input
            id="ticket-action-confirmation"
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={pending}
            autoComplete="off"
            className="mt-1 w-full rounded-md border border-navy/20 bg-white px-3 py-2 font-mono text-sm text-navy"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? config.pending : config.button}
            </button>
            <button
              type="button"
              onClick={() => setOpenAction(null)}
              disabled={pending}
              className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {errorMessage !== null && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
