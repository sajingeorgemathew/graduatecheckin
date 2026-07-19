/**
 * Browser-side request helpers for the attendance workspace. These run in
 * client components only. Signed registration and entry references are passed
 * in request bodies and kept in React state; they are never written to a
 * URL, query string, cookie, localStorage or sessionStorage.
 */

import type { AttendanceStructuredError } from "./types";

export interface RequestSuccess<TView> {
  ok: true;
  status: number;
  view: TView;
}

export interface RequestFailure {
  ok: false;
  status: number;
  message: string;
}

export type RequestResult<TView> = RequestSuccess<TView> | RequestFailure;

function messageFrom(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof (payload as AttendanceStructuredError).error === "object"
  ) {
    const inner = (payload as AttendanceStructuredError).error;
    if (typeof inner.message === "string" && inner.message.length > 0) {
      return inner.message;
    }
  }
  return null;
}

async function parse<TView>(
  response: Response,
  isView: (value: unknown) => value is TView
): Promise<RequestResult<TView>> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (response.ok && isView(payload)) {
    return { ok: true, status: response.status, view: payload };
  }
  return {
    ok: false,
    status: response.status,
    message:
      messageFrom(payload) ??
      "The action could not be completed. Refresh and try again.",
  };
}

export async function getJson<TView>(
  path: string,
  isView: (value: unknown) => value is TView
): Promise<RequestResult<TView>> {
  const response = await fetch(path, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  return parse(response, isView);
}

export async function postJson<TView>(
  path: string,
  body: unknown,
  isView: (value: unknown) => value is TView
): Promise<RequestResult<TView>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });
  return parse(response, isView);
}
