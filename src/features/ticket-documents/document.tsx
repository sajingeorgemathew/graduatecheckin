/**
 * The branded one-page PDF admission ticket.
 *
 * This is a pure presentation component: it receives fully prepared data
 * and renders it. It performs no database access, no token signing and no
 * asset fetching, and it never touches the network. All styling lives in
 * theme.ts so the design can be retuned without editing this file's
 * structure or any business logic.
 *
 * The page must stay exactly one US Letter portrait page. Every block below
 * is fixed-height or tightly bounded, and the only genuinely variable
 * content (guest names, venue address, schedule titles) is allowed to wrap
 * within a reserved area rather than push the layout onto a second page.
 */

import {
  Document,
  Image,
  Page,
  Text,
  View,
} from "@react-pdf/renderer";
import type { JSX } from "react";

import {
  TICKET_DOCUMENT_COVERAGE_NOTE,
  TICKET_DOCUMENT_VALIDATION_NOTE,
} from "./constants";
import { ticketStyles } from "./theme";
import { hasUnnamedAdultGuests } from "./party";
import type { RegisteredParty, TicketDocumentRenderInput } from "./types";

function PartyLine({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <View style={ticketStyles.partyLine}>
      <Text style={ticketStyles.partyLabel}>{label}</Text>
      <Text style={ticketStyles.partyValue}>{value}</Text>
    </View>
  );
}

/**
 * Renders the registered party. Named adult guests are listed; unnamed
 * guests are represented by the count alone. No empty name line is ever
 * rendered, and long names wrap rather than overflow.
 */
function RegisteredPartySection({
  party,
}: {
  party: RegisteredParty;
}): JSX.Element {
  const unnamedAdults = party.adultGuestCount - party.adultGuestNames.length;

  return (
    <View>
      <Text style={ticketStyles.sectionTitle}>Registered Party</Text>

      <PartyLine label="Graduate" value={String(party.graduateCount)} />
      <PartyLine
        label="Adult guests"
        value={String(party.adultGuestCount)}
      />

      {party.adultGuestNames.map((name, index) => (
        <Text key={`guest-${index}`} style={ticketStyles.guestName}>
          {name}
        </Text>
      ))}
      {hasUnnamedAdultGuests(party) && unnamedAdults > 0 ? (
        <Text style={ticketStyles.guestName}>
          {unnamedAdults === 1
            ? "1 additional adult guest"
            : `${unnamedAdults} additional adult guests`}
        </Text>
      ) : null}

      <PartyLine
        label="Children age 0 to 4"
        value={String(party.children04Count)}
      />
      <PartyLine
        label="Children age 5 to 10"
        value={String(party.children510Count)}
      />

      <View style={ticketStyles.partyTotal}>
        <Text style={ticketStyles.partyTotalLabel}>Total registered party</Text>
        <Text style={ticketStyles.partyTotalValue}>
          {party.totalPartyCount}
        </Text>
      </View>
    </View>
  );
}

function DetailBlock({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}): JSX.Element {
  return (
    <View style={ticketStyles.detailBlock}>
      <Text style={ticketStyles.detailLabel}>{label}</Text>
      <Text
        style={strong ? ticketStyles.detailValueStrong : ticketStyles.detailValue}
      >
        {value}
      </Text>
    </View>
  );
}

