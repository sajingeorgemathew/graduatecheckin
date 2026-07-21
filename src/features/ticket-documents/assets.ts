import "server-only";

/**
 * Server-only branding-asset surface for the branded PDF ticket.
 *
 * The asset logic itself is runtime-neutral and lives in ./assets.shared so
 * standalone CLI scripts can resolve the same committed public assets
 * without importing a "server-only" chain (which throws outside the Next.js
 * server runtime). This module keeps the application's privileged import
 * path guarded: Next.js server code imports from here and the "server-only"
 * marker above prevents it from ever being pulled into a Client Component
 * bundle.
 *
 * Do not add branding constants here. They live once in ./assets.shared and
 * are re-exported below so both surfaces stay in sync.
 */

export {
  PRIMARY_LOGO_CANDIDATES,
  DEFAULT_PRIMARY_LOGO_ASSET,
  publicAssetPath,
  isSafeAssetName,
  loadPublicAsset,
  publicAssetExists,
  loadPrimaryLogo,
  resolvePrimaryLogoAssetName,
  clearAssetCache,
} from "./assets.shared";
