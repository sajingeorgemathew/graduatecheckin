/**
 * The workbook contract.
 *
 * The administrator must never have to edit the RSVP export before
 * uploading it, so these tests pin the exact shipped header names and the
 * tolerances around them.
 */

import { describe, expect, it } from "vitest";

import {
  noteIndicatesGuestUpdate,
  RSVP_HEADERS,
} from "@/features/production-import/constants";
import { selectRsvpWorksheet } from "@/features/production-import/header-mapper";
import { buildRsvpWorkbook, freeRow, parseRsvpRows, paidRow } from "./fixtures";

describe("RSVP header contract", () => {
  it("declares the exact uploaded workbook headers", () => {
    expect([...RSVP_HEADERS]).toEqual([
      "order_id",
      "order_date",
      "Status",
      "Full Name",
      "Email",
      "Phone Number",
      "Graduation Gown Size",
      "Name Pronunciation",
      "Guest 1 - Full Name",
      "Guest 2 - Full Name",
      "Kids (0 to 4)",
      "Kids",
      "fee_total",
      "fee_tax_total",
      "order_total",
      "Note",
    ]);
  });

  it("accepts the workbook exactly as exported", () => {
    const selection = selectRsvpWorksheet(
      buildRsvpWorkbook([
        paidRow({
          order_id: "7001",
          "Full Name": "Amara Osei",
          Email: "amara.osei@example.com",
        }),
      ])
    );
    expect(selection.ok).toBe(true);
  });

  it("matches columns by name regardless of order or case", () => {
    const shuffled = [
      "Email",
      "Note",
      "Full Name",
      "order_total",
      "kids",
      "KIDS (0 TO 4)",
      "  Status  ",
      "Guest 2 - Full Name",
      "Guest 1 - Full Name",
      "fee_tax_total",
      "fee_total",
      "Phone Number",
      "Name Pronunciation",
      "Graduation Gown Size",
      "order_date",
      "order_id",
    ];
    const selection = selectRsvpWorksheet(
      buildRsvpWorkbook(
        [
          paidRow({
            order_id: "7002",
            "Full Name": "Nikhil Varma",
            Email: "nikhil.varma@example.com",
            Kids: 1,
          }),
        ],
        shuffled
      )
    );
    expect(selection.ok).toBe(true);
    if (selection.ok) {
      const mapping = selection.selection.mapping;
      expect(mapping.columns["Full Name"]).toBe(shuffled.indexOf("Full Name"));
      expect(mapping.columns["Kids"]).toBe(shuffled.indexOf("kids"));
    }
  });

  it("accepts the older export's Guest 1 and Kids (4 to 10) spellings", () => {
    const legacy = [
      "order_id",
      "status",
      "Full Name",
      "Email",
      "Guest 1",
      "Guest 2",
      "Kids (0 to 4)",
      "Kids (4 to 10)",
      "fee_total",
      "tax_total",
      "order_total",
    ];
    const selection = selectRsvpWorksheet(
      buildRsvpWorkbook([{ order_id: "7003" }], legacy)
    );
    expect(selection.ok).toBe(true);
    if (selection.ok) {
      expect(selection.selection.mapping.columns["Guest 1 - Full Name"]).toBe(
        legacy.indexOf("Guest 1")
      );
      expect(selection.selection.mapping.columns["Kids"]).toBe(
        legacy.indexOf("Kids (4 to 10)")
      );
    }
  });

  it("rejects a workbook with none of the required columns", () => {
    const selection = selectRsvpWorksheet(
      buildRsvpWorkbook([{ order_id: "7004" }], ["a", "b", "c"])
    );
    expect(selection.ok).toBe(false);
    if (!selection.ok) {
      expect(selection.issue.code).toBe("missing_required_headers");
    }
  });

  it("reports a missing optional column as a notice, not a rejection", () => {
    const withoutNote = RSVP_HEADERS.filter((header) => header !== "Note");
    const selection = selectRsvpWorksheet(
      buildRsvpWorkbook(
        [
          paidRow({
            order_id: "7005",
            "Full Name": "Lena Fischer",
            Email: "lena.fischer@example.com",
          }),
        ],
        withoutNote
      )
    );
    expect(selection.ok).toBe(true);
    if (selection.ok) {
      expect(
        selection.selection.notices.map((notice) => notice.code)
      ).toContain("missing_optional_headers");
    }
  });
});

describe("row normalization", () => {
  it("preserves every source order ID and reports worksheet row numbers", () => {
    const parsed = parseRsvpRows([
      freeRow({
        order_id: "8001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
      freeRow({
        order_id: "8002",
        "Full Name": "Nikhil Varma",
        Email: "nikhil.varma@example.com",
      }),
    ]);
    expect(parsed.orders.map((order) => order.sourceOrderId)).toEqual([
      "8001",
      "8002",
    ]);
    // Row 1 is the header, so the first data row is worksheet row 2.
    expect(parsed.orders.map((order) => order.sourceRowNumber)).toEqual([2, 3]);
  });

  it("rejects a row with no order ID rather than inventing one", () => {
    const parsed = parseRsvpRows([
      freeRow({ "Full Name": "Amara Osei", Email: "amara.osei@example.com" }),
    ]);
    expect(parsed.orders).toHaveLength(0);
    expect(parsed.rejected).toHaveLength(1);
    expect(parsed.rejected[0].errors.map((issue) => issue.code)).toContain(
      "missing_order_id"
    );
  });

  it("records whether a child cell was explicitly filled in", () => {
    const parsed = parseRsvpRows([
      freeRow({
        order_id: "8003",
        "Full Name": "Yusuf Rahman",
        Email: "yusuf.rahman@example.com",
        "Kids (0 to 4)": 1,
      }),
      freeRow({
        order_id: "8004",
        "Full Name": "Mei Tanaka",
        Email: "mei.tanaka@example.com",
      }),
    ]);
    expect(parsed.orders[0].kids04Explicit).toBe(true);
    expect(parsed.orders[1].kids04Explicit).toBe(false);
  });

  it("normalizes the email and keeps the source name spelling", () => {
    const parsed = parseRsvpRows([
      freeRow({
        order_id: "8005",
        "Full Name": "  Amara   Osei ",
        Email: "  Amara.Osei@Example.com ",
      }),
    ]);
    expect(parsed.orders[0].email).toBe("amara.osei@example.com");
    expect(parsed.orders[0].graduateFullName).toBe("Amara Osei");
  });
});

describe("guest-update note detection", () => {
  it("recognizes wording that describes another guest or child", () => {
    for (const note of [
      "Adding one more guest",
      "Please add another child",
      "extra guest for the ceremony",
      "guest payment made at the office",
    ]) {
      expect(noteIndicatesGuestUpdate(note), note).toBe(true);
    }
  });

  it("ignores an ordinary comment", () => {
    for (const note of [
      "",
      "Please pronounce the surname as OH-say",
      "Wheelchair access required",
    ]) {
      expect(noteIndicatesGuestUpdate(note), note).toBe(false);
    }
  });
});

describe("test data hygiene", () => {
  it("uses only reserved example domains in the fixtures", () => {
    const parsed = parseRsvpRows([
      paidRow({
        order_id: "9001",
        "Full Name": "Amara Osei",
        Email: "amara.osei@example.com",
      }),
    ]);
    for (const order of parsed.orders) {
      expect(order.email).toMatch(/@example\.com$/);
    }
  });
});
