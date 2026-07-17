"use server";

/**
 * Login server action. Credentials stay in the POST body, never in a URL,
 * and are never logged. All failures return the same generic message.
 */

import { redirect } from "next/navigation";
import { performLogin } from "@/features/auth/service";

export interface LoginFormState {
  message: string | null;
}

export async function loginAction(
  _previous: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const result = await performLogin({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (result.ok) {
    redirect(result.redirectTo);
  }
  return { message: result.message };
}
