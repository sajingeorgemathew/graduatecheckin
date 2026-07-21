/**
 * Centralized visual styling for the branded PDF admission ticket.
 *
 * Every colour, size and spacing value the document uses lives here, so the
 * design can be retuned later without touching generation, versioning,
 * storage or export logic. Changing the layout meaningfully should also
 * increment TICKET_DOCUMENT_TEMPLATE_VERSION so existing PDFs are detected
 * as stale.
 *
 * Design notes:
 *  - US Letter portrait. The ticket must carry the three-line heading, a
 *    short description, the QR admission block, the registered party, full
 *    event details and a three-entry program schedule, so a portrait page is
 *    the only layout where all required information stays readable on one
 *    page.
 *  - A solid navy hero band carries the brand. The academy logo is a
 *    transparent lockup whose artwork is itself navy, so it is placed on a
 *    white chip inside the band; painted straight onto the navy it would be
 *    invisible. The chip keeps the mark crisp and intentional.
 *  - Typography uses the PDF core Helvetica family. It needs no bundled font
 *    binary, embeds identically on every platform and never touches the
 *    network while rendering.
 *  - Colours are chosen so the page also reads correctly when printed in
 *    black and white: hierarchy comes from weight and size, never from hue
 *    alone.
 */

import { StyleSheet } from "@react-pdf/renderer";

export const ticketPalette = {
  /** Toronto Academy navy, sampled from the academy logo. */
  brandNavy: "#1e3260",
  brandNavyDeep: "#16264a",
  /** Warm tan accent from the logo mark. */
  brandTan: "#c9bc9c",
  ink: "#111827",
  inkMuted: "#4b5563",
  inkFaint: "#6b7280",
  hairline: "#d8dbe1",
  panel: "#f5f6f8",
  panelEdge: "#e2e5ea",
  white: "#ffffff",
  /** Watermarks only. Never used to carry meaning on its own. */
  alert: "#b91c1c",
} as const;

export const ticketFonts = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
  oblique: "Helvetica-Oblique",
} as const;

/**
 * QR sizing. 128pt is about 45mm, comfortably above the ~30mm practical
 * floor for reliable scanning from a phone screen and from paper, at the
 * error-correction level the existing QR renderer uses.
 */
export const ticketQr = {
  size: 112,
  /** White quiet space around the QR. Nothing may be drawn inside it. */
  quietPadding: 8,
} as const;

/** Horizontal page inset. Shared by hero and body so margins line up. */
const PAGE_INSET = 36;

