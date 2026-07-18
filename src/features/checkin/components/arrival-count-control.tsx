"use client";

/**
 * Accessible minus / value / plus stepper for one guest or child count.
 * Minus never goes below zero; plus never exceeds the current browser
 * visible remaining allowance. The server remains authoritative over the
 * real allowance. Controls are keyboard accessible with descriptive
 * labels and large touch targets for phone use at the event.
 */

import { Minus, Plus } from "lucide-react";

interface ArrivalCountControlProps {
  label: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}

export function ArrivalCountControl({
  label,
  value,
  max,
  onChange,
  disabled = false,
}: ArrivalCountControlProps) {
  const canDecrease = !disabled && value > 0;
  const canIncrease = !disabled && value < max;

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-base font-semibold text-navy">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={!canDecrease}
          aria-label={`Remove one from ${label}`}
          className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-navy bg-white text-navy disabled:border-navy/20 disabled:text-navy/30"
        >
          <Minus aria-hidden className="h-5 w-5" />
        </button>
        <output
          aria-label={`${label} arriving now`}
          className="min-w-11 text-center text-xl font-bold text-navy"
        >
          {value}
        </output>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={!canIncrease}
          aria-label={`Add one to ${label}`}
          className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-navy bg-navy text-white disabled:border-navy/20 disabled:bg-navy/20"
        >
          <Plus aria-hidden className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
