import { NextResponse } from "next/server";
import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";
import { buildQrPayload } from "@/features/tickets/qr-payload";
import { renderQrSvg, watermarkQrSvg } from "@/features/tickets/qr-renderer";
import { getTicketRow } from "@/features/tickets/repository";
import { ticketIdSchema } from "@/features/tickets/schemas";
import {
  buildTicketToken,
  TicketConfigurationError,
} from "@/features/tickets/token";
import { getServerEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ ticketId: string }>;
}

const QR_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "private, no-store",
} as const;

function structuredError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return ticketJsonResponse({ error: { code, message } }, status);
}

/**
 * Protected QR image. The URL contains the ticket UUID only. The raw
 * token is reconstructed server-side, rendered into the SVG and
 * discarded; it never appears in headers, filenames, URLs, alt text or
 * logs. Revoked and replaced tickets render only as an explicitly
 * watermarked historical preview; pending tickets are rejected.
 */
export async function GET(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { ticketId } = await context.params;
    const parsedId = ticketIdSchema.safeParse(ticketId);
    if (!parsedId.success) {
      return structuredError(422, "invalid_ticket_id", "The ticket ID is invalid.");
    }

    const ticket = await getTicketRow(parsedId.data);
    if (ticket === null) {
      return structuredError(404, "ticket_not_found", "The ticket was not found.");
    }

    if (ticket.status === "pending") {
      return structuredError(
        409,
        "ticket_not_ready",
        "Pending tickets are not ready for QR rendering."
      );
    }

    const historicalView =
      new URL(request.url).searchParams.get("view") === "historical";
    if (ticket.status !== "active" && !historicalView) {
      return structuredError(
        409,
        "ticket_not_active",
        "This ticket is no longer active. Only a watermarked historical " +
          "preview is available."
      );
    }

    const payload = buildQrPayload(
      buildTicketToken(ticket.id, getServerEnv().TICKET_TOKEN_SECRET)
    );
    let svg = await renderQrSvg(payload);
    if (ticket.status !== "active") {
      svg = watermarkQrSvg(svg, ticket.status.toUpperCase());
    }

    return new NextResponse(svg, { status: 200, headers: QR_HEADERS });
  } catch (error) {
    if (error instanceof TicketConfigurationError) {
      return structuredError(
        503,
        "ticket_configuration_invalid",
        "The ticket signing configuration is missing or invalid."
      );
    }
    return ticketInternalErrorResponse();
  }
}
