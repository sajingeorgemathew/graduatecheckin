/**
 * Request validation for manually added graduates. Every field the form
 * offers is bounded here, so an oversized or malformed value never reaches
 * the database.
 */

import { z } from "zod";
import {
  MAX_ADULT_GUESTS,
  MAX_CHILDREN_PER_GROUP,
  MAX_COMBINED_CHILDREN,
} from "@/features/production-import/constants";

/** How a manually added graduate reached the administrator. */
export const MANUAL_REGISTRATION_SOURCES = [
  "late_rsvp",
  "missing_rsvp",
  "admin_added",
  "walk_in",
  "roster",
] as const;

export type ManualRegistrationSource =
  (typeof MANUAL_REGISTRATION_SOURCES)[number];

export const MANUAL_REGISTRATION_SOURCE_LABELS: Record<
  ManualRegistrationSource,
  string
> = {
  late_rsvp: "Late RSVP",
  missing_rsvp: "Missing RSVP",
  admin_added: "Administrator added",
  walk_in: "Walk-in",
  roster: "Created from the graduate roster",
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .optional();

export const manualRegistrationSchema = z
  .object({
    graduateFullName: z.string().trim().min(2).max(200),
    email: optionalText(254),
    phone: optionalText(40),
    studentId: optionalText(60),
    namePronunciation: optionalText(300),
    gownSize: optionalText(60),
    adultGuestNames: z
      .array(z.string().trim().min(1).max(200))
      .max(MAX_ADULT_GUESTS)
      .default([]),
    adultGuestCount: z.number().int().min(0).max(MAX_ADULT_GUESTS),
    children04: z.number().int().min(0).max(MAX_CHILDREN_PER_GROUP),
    children510: z.number().int().min(0).max(MAX_CHILDREN_PER_GROUP),
    paymentNote: optionalText(500),
    source: z.enum(MANUAL_REGISTRATION_SOURCES),
    internalNote: optionalText(1000),
    /**
     * Required only when the administrator proceeds despite a likely
     * duplicate. The reason is stored with the registration, so an
     * override is never invisible afterwards.
     */
    overrideReason: optionalText(500),
    acknowledgeDuplicates: z.boolean().default(false),
  })
  .refine(
    (value) => value.children04 + value.children510 <= MAX_COMBINED_CHILDREN,
    {
      message: "At most two children in total may be registered.",
      path: ["children510"],
    }
  )
  .refine(
    (value) => value.adultGuestNames.length <= value.adultGuestCount,
    {
      message: "More guest names were supplied than adult guests.",
      path: ["adultGuestNames"],
    }
  );

export type ManualRegistrationInput = z.infer<typeof manualRegistrationSchema>;

/** Dry-run body for the live duplicate check the form performs as you type. */
export const duplicateCheckSchema = z.object({
  graduateFullName: z.string().trim().max(200).default(""),
  email: optionalText(254),
  phone: optionalText(40),
  studentId: optionalText(60),
});
