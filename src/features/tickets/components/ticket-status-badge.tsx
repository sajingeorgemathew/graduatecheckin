/**
 * Status badge for tickets and registrations. Status is always written
 * out as text so it is never communicated by colour alone.
 */

import type { RegistrationStatus, TicketStatus } from "@/types/database";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  pending: "Pending",
  active: "Active",
  revoked: "Revoked",
  replaced: "Replaced",
};

const TICKET_STATUS_CLASSES: Record<TicketStatus, string> = {
  pending: "bg-navy/10 text-navy",
  active: "bg-navy text-gold-light",
  revoked: "bg-red-100 text-red-900",
  replaced: "bg-gold-light text-navy",
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TICKET_STATUS_CLASSES[status]}`}
    >
      {TICKET_STATUS_LABELS[status]}
    </span>
  );
}

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  eligible: "Eligible",
  review_required: "Review required",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function RegistrationStatusBadge({
  status,
}: {
  status: RegistrationStatus;
}) {
  return (
    <span
      className={
        status === "eligible"
          ? "inline-block rounded-full bg-navy px-2.5 py-0.5 text-xs font-semibold text-gold-light"
          : "inline-block rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-semibold text-navy"
      }
    >
      {REGISTRATION_STATUS_LABELS[status]}
    </span>
  );
}

/** Badge shown for registrations that have no ticket yet. */
export function NoTicketBadge() {
  return (
    <span className="inline-block rounded-full border border-navy/20 bg-white px-2.5 py-0.5 text-xs font-semibold text-navy/60">
      Not generated
    </span>
  );
}
