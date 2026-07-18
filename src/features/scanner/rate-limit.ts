/**
 * Pure server-side scan rate limiting. The service counts recent
 * ticket_scan_attempts rows per staff user and refuses further validation
 * once the rolling window is full. The limit and clock are injectable so
 * tests never depend on real time.
 */

import {
  SCAN_RATE_LIMIT_MAX_REQUESTS,
  SCAN_RATE_LIMIT_WINDOW_MS,
} from "./constants";

export interface ScanRateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export const DEFAULT_SCAN_RATE_LIMIT: ScanRateLimitConfig = {
  maxRequests: SCAN_RATE_LIMIT_MAX_REQUESTS,
  windowMs: SCAN_RATE_LIMIT_WINDOW_MS,
};

/** Start of the rolling window that ends at now. */
export function rateLimitWindowStart(
  now: Date,
  config: ScanRateLimitConfig = DEFAULT_SCAN_RATE_LIMIT
): Date {
  return new Date(now.getTime() - config.windowMs);
}

/**
 * True when the attempt must be refused. recentCount is the number of
 * attempts the same staff user already made inside the window, so the
 * configured maximum is still allowed and the next attempt is blocked.
 */
export function isRateLimited(
  recentCount: number,
  config: ScanRateLimitConfig = DEFAULT_SCAN_RATE_LIMIT
): boolean {
  return recentCount >= config.maxRequests;
}
