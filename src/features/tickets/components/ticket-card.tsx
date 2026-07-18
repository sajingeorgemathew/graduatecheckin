/**
 * Branded digital graduation ticket. Landscape layout in navy, gold,
 * cream and white with a standard black-and-white QR code inside a plain
 * white card. Displays graduate name, event details, party counts and the
 * ticket code only. Emails, phone numbers, source order IDs, guest names,
 * payment details, database UUIDs, token hashes and raw tokens are never
 * rendered here.
 */

import type { TicketStatus } from "@/types/database";
import {
  TICKET_ENTRANCE_MESSAGE,
  TICKET_UNIQUE_MESSAGE,
} from "@/features/tickets/constants";
import { TICKET_STATUS_LABELS } from "./ticket-status-badge";

export interface TicketCardProps {
  graduateName: string;
  eventName: string;
  startsAt: string | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  registeredAdultGuests: number;
  registeredChildren04: number;
  registeredChildren510: number;
  partySize: number;
  ticketCode: string;
  status: TicketStatus;
  /** Same-origin QR image path containing the ticket UUID only. */
  qrSrc: string | null;
}

function formatEventDate(startsAt: string | null, timezone: string): string {
  if (startsAt === null) {
    return "Date to be announced";
  }
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) {
    return "Date to be announced";
  }
  return date.toLocaleString("en-CA", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  });
}

function StatusWatermark({ status }: { status: TicketStatus }) {
  if (status !== "revoked" && status !== "replaced") {
    return null;
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
    >
      <span className="-rotate-12 rounded-lg border-4 border-red-700/70 px-8 py-3 text-5xl font-black uppercase tracking-widest text-red-700/70">
        {TICKET_STATUS_LABELS[status]}
      </span>
    </div>
  );
}

export function TicketCard(props: TicketCardProps) {
  const dimmed = props.status === "revoked" || props.status === "replaced";

  return (
    <article
      aria-label={`Graduate admission ticket, status ${TICKET_STATUS_LABELS[props.status]}`}
      className="ticket-card relative mx-auto w-full max-w-3xl overflow-hidden rounded-xl border-2 border-gold bg-white shadow-md"
    >
      <StatusWatermark status={props.status} />
      <div className={dimmed ? "opacity-60" : undefined}>
        <header className="border-b-4 border-gold bg-navy px-6 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold-light">
            Toronto Academy of Education
          </p>
          <h2 className="mt-1 text-xl font-bold">Graduation Ceremony</h2>
          <p className="text-sm text-white/85">Graduate Admission Ticket</p>
        </header>

        <div className="grid grid-cols-1 gap-6 bg-cream px-6 py-6 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-navy/60">
              Graduate
            </p>
            <p className="mt-1 text-2xl font-bold text-navy">
              {props.graduateName}
            </p>

            <dl className="mt-4 space-y-2 text-sm text-navy">
              <div>
                <dt className="font-semibold">Event</dt>
                <dd>{props.eventName}</dd>
              </div>
              <div>
                <dt className="font-semibold">Date and time</dt>
                <dd>{formatEventDate(props.startsAt, props.timezone)}</dd>
              </div>
              <div>
                <dt className="font-semibold">Venue</dt>
                <dd>
                  {props.venueName ?? "Venue to be announced"}
                  {props.venueAddress !== null && (
                    <span className="block text-navy/70">
                      {props.venueAddress}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg border border-navy/10 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-navy/60">
                Registered party
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-navy sm:grid-cols-4">
                <div>
                  <dt className="text-navy/70">Adult guests</dt>
                  <dd className="font-semibold">{props.registeredAdultGuests}</dd>
                </div>
                <div>
                  <dt className="text-navy/70">Children 0 to 4</dt>
                  <dd className="font-semibold">{props.registeredChildren04}</dd>
                </div>
                <div>
                  <dt className="text-navy/70">Children 5 to 10</dt>
                  <dd className="font-semibold">{props.registeredChildren510}</dd>
                </div>
                <div>
                  <dt className="text-navy/70">Total party</dt>
                  <dd className="font-semibold">{props.partySize}</dd>
                </div>
              </dl>
            </div>

            <p className="mt-4 text-xs text-navy/70">
              Status: {TICKET_STATUS_LABELS[props.status]}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center">
            <div className="rounded-lg border border-navy/10 bg-white p-4 shadow-sm">
              {props.qrSrc !== null ? (
                /* Same-origin protected SVG route; the URL contains the
                   ticket UUID only and next/image adds nothing here. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={props.qrSrc}
                  alt={`QR code for entrance scanning. Ticket code ${props.ticketCode}.`}
                  width={192}
                  height={192}
                  className="h-48 w-48"
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center text-center text-sm text-navy/60">
                  QR not available for this ticket status
                </div>
              )}
            </div>
            <p className="mt-3 font-mono text-lg font-bold tracking-widest text-navy">
              {props.ticketCode}
            </p>
          </div>
        </div>

        <footer className="border-t border-navy/10 bg-white px-6 py-4 text-xs text-navy/75">
          <p>{TICKET_ENTRANCE_MESSAGE}</p>
          <p className="mt-1 font-semibold">{TICKET_UNIQUE_MESSAGE}</p>
        </footer>
      </div>
    </article>
  );
}