export const ticketStyles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 20,
    paddingHorizontal: 0,
    fontFamily: ticketFonts.regular,
    fontSize: 9.5,
    color: ticketPalette.ink,
    backgroundColor: ticketPalette.white,
  },

  // ---- Hero band -----------------------------------------------------
  hero: {
    backgroundColor: ticketPalette.brandNavy,
    paddingTop: 15,
    paddingBottom: 11,
    paddingHorizontal: PAGE_INSET,
    alignItems: "center",
  },
  /**
   * White plate the logo sits on. The lockup is transparent navy artwork
   * and would vanish if painted straight onto the navy band, so it is
   * always framed on white.
   */
  heroLogoChip: {
    backgroundColor: ticketPalette.white,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  heroLogo: {
    // Intrinsic ratio of the committed lockup is 492 x 166 (~2.96:1). The
    // height is set explicitly from that ratio so the mark never stretches.
    width: 168,
    height: 57,
    objectFit: "contain",
  },
  heroAcademy: {
    fontFamily: ticketFonts.bold,
    fontSize: 11,
    letterSpacing: 2,
    color: ticketPalette.brandTan,
    textTransform: "uppercase",
    textAlign: "center",
  },
  heroTitle: {
    fontFamily: ticketFonts.bold,
    fontSize: 22,
    letterSpacing: 0.4,
    color: ticketPalette.white,
    marginTop: 5,
    textAlign: "center",
  },
  heroSubtitle: {
    fontSize: 10,
    letterSpacing: 0.6,
    color: ticketPalette.brandTan,
    marginTop: 5,
    textAlign: "center",
  },
  heroRule: {
    height: 3,
    backgroundColor: ticketPalette.brandTan,
  },

  // ---- Page body -----------------------------------------------------
  body: {
    paddingHorizontal: PAGE_INSET,
    paddingTop: 12,
  },
  description: {
    fontSize: 9,
    lineHeight: 1.45,
    color: ticketPalette.inkMuted,
    textAlign: "center",
    marginBottom: 2,
  },

  // ---- Admission band: QR beside graduate and party --------------------
  admissionRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 11,
    borderWidth: 1,
    borderColor: ticketPalette.panelEdge,
    borderRadius: 6,
    backgroundColor: ticketPalette.white,
  },
  admissionLeft: {
    // flexBasis 0 forces this column to size from the row rather than from
    // its own content, so long notes wrap inside it instead of spilling
    // across the divider into the QR cell.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  admissionRight: {
    width: ticketQr.size + ticketQr.quietPadding * 2 + 20,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderLeftWidth: 1,
    borderLeftColor: ticketPalette.panelEdge,
    // Explicit white so no tint or decoration sits behind the QR.
    backgroundColor: ticketPalette.white,
  },
  admitBadge: {
    alignSelf: "flex-start",
    fontFamily: ticketFonts.bold,
    fontSize: 8.5,
    letterSpacing: 2,
    color: ticketPalette.white,
    backgroundColor: ticketPalette.brandNavy,
    textTransform: "uppercase",
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 3,
  },
  graduateName: {
    fontFamily: ticketFonts.bold,
    fontSize: 18,
    color: ticketPalette.ink,
    marginTop: 8,
  },
  qrHolder: {
    backgroundColor: ticketPalette.white,
    padding: ticketQr.quietPadding,
    borderWidth: 1,
    borderColor: ticketPalette.panelEdge,
    borderRadius: 4,
  },
  qrImage: {
    width: ticketQr.size,
    height: ticketQr.size,
  },
  qrCaption: {
    fontSize: 7,
    color: ticketPalette.inkFaint,
    marginTop: 6,
    textAlign: "center",
  },
  ticketCodeLabel: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: ticketPalette.inkFaint,
    textTransform: "uppercase",
    marginTop: 8,
    textAlign: "center",
  },
  /**
   * The visible fallback code. Deliberately large and letter-spaced so
   * staff can read and key it in when a QR will not scan.
   */
  ticketCode: {
    fontFamily: ticketFonts.bold,
    fontSize: 13.5,
    letterSpacing: 1.2,
    color: ticketPalette.brandNavy,
    textAlign: "center",
    marginTop: 2,
  },

  // ---- Section scaffolding -------------------------------------------
  sectionTitle: {
    fontFamily: ticketFonts.bold,
    fontSize: 8.5,
    letterSpacing: 1.6,
    color: ticketPalette.brandNavy,
    textTransform: "uppercase",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: ticketPalette.brandTan,
  },
  coverageNote: {
    fontSize: 8.5,
    lineHeight: 1.45,
    color: ticketPalette.ink,
    marginTop: 10,
  },
  partyLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: ticketPalette.hairline,
  },
  partyLabel: {
    fontSize: 9,
    color: ticketPalette.inkMuted,
    flexShrink: 1,
    paddingRight: 8,
  },
  partyValue: {
    fontFamily: ticketFonts.bold,
    fontSize: 9.5,
    color: ticketPalette.ink,
  },
  partyTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: ticketPalette.panel,
  },
  partyTotalLabel: {
    fontFamily: ticketFonts.bold,
    fontSize: 9,
    color: ticketPalette.brandNavy,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  partyTotalValue: {
    fontFamily: ticketFonts.bold,
    fontSize: 13,
    color: ticketPalette.brandNavy,
  },
  guestName: {
    fontSize: 9,
    color: ticketPalette.ink,
    marginTop: 2.5,
    paddingLeft: 10,
    lineHeight: 1.3,
  },

  // ---- Two-column band: event details and schedule --------------------
  columns: {
    flexDirection: "row",
    marginTop: 10,
  },
  columnLeft: {
    width: "48%",
    paddingRight: 16,
  },
  columnRight: {
    width: "52%",
    paddingLeft: 16,
    borderLeftWidth: 1,
    borderLeftColor: ticketPalette.panelEdge,
  },
  detailBlock: {
    marginBottom: 5,
  },
  detailLabel: {
    fontSize: 7,
    letterSpacing: 1.1,
    color: ticketPalette.inkFaint,
    textTransform: "uppercase",
  },
  detailValue: {
    fontSize: 9.5,
    color: ticketPalette.ink,
    marginTop: 2,
    lineHeight: 1.35,
  },
  detailValueStrong: {
    fontFamily: ticketFonts.bold,
    fontSize: 10,
    color: ticketPalette.ink,
    marginTop: 2,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: ticketPalette.hairline,
  },
  scheduleTime: {
    width: 104,
    fontFamily: ticketFonts.bold,
    fontSize: 8.5,
    color: ticketPalette.brandNavy,
    lineHeight: 1.3,
  },
  scheduleTitle: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    fontSize: 9,
    color: ticketPalette.ink,
    lineHeight: 1.3,
  },

  // ---- Fine print ------------------------------------------------------
  instructions: {
    fontSize: 8.5,
    lineHeight: 1.45,
    color: ticketPalette.inkMuted,
    marginTop: 11,
    padding: 10,
    backgroundColor: ticketPalette.panel,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: ticketPalette.brandTan,
  },
  footer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ticketPalette.panelEdge,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7.5,
    color: ticketPalette.inkFaint,
  },
  validationNote: {
    fontSize: 7.5,
    color: ticketPalette.inkMuted,
    marginTop: 8,
    fontFamily: ticketFonts.oblique,
  },

  // ---- Watermark -------------------------------------------------------
  watermark: {
    position: "absolute",
    top: 330,
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: ticketFonts.bold,
    fontSize: 76,
    letterSpacing: 6,
    color: ticketPalette.alert,
    opacity: 0.22,
    transform: "rotate(-22deg)",
  },
});
