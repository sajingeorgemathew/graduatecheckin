/**
 * Next.js 16 Proxy. Refreshes Supabase authentication cookies on every
 * matched request and provides early convenience redirects for page
 * routes. This is never the authorization authority: every protected
 * page, server action and route handler independently validates the
 * authenticated user and required role next to the data it protects.
 * No registration data is ever queried here.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PAGE_PREFIXES = ["/staff", "/admin"];

const LOGIN_PATH = "/login";
const STAFF_HOME_PATH = "/staff";

function isProtectedPagePath(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Relative-only return path. External destinations are never preserved. */
function safeNextParam(pathname: string, search: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return STAFF_HOME_PATH;
  }
  return `${pathname}${search}`;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  // Before credentials exist the proxy passes through; server-side guards
  // still deny every protected route.
  if (url.trim().length === 0 || publishableKey.trim().length === 0) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the session server-side and refreshes cookies
  // when needed. Role authorization stays with the page and route guards.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  function redirectWithCookies(destination: string): NextResponse {
    const redirectResponse = NextResponse.redirect(
      new URL(destination, request.url)
    );
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
  }

  // API routes return structured 401/403 responses themselves; the proxy
  // never redirects them.
  if (pathname.startsWith("/api")) {
    return response;
  }

  if (user === null && isProtectedPagePath(pathname)) {
    const next = safeNextParam(pathname, search);
    const destination =
      next === STAFF_HOME_PATH
        ? LOGIN_PATH
        : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
    return redirectWithCookies(destination);
  }

  if (user !== null && pathname === LOGIN_PATH) {
    return redirectWithCookies(STAFF_HOME_PATH);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)",
  ],
};
