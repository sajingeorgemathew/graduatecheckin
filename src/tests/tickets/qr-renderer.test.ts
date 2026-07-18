import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildQrPayload } from "@/features/tickets/qr-payload";
import { renderQrSvg, watermarkQrSvg } from "@/features/tickets/qr-renderer";
import { buildTicketToken } from "@/features/tickets/token";

const SECRET = randomBytes(48).toString("base64");
const TICKET_ID = "11111111-2222-4333-8444-555555555555";

describe("qr renderer", () => {
  it("returns valid SVG with black modules on a white background", async () => {
    const payload = buildQrPayload(buildTicketToken(TICKET_ID, SECRET));
    const svg = await renderQrSvg(payload);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("#ffffff");
    expect(svg).toContain("#000000");
  });

  it("never prints the raw payload as visible text in the SVG", async () => {
    const token = buildTicketToken(TICKET_ID, SECRET);
    const payload = buildQrPayload(token);
    const svg = await renderQrSvg(payload);
    expect(svg).not.toContain(payload);
    expect(svg).not.toContain(token);
    expect(svg).not.toContain(TICKET_ID);
  });

  it("adds a visible watermark for historical previews", async () => {
    const payload = buildQrPayload(buildTicketToken(TICKET_ID, SECRET));
    const svg = watermarkQrSvg(await renderQrSvg(payload), "REVOKED");
    expect(svg).toContain("REVOKED");
    expect(svg.endsWith("</svg>") || svg.trimEnd().endsWith("</svg>")).toBe(
      true
    );
  });
});
