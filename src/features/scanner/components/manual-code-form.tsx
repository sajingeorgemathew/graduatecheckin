"use client";

/**
 * Manual ticket-code fallback for damaged QR codes or camera problems.
 * The code is normalized to uppercase, validated server-side and looked
 * up exactly; no partial matching ever happens.
 */

import { useState } from "react";
import { MAX_MANUAL_CODE_LENGTH } from "../constants";

interface ManualCodeFormProps {
  onSubmitCode: (code: string) => void;
  disabled: boolean;
}

export function ManualCodeForm({ onSubmitCode, disabled }: ManualCodeFormProps) {
  const [code, setCode] = useState("");

  return (
    <form
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault();
        const trimmed = code.trim().toUpperCase();
        if (disabled || trimmed.length === 0) {
          return;
        }
        onSubmitCode(trimmed);
        setCode("");
      }}
      className="space-y-3"
    >
      <label
        htmlFor="manual-ticket-code"
        className="block text-sm font-semibold text-navy"
      >
        Ticket code
      </label>
      <input
        id="manual-ticket-code"
        name="ticketCode"
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={MAX_MANUAL_CODE_LENGTH}
        placeholder="GR26-XXXX-XXXX"
        value={code}
        onChange={(changeEvent) =>
          setCode(changeEvent.target.value.toUpperCase())
        }
        disabled={disabled}
        className="block w-full rounded-lg border border-navy/30 bg-white px-4 py-3 font-mono text-lg uppercase tracking-widest text-navy placeholder:text-navy/30 disabled:bg-cream"
      />
      <p className="text-xs text-navy/60">
        Type the full printed code from the ticket, for example
        GR26-ABCD-EFGH. Use this when the QR code is damaged or the camera
        is unavailable.
      </p>
      <button
        type="submit"
        disabled={disabled || code.trim().length === 0}
        className="min-h-12 w-full rounded-lg bg-gold px-5 py-3 text-base font-semibold text-navy hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        Check Ticket Code
      </button>
    </form>
  );
}
