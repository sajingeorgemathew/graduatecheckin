"use client";

/**
 * Per-staff-member administration actions. All requests go to
 * administrator-only API routes that revalidate the session server-side.
 * A reset temporary password is displayed exactly once and only lives in
 * this component's memory.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

interface StaffActionsProps {
  userId: string;
  role: string;
  isActive: boolean;
  isSelf: boolean;
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
  return "The staff change failed.";
}

export function StaffActions({ userId, role, isActive, isSelf }: StaffActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState(role);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function callApi(
    action: string,
    path: string,
    method: "PATCH" | "POST",
    body: unknown
  ): Promise<unknown | null> {
    if (pendingAction !== null) {
      return null;
    }
    setErrorMessage(null);
    setPendingAction(action);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setErrorMessage(errorMessageFrom(payload));
        return null;
      }
      return payload;
    } catch {
      setErrorMessage("The staff change failed.");
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  async function applyRole() {
    if (selectedRole === role) {
      return;
    }
    const payload = await callApi(
      "role",
      `/api/admin/staff/${userId}/role`,
      "PATCH",
      { role: selectedRole }
    );
    if (payload !== null) {
      router.refresh();
    }
  }

  async function toggleActive() {
    const payload = await callApi(
      "status",
      `/api/admin/staff/${userId}/status`,
      "PATCH",
      { active: !isActive }
    );
    if (payload !== null) {
      router.refresh();
    }
  }

  async function resetTemporaryPassword() {
    const payload = await callApi(
      "reset",
      `/api/admin/staff/${userId}/reset-password`,
      "POST",
      {}
    );
    if (
      typeof payload === "object" &&
      payload !== null &&
      "temporaryPassword" in payload &&
      typeof (payload as { temporaryPassword: unknown }).temporaryPassword ===
        "string"
    ) {
      setResetPassword(
        (payload as { temporaryPassword: string }).temporaryPassword
      );
      setCopied(false);
      router.refresh();
    }
  }

  async function copyPassword() {
    if (resetPassword === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(resetPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`role-${userId}`}>
          Role
        </label>
        <select
          id={`role-${userId}`}
          value={selectedRole}
          onChange={(event) => setSelectedRole(event.target.value)}
          disabled={pendingAction !== null || isSelf}
          className="rounded-md border border-navy/20 bg-white px-2 py-1 text-xs text-navy"
        >
          <option value="scanner">Scanner</option>
          <option value="supervisor">Supervisor</option>
          <option value="administrator">Administrator</option>
        </select>
        <button
          type="button"
          onClick={applyRole}
          disabled={pendingAction !== null || isSelf || selectedRole === role}
          className="rounded-md border border-navy px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "role" ? "Saving..." : "Change role"}
        </button>
        <button
          type="button"
          onClick={toggleActive}
          disabled={pendingAction !== null || isSelf}
          className="rounded-md border border-navy px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "status"
            ? "Saving..."
            : isActive
              ? "Deactivate"
              : "Reactivate"}
        </button>
        <button
          type="button"
          onClick={resetTemporaryPassword}
          disabled={pendingAction !== null}
          className="rounded-md border border-navy px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "reset" ? "Resetting..." : "Reset password"}
        </button>
      </div>

      {errorMessage !== null && (
        <p role="alert" className="text-xs text-red-700">
          {errorMessage}
        </p>
      )}

      {resetPassword !== null && (
        <div className="rounded-md border border-gold bg-cream p-3">
          <p className="text-xs font-semibold text-navy">
            New temporary password
          </p>
          <p className="mt-1 break-all rounded-md bg-white p-2 font-mono text-xs text-navy">
            {resetPassword}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={copyPassword}
              className="inline-flex items-center gap-1 rounded-md bg-navy px-2.5 py-1 text-xs font-semibold text-gold-light hover:bg-navy-light"
            >
              {copied ? (
                <Check aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <Copy aria-hidden className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setResetPassword(null)}
              className="rounded-md border border-navy px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy hover:text-gold-light"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-2 flex items-start gap-1 text-xs text-navy/80">
            <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
            Shown once only. The staff member must change it at next
            sign-in.
          </p>
        </div>
      )}
    </div>
  );
}
