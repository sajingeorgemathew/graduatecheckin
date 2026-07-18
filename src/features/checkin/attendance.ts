/**
 * Pure attendance helpers shared by the confirmation UI. These compute the
 * remaining allowance the browser controls should offer and clamp a
 * selection to that allowance. They are display aids only: the server is
 * always the authority on remaining allowance and never trusts any count
 * calculated in the browser.
 *
 * Remaining is always derived from the registered allowance minus the
 * already-arrived totals, which the server calculated across the whole
 * registration. Replacing a ticket therefore never changes what these
 * helpers offer, because the already-arrived totals already span every
 * check-in of the registration.
 */

import type { ArrivalSelection } from "./types";

export interface PartyAllowance {
  graduateArrived: number;
  adultGuestsRegistered: number;
  adultGuestsArrived: number;
  children0To4Registered: number;
  children0To4Arrived: number;
  children5To10Registered: number;
  children5To10Arrived: number;
}

export interface ArrivalRemaining {
  graduateAvailable: boolean;
  adultGuests: number;
  children0To4: number;
  children5To10: number;
}

function remaining(registered: number, arrived: number): number {
  return Math.max(registered - arrived, 0);
}

export function deriveRemaining(allowance: PartyAllowance): ArrivalRemaining {
  return {
    graduateAvailable: allowance.graduateArrived < 1,
    adultGuests: remaining(
      allowance.adultGuestsRegistered,
      allowance.adultGuestsArrived
    ),
    children0To4: remaining(
      allowance.children0To4Registered,
      allowance.children0To4Arrived
    ),
    children5To10: remaining(
      allowance.children5To10Registered,
      allowance.children5To10Arrived
    ),
  };
}

export function emptySelection(): ArrivalSelection {
  return { graduate: 0, adultGuests: 0, children0To4: 0, children5To10: 0 };
}

export function totalArriving(selection: ArrivalSelection): number {
  return (
    selection.graduate +
    selection.adultGuests +
    selection.children0To4 +
    selection.children5To10
  );
}

function bound(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

/** Clamps a selection to zero and the current remaining allowance. */
export function clampSelection(
  selection: ArrivalSelection,
  remainingAllowance: ArrivalRemaining
): ArrivalSelection {
  return {
    graduate: remainingAllowance.graduateAvailable
      ? bound(selection.graduate, 1)
      : 0,
    adultGuests: bound(selection.adultGuests, remainingAllowance.adultGuests),
    children0To4: bound(
      selection.children0To4,
      remainingAllowance.children0To4
    ),
    children5To10: bound(
      selection.children5To10,
      remainingAllowance.children5To10
    ),
  };
}

/** The Full Remaining Party quick action: everyone not yet arrived. */
export function fullRemainingSelection(
  remainingAllowance: ArrivalRemaining
): ArrivalSelection {
  return {
    graduate: remainingAllowance.graduateAvailable ? 1 : 0,
    adultGuests: remainingAllowance.adultGuests,
    children0To4: remainingAllowance.children0To4,
    children5To10: remainingAllowance.children5To10,
  };
}

/** The Graduate Only quick action: only the graduate, when not arrived. */
export function graduateOnlySelection(
  remainingAllowance: ArrivalRemaining
): ArrivalSelection {
  return {
    graduate: remainingAllowance.graduateAvailable ? 1 : 0,
    adultGuests: 0,
    children0To4: 0,
    children5To10: 0,
  };
}
