/**
 * Zod schemas for staff administration inputs. Every mutation validates
 * its payload before any account work happens. The acting user is always
 * taken from the authenticated session, never from these inputs.
 */

import { z } from "zod";
import { emailSchema } from "@/features/auth/schemas";

export const staffRoleSchema = z.enum([
  "scanner",
  "supervisor",
  "administrator",
]);

export const staffUserIdSchema = z.uuid();

export const createStaffSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1).max(120),
  role: staffRoleSchema,
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const changeRoleSchema = z.object({
  role: staffRoleSchema,
});

export const setActiveSchema = z.object({
  active: z.boolean(),
});

export const staffListFilterSchema = z
  .enum(["all", "active", "inactive", "scanner", "supervisor", "administrator"])
  .default("all");

export const staffListPageSchema = z.coerce.number().int().min(1).default(1);
