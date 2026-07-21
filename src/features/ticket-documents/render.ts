import "server-only";

/**
 * Server-side PDF rendering.
 *
 * The QR image is produced here from the existing CHECKIN-05 token service:
 * this module builds the raw token in memory, renders it to a QR image and
 * discards it. The raw token is never returned, never logged, never written
 * to disk and never included in any snapshot or response. Only the ticket
 * UUID and the rendered PDF bytes leave this module.
 *
 * Rendering uses the Node.js runtime and never touches the network.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { buildQrPayload } from "@/features/tickets/qr-payload";
import { buildTicketToken } from "@/features/tickets/token";

import { loadPrimaryLogo, loadPublicAsset } from "./assets";
import { TICKET_DOCUMENT_HEADING_LINES } from "./constants";
import { TicketDocument } from "./document";
import type {
  RegisteredParty,
  TicketDocumentSettings,
  TicketDocumentWatermark,
  TicketEventDetails,
} from "./types";

/**
 * Renders the secure QR as a PNG data URL.
 *
 * A raster PNG is used rather than SVG because @react-pdf/renderer embeds
 * PNG images losslessly and predictably. The margin gives the QR its quiet
 * zone, and the scale keeps modules crisp when the page is printed.
 */
export async function renderQrPngDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "Q",
    margin: 1,
    scale: 8,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export interface RenderTicketPdfInput {
  ticketId: string;
  ticketCode: string;
  ticketSecret: string;
  settings: TicketDocumentSettings;
  event: TicketEventDetails;
  party: RegisteredParty;
  documentVersion: number;
  issuedAtLabel: string;
  watermark?: TicketDocumentWatermark | null;
}

/**
 * Produces the PDF bytes for one ticket. The returned Buffer is the exact
 * content that gets checksummed, uploaded and later served for preview and
 * download, so preview always shows the stored bytes.
 */
export async function renderTicketPdf(
  input: RenderTicketPdfInput
): Promise<Buffer> {
  // Built in memory from the existing token service and discarded when this
  // function returns. Never persisted and never logged.
  const token = buildTicketToken(input.ticketId, input.ticketSecret);
  const qrImage = await renderQrPngDataUrl(buildQrPayload(token));

  const logoImage = loadPrimaryLogo(input.settings.primaryLogoAsset);
  const secondaryImage =
    input.settings.secondaryAsset === null
      ? null
      : loadPublicAsset(input.settings.secondaryAsset);

  return renderToBuffer(
    TicketDocument({
      heading: TICKET_DOCUMENT_HEADING_LINES,
      settings: input.settings,
      event: input.event,
      party: input.party,
      ticketCode: input.ticketCode,
      documentVersion: input.documentVersion,
      issuedAtLabel: input.issuedAtLabel,
      qrImage,
      logoImage,
      secondaryImage,
      watermark: input.watermark ?? null,
    })
  );
}

/** Number of pages in a rendered PDF. Used by tests and verification. */
export function countPdfPages(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  const matches = text.match(/\/Type\s*\/Page[^s]/g);
  return matches === null ? 0 : matches.length;
}

/** True when the bytes begin with the PDF file signature. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 5)).toString("latin1") === "%PDF-";
}
