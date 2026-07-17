"use server";

/**
 * Change-password server action. Independently revalidates the caller,
 * reauthenticates with the current password and never logs any password.
 */

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/features/auth/constants";
import { requireStaffSession } from "@/features/auth/guards";
import { performPasswordChange } from "@/features/auth/service";

export interface ChangePasswordFormState {
  message: string | null;
}

export async function changePasswordAction(
  _previous: ChangePasswordFormState,
  formData: FormData
): Promise<ChangePasswordFormState> {
  const guard = await requireStaffSession({ allowPasswordChangeRequired: true });
  if (!guard.ok) {
    redirect(LOGIN_PATH);
  }

  const result = await performPasswordChange(guard.session, {
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (result.ok) {
    redirect(result.redirectTo);
  }
  return { message: result.message };
}
