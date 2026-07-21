import "server-only";

/**
 * Server-only access to the distribution signing secret.
 *
 * TICKET_DISTRIBUTION_SECRET never reaches the browser. Row signatures are
 * always created and verified on the server; the client only ever sees the
 * resulting non-secret signature string.
 */

import { getServerEnv } from "@/lib/env/server";

import {
  DistributionConfigurationError,
  validateDistributionSecret,
} from "./signing";

/**
 * Returns the configured distribution secret, or throws a safe error whose
 * message never contains the secret value. Callers that need signing must
 * fail closed when the secret is missing or too weak.
 */
export function requireDistributionSecret(): string {
  const secret = getServerEnv().TICKET_DISTRIBUTION_SECRET;
  if (!validateDistributionSecret(secret).valid) {
    throw new DistributionConfigurationError();
  }
  return secret;
}

/** Non-throwing check used by verification surfaces. */
export function distributionSecretStatus(): {
  configured: boolean;
  valid: boolean;
} {
  const status = validateDistributionSecret(
    getServerEnv().TICKET_DISTRIBUTION_SECRET
  );
  return { configured: status.configured, valid: status.valid };
}
