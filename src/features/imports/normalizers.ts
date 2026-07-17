/**
 * Strict server-side normalization utilities for imported cell values.
 *
 * Each normalizer is a pure function returning a value plus structured
 * issues. Issue messages never contain names, emails, phone numbers or
 * payment amounts.
 */

import type { PaymentStatus, RegistrationStatus } from "@/types/database";
import {
  MAX_CHILDREN_PER_GROUP,
  MAX_PHONE_DIGITS,
  MIN_PHONE_DIGITS,
} from "./constants";
import type { CellValue, ImportIssue } from "./types";

export interface NormalizedValue<T> {
  value: T;
  errors: ImportIssue[];
  warnings: ImportIssue[];
}

function ok<T>(value: T): NormalizedValue<T> {
  return { value, errors: [], warnings: [] };
}

function cellToText(cell: CellValue): string {
  if (cell === null) {
    return "";
  }
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  return String(cell).trim();
}

function collapseSpaces(text: string): string {
  return text.replace(/[ \t]+/g, " ").trim();
}

/** Order ID: required, numeric or text, trimmed text output. */
export function normalizeOrderId(cell: CellValue): NormalizedValue<string | null> {
  const text = cellToText(cell);
  if (text.length === 0) {
    return {
      value: null,
      errors: [
        { code: "missing_order_id", message: "The order ID is required." },
      ],
      warnings: [],
    };
  }
  return ok(text);
}

/** Full name: required, trimmed, repeated spaces collapsed, source
 * capitalization preserved. */
export function normalizeFullName(
  cell: CellValue
): NormalizedValue<string | null> {
  const text = collapseSpaces(cellToText(cell));
  if (text.length === 0) {
    return {
      value: null,
      errors: [
        {
          code: "missing_full_name",
          message: "The graduate full name is required.",
        },
      ],
      warnings: [],
    };
  }
  return ok(text);
}

const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email: trimmed and lowercased. Blank or invalid emails are warnings,
 * never automatic failures. Email is never a unique identifier. */
export function normalizeEmail(cell: CellValue): NormalizedValue<string | null> {
  const text = cellToText(cell).toLowerCase();
  if (text.length === 0) {
    return {
      value: null,
      errors: [],
      warnings: [
        { code: "missing_email", message: "The email address is blank." },
      ],
    };
  }
  if (!BASIC_EMAIL_PATTERN.test(text)) {
    return {
      value: text,
      errors: [],
      warnings: [
        {
          code: "invalid_email",
          message: "The email address does not look valid.",
        },
      ],
    };
  }
  return ok(text);
}

/** Phone: digits only. Blank or invalid-length phones are warnings.
 * Phone is never a unique identifier. */
export function normalizePhone(cell: CellValue): NormalizedValue<string | null> {
  const digits = cellToText(cell).replace(/\D/g, "");
  if (digits.length === 0) {
    return {
      value: null,
      errors: [],
      warnings: [
        { code: "missing_phone", message: "The phone number is blank." },
      ],
    };
  }
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return {
      value: digits,
      errors: [],
      warnings: [
        {
          code: "invalid_phone",
          message:
            "The phone number is not between 10 and 15 digits " +
            "after normalization.",
        },
      ],
    };
  }
  return ok(digits);
}

/** Gown size: trimmed, source description preserved, blank is a warning. */
export function normalizeGownSize(
  cell: CellValue
): NormalizedValue<string | null> {
  const text = cellToText(cell);
  if (text.length === 0) {
    return {
      value: null,
      errors: [],
      warnings: [
        { code: "missing_gown_size", message: "The gown size is blank." },
      ],
    };
  }
  return ok(text);
}

/** Name pronunciation: trimmed, internal line breaks preserved, blank
 * allowed without any issue. */
export function normalizePronunciation(
  cell: CellValue
): NormalizedValue<string | null> {
  if (cell === null) {
    return ok(null);
  }
  const raw = cell instanceof Date ? cell.toISOString() : String(cell);
  const text = raw
    .split(/\r?\n/)
    .map((line) => collapseSpaces(line))
    .join("\n")
    .trim();
  return ok(text.length === 0 ? null : text);
}

const MULTIPLE_NAME_HINT = /(,|&|\r|\n|\band\b)/i;

/** A single adult guest cell. Names are preserved after whitespace
 * normalization and never split automatically. A cell that appears to
 * contain multiple names adds a warning. */
export function normalizeGuestName(
  cell: CellValue,
  guestLabel: string
): NormalizedValue<string | null> {
  const text = collapseSpaces(cellToText(cell).replace(/\r?\n/g, " "));
  if (text.length === 0) {
    return ok(null);
  }
  if (MULTIPLE_NAME_HINT.test(text)) {
    return {
      value: text,
      errors: [],
      warnings: [
        {
          code: "multiple_guest_names",
          message:
            `The ${guestLabel} cell appears to contain multiple names. ` +
            "Each guest cell should hold one guest.",
        },
      ],
    };
  }
  return ok(text);
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  none: 0,
  one: 1,
  two: 2,
};

/** Child count: blank means zero. Accepts numbers and text such as
 * "1 child" or "2 children". Allowed values are 0, 1 or 2. Ambiguous or
 * invalid values are errors. */
