"use client";

/**
 * The operator panel for one graduate.
 *
 * This is the screen the administrator lives on while sending tickets:
 * copy the recipient, copy the subject, copy the rendered email, paste it
 * into Gmail, attach the named PDF, send, come back and press Mark
 * manually sent.
 *
 * "Copy rich email" copies *rendered* content, never markup. The preview
 * below is the real rendered email, and the copy writes an HTML clipboard
 * flavour alongside a plain-text one, so pasting into Gmail produces a
 * formatted message rather than visible angle brackets.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { ManualDeliveryDetail } from "../types";
import { PartyEditor } from "./party-editor";

type CopyKey = "recipient" | "subject" | "rich" | "plain" | "filename";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

async function copyPlainText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function OperatorPanel({ detail }: { detail: ManualDeliveryDetail }) {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [gmailMessageId, setGmailMessageId] = useState("");

  const row = detail.row;
  const email = detail.email;

  const flagCopied = useCallback((key: CopyKey) => {
    setCopied(key);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  /**
   * Copies the rendered email. The HTML flavour is what Gmail turns into
   * formatted content; the plain-text flavour is the fallback for clients
   * that refuse HTML. Older browsers without ClipboardItem fall back to
   * selecting the live preview, which also yields rendered content.
   */
  const copyRich = useCallback(async () => {
    try {
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([email.html], { type: "text/html" }),
            "text/plain": new Blob([email.text], { type: "text/plain" }),
          }),
        ]);
        flagCopied("rich");
        return;
      }
    } catch {
      // Fall through to the selection-based copy below.
    }

    const node = previewRef.current;
    if (node === null) {
      setError("The rendered email could not be copied.");
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const succeeded = document.execCommand("copy");
    selection?.removeAllRanges();
    if (succeeded) {
      flagCopied("rich");
    } else {
      setError("The rendered email could not be copied.");
    }
  }, [email.html, email.text, flagCopied]);

  async function post(
    path: string,
    body: Record<string, unknown>,
    successMessage: string,
    advance: boolean
  ) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationId: row.registrationId,
          idempotencyKey: newIdempotencyKey(),
          ...body,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessageOf(payload));
        return;
      }
      setMessage(successMessage);
      if (advance && detail.nextUnsentRegistrationId !== null) {
        router.push(
          `/admin/tickets/manual-delivery/${detail.nextUnsentRegistrationId}`
        );
        return;
      }
      router.refresh();
    } catch {
      setError("The request failed. Nothing was recorded.");
    } finally {
      setBusy(false);
    }
  }

  // An outdated or missing PDF must never be sent: the registration changed
  // after the current PDF was generated, so it no longer matches the party.
  const canRecordSend =
    row.ticketId !== null &&
    row.email !== null &&
    row.pdfStatus === "current";

  /**
   * Regenerates the current PDF for the same, unchanged ticket. Reuses the
   * existing generation endpoint; the ticket, its code and its QR never
   * change. Used to recover after a party adjustment whose PDF step failed.
   */
  async function regeneratePdf() {
    if (busy || row.ticketId === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/ticket-documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: row.ticketId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessageOf(payload));
        return;
      }
      const summary = payload as { generatedCount?: number };
      if ((summary.generatedCount ?? 0) < 1) {
        setError("The updated PDF could not be generated. Try again.");
        return;
      }
      setMessage("A new PDF version was generated for the same ticket.");
      router.refresh();
    } catch {
      setError("The request failed. The PDF was not generated.");
    } finally {
      setBusy(false);
    }
  }

  const copyButton = (
    key: CopyKey,
    label: string,
    action: () => void | Promise<void>,
    disabled = false
  ) => (
    <button
      type="button"
      onClick={() => void action()}
      disabled={disabled}
      className="rounded-md border border-navy px-3 py-2 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
    >
      {copied === key ? "Copied" : label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">{row.graduateName}</h2>
            <p className="mt-1 text-sm text-navy/70">
              {row.email ?? "No email address recorded"}
              {row.phone !== null && ` · ${row.phone}`}
            </p>
            <p className="mt-1 text-sm text-navy/70">
              Approved party of {row.approvedPartySize}:{" "}
              {row.approvedAdultGuests} adult guest
              {row.approvedAdultGuests === 1 ? "" : "s"},{" "}
              {row.approvedChildren04} aged 0-4, {row.approvedChildren510} aged
              5-10
              {row.adultGuestNames.length > 0 &&
                ` (${row.adultGuestNames.join(", ")})`}
            </p>
            <p className="mt-1 text-sm text-navy/70">
              Ticket code:{" "}
              <span className="font-mono font-semibold">
                {row.ticketCode ?? "not generated"}
              </span>
              {" · "}
              {row.checkedIn ? "Checked in" : "Not checked in"}
            </p>
            {row.sourceOrderIds.length > 0 && (
              <p className="mt-1 text-xs text-navy/60">
                Source orders: {row.sourceOrderIds.join(", ")}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-navy/70">
            <p>
              {row.sendCount === 0
                ? "Not sent yet"
                : `${row.sendCount} recorded send${row.sendCount === 1 ? "" : "s"}`}
            </p>
            <Link
              href="/admin/tickets/manual-delivery"
              className="mt-2 inline-block underline"
            >
              Back to the desk
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-md border-2 border-gold bg-cream p-3">
          <p className="text-sm font-semibold text-navy">
            {email.attachmentInstruction}
          </p>
          {row.pdfFileName !== null && (
            <p className="mt-1 font-mono text-xs break-all text-navy/70">
              Version {row.documentVersion} of this graduate&apos;s ticket PDF.
            </p>
          )}
        </div>

        {email.blockingWarnings.length > 0 && (
          <ul className="mt-3 space-y-2">
            {email.blockingWarnings.map((warning) => (
              <li
                key={warning}
                className="rounded-md border border-gold bg-white p-3 text-sm text-navy"
              >
                {warning}
              </li>
            ))}
          </ul>
        )}
      </div>

      <PartyEditor row={row} />

      {row.pdfStatus === "outdated" && (
        <div className="rounded-lg border-2 border-gold bg-cream p-5">
          <p className="text-sm font-semibold text-navy">
            PDF outdated. The registered party changed after the current PDF
            was generated, so the same QR is still valid but this PDF must not
            be sent. Generate the updated PDF before sending or resending.
          </p>
          {row.ticketId !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void regeneratePdf()}
              className="mt-3 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Working..." : "Generate updated PDF"}
            </button>
          )}
        </div>
      )}

      {row.partyUpdatedSinceLastSend && (
        <div className="rounded-lg border border-navy/15 bg-white p-4 text-sm text-navy shadow-sm">
          <p className="font-semibold">Party updated since last send</p>
          <p className="mt-1 text-navy/75">
            {row.resendRecommended
              ? "Updated PDF ready - resend recommended. Record a resend with " +
                "a reason to send the graduate the revised party details. The " +
                "same ticket and QR remain valid."
              : "Generate the updated PDF, then record a resend so the " +
                "graduate receives the revised party details."}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-navy">1. Copy and paste</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {copyButton(
            "recipient",
            "Copy recipient email",
            async () => {
              if (row.email !== null && (await copyPlainText(row.email))) {
                flagCopied("recipient");
              }
            },
            row.email === null
          )}
          {copyButton("subject", "Copy subject", async () => {
            if (await copyPlainText(email.subject)) {
              flagCopied("subject");
            }
          })}
          <button
            type="button"
            onClick={() => void copyRich()}
            className="rounded-md border border-navy px-3 py-2 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
          >
            {copied === "rich" ? "Copied" : "Copy rich email"}
          </button>
          {copyButton("plain", "Copy plain text", async () => {
            if (await copyPlainText(email.text)) {
              flagCopied("plain");
            }
          })}
          {copyButton(
            "filename",
            "Copy PDF file name",
            async () => {
              if (
                row.pdfFileName !== null &&
                (await copyPlainText(row.pdfFileName))
              ) {
                flagCopied("filename");
              }
            },
            row.pdfFileName === null
          )}
          <a
            href={detail.gmailComposeUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md bg-navy px-3 py-2 text-xs font-semibold text-gold-light hover:bg-navy-light"
          >
            Open Gmail compose
          </a>
          {row.documentId !== null && (
            <a
              href={`/api/admin/ticket-documents/${row.documentId}/file`}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-md border border-navy px-3 py-2 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              View / download PDF
            </a>
          )}
          {row.ticketId !== null && (
            <Link
              href={`/admin/tickets/${row.ticketId}`}
              className="rounded-md border border-navy px-3 py-2 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              View ticket
            </Link>
          )}
        </div>
        <p className="mt-3 text-xs text-navy/60">
          Subject: <span className="font-semibold">{email.subject}</span>
        </p>
      </div>

      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-navy">
          2. Rendered email preview
        </h3>
        <p className="mt-1 text-xs text-navy/60">
          This is the message exactly as the graduate will see it. Copy rich
          email copies this rendered content, not its HTML source.
        </p>
        <div
          ref={previewRef}
          className="mt-3 overflow-x-auto rounded-md border border-navy/15"
          // The preview intentionally renders the same HTML the clipboard
          // receives. The content is built entirely server-side from our own
          // template with every interpolated value HTML-escaped; no
          // recipient-supplied markup can reach it.
          dangerouslySetInnerHTML={{ __html: email.html }}
        />
      </div>

      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-navy">
          3. Record what you actually sent
        </h3>
        <p className="mt-1 text-sm text-navy/75">
          Nothing is marked as sent until you confirm it here. The
          application never sends email on your behalf.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-navy">
            Optional note
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-navy">
            Optional Gmail message ID
            <input
              value={gmailMessageId}
              onChange={(event) => setGmailMessageId(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !canRecordSend}
            onClick={() =>
              post(
                "/api/admin/tickets/manual-delivery/mark-sent",
                { note, gmailMessageId },
                "The manual send was recorded.",
                false
              )
            }
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark manually sent
          </button>
          <button
            type="button"
            disabled={busy || !canRecordSend}
            onClick={() =>
              post(
                "/api/admin/tickets/manual-delivery/mark-sent",
                { note, gmailMessageId },
                "The manual send was recorded.",
                true
              )
            }
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            Mark sent and open next unsent
          </button>
        </div>

        <div className="mt-5 border-t border-navy/10 pt-4">
          <label className="block text-xs font-semibold text-navy">
            Reason (required for a resend or a replacement)
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full max-w-xl rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !canRecordSend || reason.trim().length < 5}
              onClick={() =>
                post(
                  "/api/admin/tickets/manual-delivery/resend",
                  { reason, note, gmailMessageId },
                  "The resend was recorded. The ticket is unchanged.",
                  false
                )
              }
              className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Record resend
            </button>
            <button
              type="button"
              disabled={busy || row.ticketId === null || reason.trim().length < 5}
              onClick={() =>
                post(
                  "/api/admin/tickets/manual-delivery/replace",
                  { reason },
                  "A replacement ticket and PDF were issued. The previous " +
                    "QR code no longer validates.",
                  false
                )
              }
              className="rounded-md border border-red-400 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Replace ticket
            </button>
          </div>
          <p className="mt-2 text-xs text-navy/60">
            A resend keeps the same valid ticket. A replacement issues a new
            ticket and PDF and invalidates the previous QR code.
          </p>
        </div>

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

      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-navy">Delivery history</h3>
        {detail.attempts.length === 0 ? (
          <p className="mt-2 text-sm text-navy/70">
            No send has been recorded for this graduate.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {detail.attempts.map((attempt) => (
              <li
                key={attempt.attemptId}
                className="rounded-md border border-navy/10 p-3 text-sm"
              >
                <p className="font-semibold text-navy">
                  Attempt {attempt.attemptNumber} · {attempt.sendKind} ·
                  manual-gmail
                </p>
                <p className="mt-1 text-xs text-navy/70">
                  {new Date(attempt.sentAt).toLocaleString("en-CA", {
                    timeZone: "America/Toronto",
                  })}{" "}
                  · to {attempt.actualRecipient ?? attempt.intendedRecipient} ·
                  ticket {attempt.ticketCode}
                  {attempt.pdfFileName !== null &&
                    ` · ${attempt.pdfFileName} (v${attempt.documentVersion})`}
                </p>
                {attempt.reason !== null && (
                  <p className="mt-1 text-xs text-navy/70">
                    Reason: {attempt.reason}
                  </p>
                )}
                {attempt.note !== null && (
                  <p className="mt-1 text-xs text-navy/70">
                    Note: {attempt.note}
                  </p>
                )}
                <p className="mt-1 text-xs text-navy/60">
                  Recorded by {attempt.recordedByDisplayName ?? "an administrator"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
