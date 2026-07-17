"use client";

/**
 * Create-staff form. On success the temporary password is displayed
 * exactly once with a copy control. It never appears in URLs, storage or
 * anywhere outside this in-memory component state.
 */

import Link from "next/link";
import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

interface CreatedAccount {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  temporaryPassword: string;
}

function isCreatedAccount(value: unknown): value is CreatedAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    "temporaryPassword" in value &&
    typeof (value as { temporaryPassword: unknown }).temporaryPassword ===
      "string"
  );
}

function errorMessageFrom(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: { message?: unknown } }).error?.message ===
      "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  return "The staff account could not be created.";
}

export function CreateStaffForm() {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setErrorMessage(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = {
      email: String(formData.get("email") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      role: String(formData.get("role") ?? ""),
    };

    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setErrorMessage(errorMessageFrom(payload));
        return;
      }
      if (isCreatedAccount(payload)) {
        setCreated(payload);
        form.reset();
        return;
      }
      setErrorMessage("The create response could not be read.");
    } catch {
      setErrorMessage("The staff account could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (created === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (created !== null) {
    return (
      <div className="rounded-lg border border-navy/10 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-navy">Account created</h2>
        <dl className="mt-4 space-y-2 text-sm text-navy">
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="font-semibold sm:w-40">Staff email</dt>
            <dd>{created.email}</dd>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="font-semibold sm:w-40">Display name</dt>
            <dd>{created.displayName}</dd>
          </div>
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <dt className="font-semibold sm:w-40">Role</dt>
            <dd className="capitalize">{created.role}</dd>
          </div>
        </dl>

        <div className="mt-5 rounded-md border border-gold bg-cream p-4">
          <p className="text-sm font-semibold text-navy">Temporary password</p>
          <p className="mt-2 break-all rounded-md bg-white p-3 font-mono text-sm text-navy">
            {created.temporaryPassword}
          </p>
          <button
            type="button"
            onClick={copyPassword}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-gold-light hover:bg-navy-light"
          >
            {copied ? (
              <Check aria-hidden className="h-4 w-4" />
            ) : (
              <Copy aria-hidden className="h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy password"}
          </button>
          <p className="mt-3 flex items-start gap-2 text-sm text-navy/80">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            This password will not be shown again. Copy it now and share it
            securely with the staff member. They must change it at first
            sign-in.
          </p>
        </div>

        <Link
          href="/admin/staff"
          className="mt-6 inline-block rounded-md bg-navy px-6 py-2.5 text-sm font-semibold text-gold-light hover:bg-navy-light"
        >
          Done
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-navy/10 bg-white p-6 shadow-sm">
      <label htmlFor="staff-email" className="block text-sm font-semibold text-navy">
        Email
      </label>
      <input
        id="staff-email"
        name="email"
        type="email"
        required
        className="mt-2 block w-full rounded-md border border-navy/20 bg-white p-3 text-sm text-navy focus:border-gold focus:outline-none"
      />

      <label
        htmlFor="staff-display-name"
        className="mt-4 block text-sm font-semibold text-navy"
      >
        Display name
      </label>
      <input
        id="staff-display-name"
        name="displayName"
        type="text"
        required
        maxLength={120}
        className="mt-2 block w-full rounded-md border border-navy/20 bg-white p-3 text-sm text-navy focus:border-gold focus:outline-none"
      />

      <label htmlFor="staff-role" className="mt-4 block text-sm font-semibold text-navy">
        Role
      </label>
      <select
        id="staff-role"
        name="role"
        required
        defaultValue="scanner"
        className="mt-2 block w-full rounded-md border border-navy/20 bg-white p-3 text-sm text-navy focus:border-gold focus:outline-none"
      >
        <option value="scanner">Scanner</option>
        <option value="supervisor">Supervisor</option>
        <option value="administrator">Administrator</option>
      </select>

      {errorMessage !== null && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-gold-light shadow-sm hover:bg-navy-light disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
      >
        {submitting ? "Creating account..." : "Create Staff Account"}
      </button>
    </form>
  );
}
