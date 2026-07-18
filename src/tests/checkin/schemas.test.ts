import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { confirmCheckinSchema } from "@/features/checkin/schemas";

function baseBody(): Record<string, unknown> {
  return {
    validationAttemptId: randomUUID(),
    requestId: randomUUID(),
    graduateArriving: 1,
    adultGuestsArriving: 1,
    children0To4Arriving: 0,
    children5To10Arriving: 0,
  };
}

describe("confirmCheckinSchema", () => {
  it("accepts a well-formed body", () => {
    expect(confirmCheckinSchema.safeParse(baseBody()).success).toBe(true);
  });

  it("accepts graduate values of zero and one", () => {
    expect(
      confirmCheckinSchema.safeParse({ ...baseBody(), graduateArriving: 0 })
        .success
    ).toBe(true);
    expect(
      confirmCheckinSchema.safeParse({ ...baseBody(), graduateArriving: 1 })
        .success
    ).toBe(true);
  });

  it("rejects a graduate value above one", () => {
    expect(
      confirmCheckinSchema.safeParse({ ...baseBody(), graduateArriving: 2 })
        .success
    ).toBe(false);
  });

  it("rejects negative counts", () => {
    expect(
      confirmCheckinSchema.safeParse({ ...baseBody(), adultGuestsArriving: -1 })
        .success
    ).toBe(false);
  });

  it("rejects decimal counts", () => {
    expect(
      confirmCheckinSchema.safeParse({
        ...baseBody(),
        adultGuestsArriving: 1.5,
      }).success
    ).toBe(false);
  });

  it("rejects excessive counts", () => {
    expect(
      confirmCheckinSchema.safeParse({
        ...baseBody(),
        adultGuestsArriving: 999,
      }).success
    ).toBe(false);
  });

  it("rejects invalid UUIDs", () => {
    expect(
      confirmCheckinSchema.safeParse({
        ...baseBody(),
        validationAttemptId: "not-a-uuid",
      }).success
    ).toBe(false);
    expect(
      confirmCheckinSchema.safeParse({ ...baseBody(), requestId: "nope" })
        .success
    ).toBe(false);
  });

  it("rejects a browser-supplied event id", () => {
    const result = confirmCheckinSchema.safeParse({
      ...baseBody(),
      eventId: randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a browser-supplied ticket id", () => {
    const result = confirmCheckinSchema.safeParse({
      ...baseBody(),
      ticketId: randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a browser-supplied registration id", () => {
    const result = confirmCheckinSchema.safeParse({
      ...baseBody(),
      registrationId: randomUUID(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a browser-supplied actor or role", () => {
    expect(
      confirmCheckinSchema.safeParse({
        ...baseBody(),
        actorUserId: randomUUID(),
      }).success
    ).toBe(false);
    expect(
      confirmCheckinSchema.safeParse({ ...baseBody(), role: "administrator" })
        .success
    ).toBe(false);
  });
});
