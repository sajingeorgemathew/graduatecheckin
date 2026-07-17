/**
 * Zod schemas for authentication inputs. Every authentication mutation
 * validates its payload before any credential handling happens.
 */

import { z } from "zod";
import { PASSWORD_MAX_LENGTH, validatePassword } from "./password-policy";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .pipe(z.string().max(255));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  next: z.string().max(512).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH * 2),
    confirmPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH * 2),
  })
  .superRefine((value, context) => {
    for (const issue of validatePassword(value.newPassword)) {
      context.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: issue.message,
      });
    }
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The new password and confirmation must match.",
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