export function normalizeChildCount(
  cell: CellValue,
  groupLabel: string
): NormalizedValue<number | null> {
  const invalid: NormalizedValue<number | null> = {
    value: null,
    errors: [
      {
        code: "invalid_child_count",
        message:
          `The ${groupLabel} value is not a clear count of ` +
          "zero, one or two children.",
      },
    ],
    warnings: [],
  };

  if (cell === null) {
    return ok(0);
  }

  if (typeof cell === "number") {
    if (Number.isInteger(cell) && cell >= 0 && cell <= MAX_CHILDREN_PER_GROUP) {
      return ok(cell);
    }
    return invalid;
  }

  const text = cellToText(cell).toLowerCase();
  if (text.length === 0) {
    return ok(0);
  }

  const digitMatches = text.match(/\d+/g) ?? [];
  const uniqueDigits = [...new Set(digitMatches.map((m) => Number(m)))];

  if (uniqueDigits.length === 1) {
    const count = uniqueDigits[0];
    if (count >= 0 && count <= MAX_CHILDREN_PER_GROUP) {
      return ok(count);
    }
    return invalid;
  }

  if (uniqueDigits.length === 0) {
    const word = Object.keys(WORD_NUMBERS).find((key) =>
      new RegExp(`\\b${key}\\b`).test(text)
    );
    if (word !== undefined) {
      return ok(WORD_NUMBERS[word]);
    }
  }

  return invalid;
}

/** Monetary value: blank defaults to zero, negatives are rejected, values
 * are rounded to two decimal places. */
export function normalizeMoney(
  cell: CellValue,
  fieldLabel: string
): NormalizedValue<number | null> {
  const invalid: NormalizedValue<number | null> = {
    value: null,
    errors: [
      {
        code: "invalid_money",
        message: `The ${fieldLabel} value is not a readable amount.`,
      },
    ],
    warnings: [],
  };

  let amount: number;

  if (cell === null) {
    return ok(0);
  } else if (typeof cell === "number") {
    amount = cell;
  } else {
    const text = cellToText(cell).replace(/[$,\s]/g, "");
    if (text.length === 0) {
      return ok(0);
    }
    amount = Number(text);
  }

  if (!Number.isFinite(amount)) {
    return invalid;
  }

  if (amount < 0) {
    return {
      value: null,
      errors: [
        {
          code: "negative_money",
          message: `The ${fieldLabel} value is negative.`,
        },
      ],
      warnings: [],
    };
  }

  return ok(Math.round(amount * 100) / 100);
}

/** Days between the Excel serial epoch (1899-12-30) and the Unix epoch. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MS_PER_DAY = 86400000;

function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - EXCEL_EPOCH_OFFSET_DAYS) * MS_PER_DAY));
}

/** Order date: accepts Excel dates and recognizable text dates and
 * converts them to an ISO timestamp. Blank or invalid dates are
 * warnings. */
export function normalizeOrderDate(
  cell: CellValue
): NormalizedValue<string | null> {
  const blankWarning: NormalizedValue<string | null> = {
    value: null,
    errors: [],
    warnings: [
      { code: "missing_order_date", message: "The order date is blank." },
    ],
  };

  if (cell === null) {
    return blankWarning;
  }

  let date: Date | null = null;

  if (cell instanceof Date) {
    date = cell;
  } else if (typeof cell === "number") {
    if (cell > 0 && cell < 200000) {
      date = excelSerialToDate(cell);
    }
  } else {
    const text = cellToText(cell);
    if (text.length === 0) {
      return blankWarning;
    }
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }

  if (date === null || Number.isNaN(date.getTime())) {
    return {
      value: null,
      errors: [],
      warnings: [
        {
          code: "invalid_order_date",
          message: "The order date could not be read as a date.",
        },
      ],
    };
  }

  return ok(date.toISOString());
}

export interface SourceStatusMapping {
  sourceOrderStatus: string;
  registrationStatus: RegistrationStatus;
  paymentStatus: PaymentStatus;
  warnings: ImportIssue[];
}

/**
 * Maps the source order status to application statuses.
 *
 * "processing" is eligible and never automatically labeled paid: the
 * payment status becomes amount_recorded when an order total exists and
 * unknown otherwise. "failed" stays failed. Any other status requires
 * review and adds a warning naming the unknown status.
 */
export function normalizeSourceStatus(
  cell: CellValue,
  orderTotal: number | null
): SourceStatusMapping {
  const status = cellToText(cell).toLowerCase();

  if (status === "processing") {
    return {
      sourceOrderStatus: status,
      registrationStatus: "eligible",
      paymentStatus:
        orderTotal !== null && orderTotal > 0 ? "amount_recorded" : "unknown",
      warnings: [],
    };
  }

  if (status === "failed") {
    return {
      sourceOrderStatus: status,
      registrationStatus: "failed",
      paymentStatus: "failed",
      warnings: [],
    };
  }

  return {
    sourceOrderStatus: status,
    registrationStatus: "review_required",
    paymentStatus: "unknown",
    warnings: [
      {
        code: "unknown_source_status",
        message:
          status.length === 0
            ? "The source order status is blank."
            : `The source order status "${status}" is not recognized.`,
      },
    ],
  };
}
