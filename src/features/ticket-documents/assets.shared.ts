/**
 * Pure branding-asset resolution for the branded PDF ticket.
 *
 * This module is deliberately runtime-neutral: it imports nothing from
 * Next.js and never imports "server-only". It contains only asset names,
 * expected public paths and filesystem-safe lookup built on node:fs. That
 * lets standalone CLI scripts (running under tsx, outside the Next.js
 * runtime) resolve and read the same committed public assets the server
 * uses, without pulling in a server-only import chain.
 *
 * The Next.js application must not import this module directly; it imports
 * ./assets, which re-exports everything here behind an "import server-only"
 * guard so the privileged surface keeps its safeguard.
 *
 * Assets are read from the committed public folder and cached in memory for
 * the process lifetime. Rendering never makes a network request for an
 * asset: a PDF produced during an export must not depend on an external host
 * being reachable.
 *
 * Asset resolution notes:
 *  - public/logo_final_full.png is the Toronto Academy of Education lockup
 *    and is the primary logo. A file named "taelogo" does not exist in this
 *    repository; the resolver still looks for it first so that dropping one
 *    in later makes it the primary asset with no code change.
 *  - The PNG embeds directly and correctly in @react-pdf/renderer, so no
 *    PDF-specific converted copy is required.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Candidate primary logo files, in preference order. The first that exists
 * on disk wins.
 */
export const PRIMARY_LOGO_CANDIDATES = [
  "taelogo.png",
  "taelogo.jpg",
  "taelogo.jpeg",
  "logo_final_full.png",
] as const;

/** Resolved default recorded in graduation_event_ticket_settings. */
export const DEFAULT_PRIMARY_LOGO_ASSET = "logo_final_full.png";

const cache = new Map<string, Buffer | null>();

/** Absolute path of a committed asset inside the public folder. */
export function publicAssetPath(assetName: string): string {
  return join(process.cwd(), "public", assetName);
}

/** True when the name is a safe, traversal-free bare file name. */
export function isSafeAssetName(assetName: string): boolean {
  const safeName = assetName.trim();
  return (
    safeName.length > 0 &&
    !safeName.includes("..") &&
    !safeName.includes("/") &&
    !safeName.includes("\\")
  );
}

/**
 * Loads a committed public asset as a Buffer, or null when it is missing.
 * A missing decorative asset must never fail a generation run, so callers
 * treat null as "render without this asset".
 */
export function loadPublicAsset(assetName: string): Buffer | null {
  const safeName = assetName.trim();
  // Defend against traversal: assets are plain file names in public/.
  if (!isSafeAssetName(safeName)) {
    return null;
  }
  const cached = cache.get(safeName);
  if (cached !== undefined) {
    return cached;
  }
  let buffer: Buffer | null = null;
  try {
    buffer = readFileSync(publicAssetPath(safeName));
  } catch {
    buffer = null;
  }
  cache.set(safeName, buffer);
  return buffer;
}

/**
 * True when the named asset can be found on disk without reading it into the
 * cache as a full buffer beyond what loadPublicAsset already does. Used by
 * verification and dry-run reporting.
 */
export function publicAssetExists(assetName: string): boolean {
  return loadPublicAsset(assetName) !== null;
}

/** Resolves and loads the academy logo, preferring taelogo when present. */
export function loadPrimaryLogo(configuredAsset?: string | null): Buffer | null {
  const configured = (configuredAsset ?? "").trim();
  if (configured.length > 0) {
    const loaded = loadPublicAsset(configured);
    if (loaded !== null) {
      return loaded;
    }
  }
  for (const candidate of PRIMARY_LOGO_CANDIDATES) {
    const loaded = loadPublicAsset(candidate);
    if (loaded !== null) {
      return loaded;
    }
  }
  return null;
}

/** Resolves the configured logo file name without returning the file. */
export function resolvePrimaryLogoAssetName(): string {
  for (const candidate of PRIMARY_LOGO_CANDIDATES) {
    if (loadPublicAsset(candidate) !== null) {
      return candidate;
    }
  }
  return DEFAULT_PRIMARY_LOGO_ASSET;
}

/** Test seam: clears the in-process asset cache. */
export function clearAssetCache(): void {
  cache.clear();
}
