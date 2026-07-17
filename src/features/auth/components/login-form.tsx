"use client";

/**
 * Staff sign-in form. Uses a server action so credentials travel only in
 * the POST body. Shows one generic error for every failure and never
 * reveals whether an email account exists.
 */

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { loginAction, type LoginFormState } from "@/app/login/actions";

const initialState: LoginFormState = { message: null };

interface LoginFormProps {
  next: string | null;
}

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="mt-6">
      {next !== null && <input type="hidden" name="next" value={next} />}

      <label
        htmlFor="login-email"
        className="block text-sm font-semibold text-navy"
      >
        Email
      </label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="mt-2 block w-full rounded-md border border-navy/20 bg-white p-3 text-sm text-navy focus:border-gold focus:outline-none"
      />

      <label
        htmlFor="login-password"
        className="mt-4 block text-sm font-semibold text-navy"
      >
        Password
      </label>
      <div className="relative mt-2">
        <input
          id="login-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          className="block w-full rounded-md border border-navy/20 bg-white p-3 pr-12 text-sm text-navy focus:border-gold focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-navy/60 hover:text-navy"
        >
          {showPassword ? (
            <EyeOff aria-hidden className="h-5 w-5" />
          ) : (
            <Eye aria-hidden className="h-5 w-5" />
          )}
        </button>
      </div>

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
        className="mt-6 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Sign In"}
      </button>

      <p className="mt-4 text-sm text-navy/70">
        Need password help? Contact an administrator. Passwords cannot be
        reset from this page.
      </p>
    </form>
  );
}
