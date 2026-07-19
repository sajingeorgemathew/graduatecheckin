import { describe, expect, it } from "vitest";

import { planSearch } from "@/features/attendance/search-plan";

describe("planSearch name field", () => {
  it("does not search below the minimum length", () => {
    const plan = planSearch("name", "a");
    expect(plan.shouldSearch).toBe(false);
    expect(plan.hint).not.toBeNull();
  });

  it("searches after the minimum length, debounced not immediate", () => {
    const plan = planSearch("name", "av");
    expect(plan.shouldSearch).toBe(true);
    expect(plan.immediate).toBe(false);
    expect(plan.term).toBe("av");
    expect(plan.hint).toBeNull();
  });

  it("trims whitespace before measuring the term", () => {
    expect(planSearch("name", "   ").shouldSearch).toBe(false);
    expect(planSearch("name", "  avery  ").term).toBe("avery");
  });
});

describe("planSearch source id field", () => {
  it("requires at least two characters", () => {
    expect(planSearch("source_id", "1").shouldSearch).toBe(false);
    const plan = planSearch("source_id", "12");
    expect(plan.shouldSearch).toBe(true);
    expect(plan.immediate).toBe(false);
  });
});

describe("planSearch ticket code field", () => {
  it("searches immediately once the complete format is entered", () => {
    const plan = planSearch("ticket_code", "gr26-abcd-efgh");
    expect(plan.shouldSearch).toBe(true);
    expect(plan.immediate).toBe(true);
    expect(plan.term).toBe("GR26-ABCD-EFGH");
  });

  it("does not search a partial ticket code", () => {
    const plan = planSearch("ticket_code", "GR26-AB");
    expect(plan.shouldSearch).toBe(false);
    expect(plan.immediate).toBe(false);
    expect(plan.hint).not.toBeNull();
  });

  it("does not search a code with ambiguous characters", () => {
    // 0, O, 1, I and L are excluded from the alphabet.
    expect(planSearch("ticket_code", "GR26-0OIL-EFGH").shouldSearch).toBe(
      false
    );
  });
});

describe("planSearch empty term", () => {
  it("never searches and shows no hint when the field is empty", () => {
    const plan = planSearch("name", "");
    expect(plan.shouldSearch).toBe(false);
    expect(plan.hint).toBeNull();
    expect(plan.term).toBe("");
  });
});