export function TicketDocument(input: TicketDocumentRenderInput): JSX.Element {
  const {
    heading,
    settings,
    event,
    party,
    ticketCode,
    documentVersion,
    issuedAtLabel,
    qrImage,
    logoImage,
    watermark,
  } = input;

  const [academyLine, ceremonyLine, admissionLine] = heading;

  return (
    <Document
      title={`${ceremonyLine} admission ticket`}
      author={academyLine}
      subject={admissionLine}
      creator={academyLine}
      producer={academyLine}
    >
      <Page size="LETTER" orientation="portrait" style={ticketStyles.page}>
        {/* Hero band: brand mark and the required three-line heading. */}
        <View style={ticketStyles.hero}>
          {logoImage === null ? null : (
            // The lockup is transparent navy artwork, so it is framed on a
            // white chip; painted straight onto the navy band it would be
            // invisible.
            <View style={ticketStyles.heroLogoChip}>
              {/* @react-pdf/renderer Image renders into a PDF, not the DOM; the
                  jsx-a11y alt-text rule does not apply to it. */}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image style={ticketStyles.heroLogo} src={logoImage} />
            </View>
          )}
          {/* The academy line is always present as text, so the required
              heading survives even if the logo asset is unavailable. */}
          <Text style={ticketStyles.heroAcademy}>{academyLine}</Text>
          <Text style={ticketStyles.heroTitle}>{ceremonyLine}</Text>
          <Text style={ticketStyles.heroSubtitle}>{admissionLine}</Text>
        </View>
        <View style={ticketStyles.heroRule} />

        <View style={ticketStyles.body}>
          <Text style={ticketStyles.description}>{settings.description}</Text>

          {/* Admission row. The QR sits in its own white cell with quiet
              space; nothing is ever drawn behind or across it. */}
          <View style={ticketStyles.admissionRow}>
            <View style={ticketStyles.admissionLeft}>
              <Text style={ticketStyles.admitBadge}>
                Admits {party.totalPartyCount}
              </Text>
              <Text style={ticketStyles.graduateName}>{party.graduateName}</Text>
              <Text style={ticketStyles.coverageNote}>
                {TICKET_DOCUMENT_COVERAGE_NOTE}
              </Text>
              <Text style={ticketStyles.validationNote}>
                {TICKET_DOCUMENT_VALIDATION_NOTE}
              </Text>
            </View>

            <View style={ticketStyles.admissionRight}>
              <View style={ticketStyles.qrHolder}>
                {/* @react-pdf/renderer Image renders into a PDF, not the DOM. */}
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image style={ticketStyles.qrImage} src={qrImage} />
              </View>
              <Text style={ticketStyles.ticketCodeLabel}>Ticket code</Text>
              <Text style={ticketStyles.ticketCode}>{ticketCode}</Text>
              <Text style={ticketStyles.qrCaption}>
                Present this QR code at check-in
              </Text>
            </View>
          </View>

          {/* Two columns: the registered party on the left; the program
              schedule, ceremony facts and instructions on the right. Ceremony
              details sit in the right column so the party column can absorb
              wrapped long guest names without the page overflowing, and so the
              two columns stay balanced. */}
          <View style={ticketStyles.columns}>
            <View style={ticketStyles.columnLeft}>
              <RegisteredPartySection party={party} />
            </View>

            <View style={ticketStyles.columnRight}>
              <Text style={ticketStyles.sectionTitle}>Program Schedule</Text>
              {settings.programSchedule.map((entry, index) => (
                <View key={`schedule-${index}`} style={ticketStyles.scheduleRow}>
                  <Text style={ticketStyles.scheduleTime}>
                    {entry.startTime} - {entry.endTime}
                  </Text>
                  <Text style={ticketStyles.scheduleTitle}>{entry.title}</Text>
                </View>
              ))}

              <View style={{ marginTop: 12 }}>
                <Text style={ticketStyles.sectionTitle}>Ceremony Details</Text>
                <DetailBlock label="Date" value={event.dateLabel} strong />
                <DetailBlock
                  label="Time"
                  value={`${event.startLabel} to ${event.endLabel}`}
                  strong
                />
                <DetailBlock label="Venue" value={event.venueName} />
                <DetailBlock label="Address" value={event.venueAddress} />
              </View>

              {settings.instructions === null ? null : (
                <Text style={ticketStyles.instructions}>
                  {settings.instructions}
                </Text>
              )}
            </View>
          </View>

          <View style={ticketStyles.footer}>
            <Text style={ticketStyles.footerText}>
              Document version V{documentVersion} | Issued {issuedAtLabel}
            </Text>
            <Text style={ticketStyles.footerText}>
              Total registered party: {party.totalPartyCount}
            </Text>
          </View>
        </View>

        {/* Historical previews only. A newly generated current document
            never carries a watermark. */}
        {watermark === null ? null : (
          <Text style={ticketStyles.watermark} fixed>
            {watermark}
          </Text>
        )}
      </Page>
    </Document>
  );
}
