"use client";

/**
 * Change-password form. Requires the current password, applies the staff
 * password policy client-side for quick feedback and relies on the server
 * action for the authoritative checks.
 */

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  changePasswordAction,
  type ChangePasswordFormState,
} from "@/app/staff/change-password/actions";
import { PASSWORD_MIN_LENGTH } from "@/features/auth/password-policy";

const initialState: ChangePasswordFormState = { message: null };

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
}

function PasswordField({ id, name, label, autoComplete }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="mt-4 first:mt-0">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label}
      </label>
      <div className="relative mt-2">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          className="block w-full rounded-md border border-navy/20 bg-white p-3 pr-12 text-sm text-navy focus:border-gold focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((value) => !value)}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-navy/60 hover:text-navy"
        >
          {show ? (
            <EyeOff aria-hidden className="h-5 w-5" />
          ) : (
            <Eye aria-hidden className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState
  );

  return (
    <form action={formAction} className="mt-6">
      <PasswordField
        id="current-password"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
      />
      <PasswordField
        id="new-password"
        name="newPassword"
        label="New password"
        autoComplete="new-password"
      />
      <PasswordField
        id="confirm-password"
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
      />

      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-navy/70">
        <li>At least {PASSWORD_MIN_LENGTH} characters.</li>
        <li>At least one uppercase letter and one lowercase letter.</li>
        <li>At least one number and one symbol.</li>
        <li>No spaces at the start or end.</li>
      </ul>

      {state.message !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {pending ? "Updating password..." : "Change Password"}
      </button>
    </form>
  );
}
