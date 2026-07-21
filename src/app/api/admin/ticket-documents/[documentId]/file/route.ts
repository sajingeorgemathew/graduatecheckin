import { NextResponse } from "next/server";

import { guardFailureResponse } from "@/features/auth/errors";
import { requireAdministrator } from "@/features/auth/guards";
import { getDocument } from "@/features/ticket-documents/repository";
import { documentIdSchema } from "@/features/ticket-documents/schemas";
import { downloadTicketDocument } from "@/features/ticket-documents/storage";
import {
  ticketInternalErrorResponse,
  ticketJsonResponse,
} from "@/features/tickets/http";

/**
 * Authenticated administrator preview and download of a stored PDF.
 *
 * The response streams the exact stored bytes, never a re-rendered or
 * HTML recreation of the document, so a preview always shows precisely
 * what an export would ship. The private storage path is never disclosed
 * and no permanent public URL is produced.
 *
 * ?download=1 forces a save dialog; otherwise the PDF renders inline.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

function structuredError(
  status: number,
  code: string,
  message: string
): NextResponse {
  return ticketJsonResponse({ error: { code, message } }, status);
}

export async function GET(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const guard = await requireAdministrator();
  if (!guard.ok) {
    return guardFailureResponse(guard);
  }

  try {
    const { documentId } = await context.params;
    const parsed = documentIdSchema.safeParse(documentId);
    if (!parsed.success) {
      return structuredError(
        422,
        "invalid_document_id",
        "The document ID is invalid."
      );
    }

    const document = await getDocument(parsed.data);
    if (document === null) {
      return structuredError(
        404,
        "document_not_found",
        "The document was not found."
      );
    }

    const bytes = await downloadTicketDocument(document.storage_path);
    const asDownload =
      new URL(request.url).searchParams.get("download") === "1";
    const disposition = asDownload ? "attachment" : "inline";

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${disposition}; filename="${document.file_name}"`,
        // Private and never cached by a shared proxy.
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return ticketInternalErrorResponse();
  }
}
