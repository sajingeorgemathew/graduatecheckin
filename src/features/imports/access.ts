/**
 * Development-only access gate for the import feature.
 *
 * The import interface and every import mutation are unavailable unless the
 * server environment is exactly development and the explicit feature flag
 * is enabled. This is temporary protection until CHECKIN-04 adds staff
 * authentication. Never enable the flag in production.
 */

import { getServerEnv } from "@/lib/env/server";

export interface ImportAccessInput {
  appEnv: string | undefined;
  enableDevImports: string | undefined;
}

export function isImportAccessEnabled(input: ImportAccessInput): boolean {
  return (
    input.appEnv === "development" && input.enableDevImports === "true"
  );
}

export function hasImportAccess(): boolean {
  const env = getServerEnv();
  return isImportAccessEnabled({
    appEnv: env.APP_ENV,
    enableDevImports: env.ENABLE_DEV_IMPORTS,
  });
}
