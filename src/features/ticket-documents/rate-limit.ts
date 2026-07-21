/**
 * Rate limiting for the expensive PDF generation and export routes.
 *
 * Rendering a PDF is CPU bound and packaging a ZIP reads every stored
 * object, so both are capped per administrator. The store is in-process,
 * which is sufficient for the single-instance administrative surface this
 * feature runs on; the pure helpers below keep the policy testable without
 * depending on real time.
 */

export interface DocumentRateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

/** Generation: 20 requests per minute per administrator. */
export const GENERATION_RATE_LIMIT: DocumentRateLimitConfig = {
  maxRequests: 20,
  windowMs: 60_000,
};

/** Export packaging: 10 archives per minute per administrator. */
export const EXPORT_RATE_LIMIT: DocumentRateLimitConfig = {
  maxRequests: 10,
  windowMs: 60_000,
};

/** True when a further request must be refused. */
export function isRateLimited(
  recentCount: number,
  config: DocumentRateLimitConfig
): boolean {
  return recentCount >= config.maxRequests;
}

/** Drops timestamps that fall outside the rolling window. */
export function pruneTimestamps(
  timestamps: readonly number[],
  now: number,
  config: DocumentRateLimitConfig
): number[] {
  const cutoff = now - config.windowMs;
  return timestamps.filter((value) => value > cutoff);
}

const buckets = new Map<string, number[]>();

/**
 * Records an attempt and reports whether it must be refused. Keyed by
 * actor and operation so generation and export are limited independently.
 */
export function consumeRateLimit(
  key: string,
  config: DocumentRateLimitConfig,
  now: number = Date.now()
): boolean {
  const recent = pruneTimestamps(buckets.get(key) ?? [], now, config);
  if (isRateLimited(recent.length, config)) {
    buckets.set(key, recent);
    return true;
  }
  recent.push(now);
  buckets.set(key, recent);
  return false;
}

/** Test seam: clears all recorded attempts. */
export function resetRateLimits(): void {
  buckets.clear();
}
