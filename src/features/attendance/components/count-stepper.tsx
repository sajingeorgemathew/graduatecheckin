"use client";

/**
 * Large-touch minus/plus stepper bounded between zero and a maximum. Used by
 * the manual-arrival form for guest and child counts.
 */

interface CountStepperProps {
  label: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
}

export function CountStepper({ label, value, max, onChange }: CountStepperProps) {
  const clamp = (next: number) => Math.min(Math.max(next, 0), Math.max(max, 0));
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-navy">
        {label}
        <span className="ml-1 text-xs font-normal text-navy/60">
          (max {max})
        </span>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= 0}
          className="h-11 w-11 rounded-lg border-2 border-navy bg-white text-lg font-bold text-navy disabled:opacity-40"
        >
          -
        </button>
        <span className="w-8 text-center text-base font-bold text-navy">
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className="h-11 w-11 rounded-lg border-2 border-navy bg-white text-lg font-bold text-navy disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
