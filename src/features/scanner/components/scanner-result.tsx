"use client";

/**
 * Accessible result panels for scanner validation responses. Panels show
 * staff-safe fields only: names, ticket codes, statuses and party counts.
 * Raw tokens, token hashes and QR payloads never reach this component.
 */

import type { RegistrationStatus } from "@/types/database";
import type { ScanValidationView } from "../types";

interface ScannerResultProps {
  view: ScanValidationView;
  onScanAnother: () => void;
}

type Tone = "success" | "warning" | "danger" | "info";

const TONE_STYLES: Record<Tone, string> = {
  success: "border-emerald-300 bg-emerald-50",
  warning: "border-amber-300 bg-amber-50",
  danger: "border-red-300 bg-red-50",
  info: "border-navy/20 bg-white",
};

const TONE_HEADING: Record<Tone, string> = {
  success: "text-emerald-900",
  warning: "text-amber-900",
  danger: "text-red-900",
  info: "text-navy",
};

const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  eligible: "Eligible",
  review_required: "Requires review before admission",
  cancelled: "Cancelled",
  failed: "Payment or registration failed",
};

interface PanelContent {
  tone: Tone;
  heading: string;
  message: string;
  showParty: boolean;
}

function panelContent(view: ScanValidationView): PanelContent {
  switch (view.result) {
    case "valid":
      return {
        tone: "success",
        heading: "Valid Ticket",
        message:
          "Ticket verified. Attendance has not yet been confirmed on this " +
          "screen.",
        showParty: true,
      };
    case "partially_checked_in":
      return {
        tone: "warning",
        heading: "Partial Arrival Recorded",
        message:
          "This registration already has attendance activity. Some, but " +
          "not all, of the registered party has been admitted.",
        showParty: true,
      };
    case "already_checked_in":
      return {
        tone: "warning",
        heading: "Already Checked In",
        message:
          "The graduate and the full registered party have already been " +
          "admitted for this registration.",
        showParty: true,
      };
    case "revoked":
      return {
        tone: "danger",
        heading: "Ticket Revoked",
        message:
          "This ticket has been revoked and is not valid. Do not admit " +
          "anyone using this ticket.",
        showParty: false,
      };
    case "replaced":
      return {
        tone: "danger",
        heading: "Ticket Replaced",
        message:
          "This is an old ticket that has been replaced. Do not admit " +
          "anyone using this ticket. Ask the graduate to present their " +
          "latest ticket.",
        showParty: false,
      };
    case "pending":
      return {
        tone: "warning",
        heading: "Ticket Not Ready",
        message:
          "This ticket has not been activated and is not ready for " +
          "admission.",
        showParty: false,
      };
    case "wrong_event":
      return {
        tone: "danger",
        heading: "Different Event",
        message: "This ticket belongs to a different event.",
        showParty: false,
      };
    case "registration_blocked":
      return {
        tone: "danger",
        heading: "Registration Requires Review",
        message:
          "This registration cannot be admitted by the scanner. Send the " +
          "graduate to the help desk.",
        showParty: false,
      };
    case "rate_limited":
      return {
        tone: "warning",
        heading: "Scanner Temporarily Paused",
        message:
          "Too many scans in a short time. Wait briefly, then try again.",
        showParty: false,
      };
    case "invalid":
    case "error":
      return {
        tone: "danger",
        heading: "Invalid Ticket",
        message:
          "This QR code could not be verified as an active graduation " +
          "ticket.",
        showParty: false,
      };
  }
}

function PartyCounts({ view }: { view: ScanValidationView }) {
  const rows = [
    {
      label: "Graduate",
      registered: 1,
      arrived: view.graduateArrived ?? 0,
    },
    {
      label: "Adult guests",
      registered: view.registeredAdultGuests ?? 0,
      arrived: view.adultGuestsArrived ?? 0,
    },
    {
      label: "Children 0 to 4",
      registered: view.registeredChildren0To4 ?? 0,
      arrived: view.children0To4Arrived ?? 0,
    },
    {
      label: "Children 5 to 10",
      registered: view.registeredChildren5To10 ?? 0,
      arrived: view.children5To10Arrived ?? 0,
    },
  ];
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-navy/15 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-cream text-left text-navy">
            <th className="px-3 py-2 font-semibold">Party</th>
            <th className="px-3 py-2 text-right font-semibold">Registered</th>
            <th className="px-3 py-2 text-right font-semibold">Arrived</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-navy/10">
              <td className="px-3 py-2 text-navy">{row.label}</td>
              <td className="px-3 py-2 text-right text-navy">
                {row.registered}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-navy">
                {row.arrived}
              </td>
            </tr>
          ))}
          <tr className="border-t border-navy/15 bg-cream/60">
            <td className="px-3 py-2 font-semibold text-navy">Total</td>
            <td className="px-3 py-2 text-right font-semibold text-navy">
              {view.expectedPartySize ?? 0}
            </td>
            <td className="px-3 py-2 text-right font-semibold text-navy">
              {(view.expectedPartySize ?? 0) - (view.remainingPartySize ?? 0)}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="border-t border-navy/10 px-3 py-2 text-sm font-semibold text-navy">
        Remaining to arrive: {view.remainingPartySize ?? 0}
      </p>
    </div>
  );
}

export function ScannerResult({ view, onScanAnother }: ScannerResultProps) {
  const content = panelContent(view);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border-2 p-5 shadow-sm ${TONE_STYLES[content.tone]}`}
    >
      <h3 className={`text-2xl font-bold ${TONE_HEADING[content.tone]}`}>
        {content.heading}
      </h3>
      <p className="mt-2 text-base text-navy/90">{content.message}</p>

      <dl className="mt-4 space-y-1 text-base text-navy">
        {view.graduateName !== null && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="font-semibold">Graduate</dt>
            <dd>{view.graduateName}</dd>
          </div>
        )}
        {view.ticketCode !== null && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="font-semibold">Ticket code</dt>
            <dd className="font-mono">{view.ticketCode}</dd>
          </div>
        )}
        {view.eventName !== null && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="font-semibold">Event</dt>
            <dd>{view.eventName}</dd>
          </div>
        )}
        {view.result === "registration_blocked" &&
          view.registrationStatus !== null && (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="font-semibold">Registration status</dt>
              <dd>{REGISTRATION_STATUS_LABELS[view.registrationStatus]}</dd>
            </div>
          )}
        {view.result === "replaced" && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="font-semibold">Latest ticket</dt>
            <dd className="font-mono">
              {view.latestReplacementTicketCode ?? "Not available"}
            </dd>
          </div>
        )}
      </dl>

      {content.showParty && <PartyCounts view={view} />}

      <button
        type="button"
        onClick={onScanAnother}
        className="mt-5 min-h-12 w-full rounded-lg bg-navy px-5 py-3 text-base font-semibold text-white hover:bg-navy-light"
      >
        Scan Another Ticket
      </button>
    </div>
  );
}
