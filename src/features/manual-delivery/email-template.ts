/**
 * The personalized branded ticket email.
 *
 * Every graduate gets their own message, generated from their registration
 * and their ticket. Nothing here sends mail: it produces the subject, the
 * rendered HTML the administrator copies as rich text, and a plain-text
 * equivalent.
 *
 * Two rules shape the HTML:
 *
 *  1. The logo must load inside Gmail after a copy and paste, which means
 *     an absolute production URL. A localhost URL would render as a broken
 *     image in every recipient's inbox, so it is never emitted.
 *  2. The administrator copies *rendered* content, not markup. The preview
 *     therefore renders this HTML into the document and the copy action
 *     copies the live selection, so what lands in Gmail is formatted text
 *     rather than visible angle brackets.
 *
 * Runtime-neutral on purpose: no server-only import, no filesystem access
 * and no network call, so the whole template is unit testable.
 */

import {
  ATTACHMENT_INSTRUCTION_PREFIX,
  EMAIL_GUIDANCE_SECTIONS,
  EMAIL_SUBJECT_PREFIX,
  NON_PRODUCTION_HOSTS,
  REPLACEMENT_SUBJECT_PREFIX,
  RESEND_SUBJECT_PREFIX,
} from "./constants";

export type EmailPurpose = "initial" | "resend" | "replacement";

export interface EmailPartyInput {
  graduateName: string;
  adultGuestNames: string[];
  adultGuestCount: number;
  children04Count: number;
  children510Count: number;
  totalPartyCount: number;
}

export interface EmailEventInput {
  title: string;
  dateLabel: string;
  startLabel: string;
  endLabel: string;
  timezone: string;
  venueName: string;
  venueAddress: string;
}

export interface TicketEmailInput {
  purpose: EmailPurpose;
  party: EmailPartyInput;
  event: EmailEventInput;
  ticketCode: string;
  /** The exact PDF file name the administrator must attach. */
  pdfFileName: string | null;
  /** Absolute production URL of the logo, or null when none is configured. */
  logoUrl: string | null;
}

export interface RenderedTicketEmail {
  subject: string;
  html: string;
  text: string;
  /** Visible instruction naming the exact attachment. */
  attachmentInstruction: string;
  /** Set when the message cannot be sent as-is. */
  blockingWarnings: string[];
}

// ---------------------------------------------------------------------
// Absolute logo URL
// ---------------------------------------------------------------------

function isProductionOrigin(baseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return !NON_PRODUCTION_HOSTS.some((blocked) => host === blocked);
}

/**
 * Builds the absolute URL of a committed public asset.
 *
 * Returns null for a development origin. A null logo URL is deliberate:
 * the email still renders with the academy wordmark, and the preview warns
 * the administrator rather than silently pasting a broken image into every
 * graduate's inbox.
 */
