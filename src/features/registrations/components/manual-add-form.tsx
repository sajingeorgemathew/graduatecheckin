"use client";

/**
 * Manually add a graduate: a late RSVP, a missing RSVP, an
 * administrator-added graduate or a walk-in.
 *
 * Likely duplicates are checked as the administrator types and again on
 * save. A warning never blocks the work; proceeding simply requires the
 * administrator to say why, and the reason is stored with the graduate.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DuplicateWarning } from "../duplicate-detection";
import {
  MANUAL_REGISTRATION_SOURCES,
  MANUAL_REGISTRATION_SOURCE_LABELS,
  type ManualRegistrationSource,
} from "../schemas";

function errorMessageOf(payload: unknown): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as { error: { message?: unknown } }).error?.message ===
      "string"
  ) {
    return (payload as { error: { message: string } }).error.message;
  }
  return "The graduate could not be saved.";
}

export function ManualAddForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentId, setStudentId] = useState("");
  const [pronunciation, setPronunciation] = useState("");
  const [gownSize, setGownSize] = useState("");
  const [guestNames, setGuestNames] = useState("");
  const [adultGuestCount, setAdultGuestCount] = useState(0);
  const [children04, setChildren04] = useState(0);
  const [children510, setChildren510] = useState(0);
  const [paymentNote, setPaymentNote] = useState("");
  const [source, setSource] = useState<ManualRegistrationSource>("late_rsvp");
  const [internalNote, setInternalNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [warnings, setWarnings] = useState<DuplicateWarning[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkDuplicates() {
    try {
      const response = await fetch(
        "/api/admin/registrations/duplicate-check",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            graduateFullName: fullName,
            email,
            phone,
            studentId,
          }),
        }
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        warnings: DuplicateWarning[];
      };
      setWarnings(payload.warnings);
    } catch {
      // A failed advisory check never blocks the administrator's work.
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graduateFullName: fullName,
          email,
          phone,
          studentId,
          namePronunciation: pronunciation,
          gownSize,
          adultGuestNames: guestNames
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .slice(0, adultGuestCount),
          adultGuestCount,
          children04,
          children510,
          paymentNote,
          source,
          internalNote,
          overrideReason,
          acknowledgeDuplicates: acknowledge,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        setError(errorMessageOf(payload));
        void checkDuplicates();
        return;
      }
      const created = payload as { registrationId: string };
      // Straight to the delivery desk, where the administrator can generate
      // the ticket, copy the email and record the send.
      router.push(
        `/admin/tickets/manual-delivery/${created.registrationId}`
      );
    } catch {
      setError("The graduate could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-5">
      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-navy">Graduate</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-navy">
            Full name (required)
            <input
              required
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              onBlur={checkDuplicates}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-navy">
            Email (leave blank for a walk-in with no email)
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onBlur={checkDuplicates}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-navy">
            Phone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onBlur={checkDuplicates}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-navy">
            Student ID (optional)
            <input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              onBlur={checkDuplicates}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-navy">
            Name pronunciation
            <input
              value={pronunciation}
              onChange={(event) => setPronunciation(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-navy">
            Gown size
            <input
              value={gownSize}
              onChange={(event) => setGownSize(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-navy">Registered party</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["Adult guests", adultGuestCount, setAdultGuestCount],
              ["Children 0-4 (free)", children04, setChildren04],
              ["Children 5-10 (paid)", children510, setChildren510],
            ] as const
          ).map(([label, value, setter]) => (
            <label key={label} className="text-xs font-semibold text-navy">
              {label}
              <input
                type="number"
                min={0}
                step={1}
                value={value}
                onChange={(event) => {
                  const next = Math.floor(Number(event.target.value));
                  setter(Number.isFinite(next) && next > 0 ? next : 0);
                }}
                className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
              />
            </label>
          ))}
        </div>
        <label className="mt-3 block text-xs font-semibold text-navy">
          Adult guest names (comma separated)
          <input
            value={guestNames}
            onChange={(event) => setGuestNames(event.target.value)}
            className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
          />
        </label>
        <label className="mt-3 block text-xs font-semibold text-navy">
          Payment or approval note
          <input
            value={paymentNote}
            onChange={(event) => setPaymentNote(event.target.value)}
            placeholder="e.g. guest fee paid at the office, receipt 1042"
            className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
          />
        </label>
        <p className="mt-2 text-xs text-navy/60">
          Enter any number of guests and children. One ticket covers the
          graduate and this whole party. The number of adult guest names
          cannot exceed the adult guest count.
        </p>
      </div>

      <div className="rounded-lg border border-navy/10 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-navy">Record keeping</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-navy">
            Source
            <select
              value={source}
              onChange={(event) =>
                setSource(event.target.value as ManualRegistrationSource)
              }
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            >
              {MANUAL_REGISTRATION_SOURCES.map((value) => (
                <option key={value} value={value}>
                  {MANUAL_REGISTRATION_SOURCE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-navy">
            Internal note
            <input
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border-2 border-gold bg-cream p-5">
          <h2 className="font-semibold text-navy">
            {warnings.length} possible duplicate
            {warnings.length === 1 ? "" : "s"}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-navy/80">
            {warnings.map((warning, index) => (
              <li key={`${warning.registrationId}-${warning.signal}-${index}`}>
                {warning.message} Existing graduate: {warning.existingName}.
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-sm text-navy">
            <input
              type="checkbox"
              checked={acknowledge}
              onChange={(event) => setAcknowledge(event.target.checked)}
              className="mt-1"
            />
            <span>
              I have checked these records and this is a genuinely different
              graduate.
            </span>
          </label>
          <label className="mt-3 block text-xs font-semibold text-navy">
            Override reason (required)
            <input
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              className="mt-1 w-full rounded-md border border-navy/20 bg-white p-2 text-sm font-normal"
            />
          </label>
        </div>
      )}

      {error !== null && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-navy px-5 py-3 text-sm font-semibold text-gold-light hover:bg-navy-light disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save and open the delivery desk"}
      </button>
    </form>
  );
}
