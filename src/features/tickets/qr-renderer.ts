import "server-only";

/**
 * Server-side QR rendering. The QR payload passes through this module in
 * memory only: it is never logged, never written to disk and never placed
 * in a URL. The qrcode package is imported here and nowhere reachable by
 * a browser Client Component.
 */

import QRCode from "qrcode";

/**
 * Renders the QR payload as an SVG string: black modules on a white
 * background, error-correction level Q and a quiet margin. No logo is
 * embedded and the payload never appears as visible text.
 */
export async function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "Q",
    margin: 4,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

/**
 * Adds a large diagonal watermark to a rendered QR SVG for historical
 * previews of revoked or replaced tickets. The watermarked QR is visually
 * marked as not usable.
 */
export function watermarkQrSvg(svg: string, label: string): string {
  const overlay =
    '<g transform="rotate(-30 18 18)">' +
    '<text x="18" y="20" text-anchor="middle" ' +
    'font-family="Arial, sans-serif" font-size="7" font-weight="bold" ' +
    'fill="#b91c1c" fill-opacity="0.75">' +
    label +
    "</text></g>";
  return svg.replace("</svg>", `${overlay}</svg>`);
}