export function buildProductionAssetUrl(
  baseUrl: string | null | undefined,
  assetName: string
): string | null {
  const base = (baseUrl ?? "").trim();
  if (base.length === 0 || !isProductionOrigin(base)) {
    return null;
  }
  const normalized = base.replace(/\/+$/, "");
  const safeName = assetName.trim().replace(/^\/+/, "");
  if (safeName.length === 0 || safeName.includes("..")) {
    return null;
  }
  return `${normalized}/${safeName}`;
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildSubject(
  purpose: EmailPurpose,
  graduateName: string
): string {
  const prefix =
    purpose === "resend"
      ? RESEND_SUBJECT_PREFIX
      : purpose === "replacement"
        ? REPLACEMENT_SUBJECT_PREFIX
        : EMAIL_SUBJECT_PREFIX;
  return `${prefix} - ${graduateName}`;
}

/** Human summary of the approved party, used in both renderings. */
export function describeEmailParty(party: EmailPartyInput): string[] {
  const lines = [`${party.graduateName} (graduate)`];
  for (const name of party.adultGuestNames) {
    lines.push(`${name} (adult guest)`);
  }
  const unnamed = party.adultGuestCount - party.adultGuestNames.length;
  if (unnamed > 0) {
    lines.push(`${unnamed} additional adult guest${unnamed === 1 ? "" : "s"}`);
  }
  if (party.children04Count > 0) {
    lines.push(
      `${party.children04Count} child${party.children04Count === 1 ? "" : "ren"} aged 0 to 4`
    );
  }
  if (party.children510Count > 0) {
    lines.push(
      `${party.children510Count} child${party.children510Count === 1 ? "" : "ren"} aged 5 to 10`
    );
  }
  return lines;
}

const NAVY = "#0f2242";
const GOLD = "#c8a349";

/**
 * Renders one graduate's email. The markup uses inline styles and table
 * layout only, because Gmail strips a stylesheet and drops modern layout
 * from pasted content.
 */
export function renderTicketEmail(
  input: TicketEmailInput
): RenderedTicketEmail {
  const party = input.party;
  const event = input.event;
  const partyLines = describeEmailParty(party);
  const blockingWarnings: string[] = [];

  if (input.logoUrl === null) {
    blockingWarnings.push(
      "No absolute production logo URL is configured, so the academy logo " +
        "would not load in the recipient's inbox. Set NEXT_PUBLIC_APP_URL " +
        "to the production site before sending."
    );
  }
  if (input.pdfFileName === null) {
    blockingWarnings.push(
      "No current PDF exists for this ticket. Generate the ticket PDF " +
        "before sending."
    );
  }

  const attachmentInstruction =
    input.pdfFileName === null
      ? `${ATTACHMENT_INSTRUCTION_PREFIX} (no PDF generated yet)`
      : `${ATTACHMENT_INSTRUCTION_PREFIX} ${input.pdfFileName}`;

  const logoBlock =
    input.logoUrl === null
      ? `<div style="font:700 20px/1.3 Georgia,serif;color:${GOLD};letter-spacing:1px;">TORONTO ACADEMY OF EDUCATION</div>`
      : `<img src="${escapeHtml(input.logoUrl)}" alt="Toronto Academy of Education" width="220" style="display:block;width:220px;max-width:100%;height:auto;border:0;" />`;

  const partyHtml = partyLines
    .map(
      (line) =>
        `<li style="margin:0 0 4px 0;">${escapeHtml(line)}</li>`
    )
    .join("");

  // One compact cream box carries every guidance section, so the HTML and
  // the plain text can never drift apart.
  const guidanceHtml = EMAIL_GUIDANCE_SECTIONS.map(
    (section, index) =>
      `<p style="margin:${index === 0 ? "0" : "12px"} 0 2px 0;font:700 13px/1.4 Arial,sans-serif;color:${NAVY};">${escapeHtml(section.heading)}</p>` +
      `<p style="margin:0;font:400 14px/1.5 Arial,sans-serif;color:#20262f;">${escapeHtml(section.body)}</p>`
  ).join("");

  const html = `<div style="margin:0;padding:0;background:#f6f3ec;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f3ec;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:#ffffff;border:1px solid #e3ddd0;">
  <tr>
    <td align="center" style="background:#ffffff;padding:24px 24px 16px 24px;border-bottom:4px solid ${GOLD};">
      ${logoBlock}
    </td>
  </tr>
  <tr>
    <td style="background:${NAVY};padding:18px 24px;">
      <div style="font:700 20px/1.3 Georgia,serif;color:#ffffff;">${escapeHtml(event.title)}</div>
      <div style="font:400 14px/1.5 Arial,sans-serif;color:${GOLD};padding-top:4px;">Graduate &amp; Registered Party Admission Ticket</div>
    </td>
  </tr>
  <tr>
    <td style="padding:24px;font:400 15px/1.6 Arial,sans-serif;color:#20262f;">
      <p style="margin:0 0 14px 0;">Dear ${escapeHtml(party.graduateName)},</p>
      <p style="margin:0 0 14px 0;">
        Congratulations. Your admission ticket for the ${escapeHtml(event.title)}
        is attached to this email as a PDF.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 18px 0;">
        <tr>
          <td style="padding:10px 12px;background:#f6f3ec;border:1px solid #e3ddd0;font:700 13px/1.4 Arial,sans-serif;color:${NAVY};width:38%;">Ticket code</td>
          <td style="padding:10px 12px;border:1px solid #e3ddd0;font:700 15px/1.4 'Courier New',monospace;color:${NAVY};letter-spacing:1px;">${escapeHtml(input.ticketCode)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f6f3ec;border:1px solid #e3ddd0;font:700 13px/1.4 Arial,sans-serif;color:${NAVY};">Admits</td>
          <td style="padding:10px 12px;border:1px solid #e3ddd0;font:400 14px/1.4 Arial,sans-serif;">${party.totalPartyCount} ${party.totalPartyCount === 1 ? "person" : "people"} in total</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f6f3ec;border:1px solid #e3ddd0;font:700 13px/1.4 Arial,sans-serif;color:${NAVY};">Date</td>
          <td style="padding:10px 12px;border:1px solid #e3ddd0;font:400 14px/1.4 Arial,sans-serif;">${escapeHtml(event.dateLabel)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f6f3ec;border:1px solid #e3ddd0;font:700 13px/1.4 Arial,sans-serif;color:${NAVY};">Time</td>
          <td style="padding:10px 12px;border:1px solid #e3ddd0;font:400 14px/1.4 Arial,sans-serif;">${escapeHtml(event.startLabel)} to ${escapeHtml(event.endLabel)} (${escapeHtml(event.timezone)})</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f6f3ec;border:1px solid #e3ddd0;font:700 13px/1.4 Arial,sans-serif;color:${NAVY};">Venue</td>
          <td style="padding:10px 12px;border:1px solid #e3ddd0;font:400 14px/1.4 Arial,sans-serif;">${escapeHtml(event.venueName)}<br />${escapeHtml(event.venueAddress)}</td>
        </tr>
      </table>

      <p style="margin:0 0 6px 0;font:700 14px/1.4 Arial,sans-serif;color:${NAVY};">Your registered party</p>
      <ul style="margin:0 0 18px 0;padding:0 0 0 20px;font:400 14px/1.6 Arial,sans-serif;">${partyHtml}</ul>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 18px 0;">
        <tr>
          <td style="padding:14px 16px;background:#f6f3ec;border:1px solid #e3ddd0;border-left:4px solid ${GOLD};">
            ${guidanceHtml}
          </td>
        </tr>
      </table>

      <p style="margin:0 0 6px 0;">Warm regards,</p>
      <p style="margin:0;font-weight:700;color:${NAVY};">Toronto Academy of Education</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</div>`;

  const text = [
    `Dear ${party.graduateName},`,
    "",
    `Congratulations. Your admission ticket for the ${event.title} is attached to this email as a PDF.`,
    "",
    `Ticket code: ${input.ticketCode}`,
    `Admits: ${party.totalPartyCount} ${party.totalPartyCount === 1 ? "person" : "people"} in total`,
    `Date: ${event.dateLabel}`,
    `Time: ${event.startLabel} to ${event.endLabel} (${event.timezone})`,
    `Venue: ${event.venueName}, ${event.venueAddress}`,
    "",
    "Your registered party:",
    ...partyLines.map((line) => `  - ${line}`),
    "",
    ...EMAIL_GUIDANCE_SECTIONS.flatMap((section) => [
      section.heading.toUpperCase(),
      section.body,
      "",
    ]),
    "Warm regards,",
    "Toronto Academy of Education",
  ].join("\n");

  return {
    subject: buildSubject(input.purpose, party.graduateName),
    html,
    text,
    attachmentInstruction,
    blockingWarnings,
  };
}

/**
 * Builds the Gmail compose deep link. The body is deliberately left out:
 * Gmail's compose URL cannot carry formatted content, so the administrator
 * pastes the rich email instead of receiving a plain-text approximation.
 */
export function buildGmailComposeUrl(
  recipient: string | null,
  subject: string
): string {
  const params = new URLSearchParams({ view: "cm", fs: "1", su: subject });
  if (recipient !== null && recipient.trim().length > 0) {
    params.set("to", recipient.trim());
  }
  return `https://mail.google.com/mail/?${params.toString()}`;
}
