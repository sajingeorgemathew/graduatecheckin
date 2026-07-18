import { describe, expect, it } from "vitest";

import {
  evaluateTicketEligibility,
  isTicketActive,
} from "@/features/tickets/eligibility";

const EVENT_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_EVENT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("ticket eligibility", () => {
  it("allows an eligible registration of the active event", () => {
    const result = evaluateTicketEligibility(
      { registration_status: "eligible", event_id: EVENT_ID },
      EVENT_ID,
      false
    );
    expect(result).toEqual({ eligible: true });
  });

  it("blocks failed registrations", () => {
    expect(
      evaluateTicketEligibility(
        { registration_status: "failed", event_id: EVENT_ID },
        EVENT_ID,
        false
      )
    ).toEqual({ eligible: false, reason: "registration_not_eligible" });
  });

  it("blocks cancelled registrations", () => {
    expect(
      evaluateTicketEligibility(
        { registration_status: "cancelled", event_id: EVENT_ID },
        EVENT_ID,
        false
      )
    ).toEqual({ eligible: false, reason: "registration_not_eligible" });
  });

  it("blocks review-required registrations", () => {
    expect(
      evaluateTicketEligibility(
        { registration_status: "review_required", event_id: EVENT_ID },
        EVENT_ID,
        false
      )
    ).toEqual({ eligible: false, reason: "registration_not_eligible" });
  });

  it("blocks registrations from another event", () => {
    expect(
      evaluateTicketEligibility(
        { registration_status: "eligible", event_id: OTHER_EVENT_ID },
        EVENT_ID,
        false
      )
    ).toEqual({ eligible: false, reason: "wrong_event" });
  });

  it("skips registrations that already hold an active ticket", () => {
    expect(
      evaluateTicketEligibility(
        { registration_status: "eligible", event_id: EVENT_ID },
        EVENT_ID,
        true
      )
    ).toEqual({ eligible: false, reason: "active_ticket_exists" });
  });

  it("never counts revoked or replaced tickets as active", () => {
    expect(isTicketActive("active")).toBe(true);
    expect(isTicketActive("revoked")).toBe(false);
    expect(isTicketActive("replaced")).toBe(false);
    expect(isTicketActive("pending")).toBe(false);
  });
});
