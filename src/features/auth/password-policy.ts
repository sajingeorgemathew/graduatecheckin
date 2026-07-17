/**
 * Password policy for staff accounts. Applies to temporary password
 * generation, the required first-login change and administrator resets.
 * Passwords themselves are never stored or logged anywhere.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordIssue {
  code:
    | "too_short"
    | "too_long"
    | "missing_uppercase"
    | "missing_lowercase"
    | "missing_number"
    | "missing_symbol"
    | "surrounding_whitespace";
  message: string;
}

export function validatePassword(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];

  if (password !== password.trim()) {
    issues.push({
      code: "surrounding_whitespace",
      message: "The password must not start or end with spaces.",
    });
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    issues.push({
      code: "too_short",
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    });
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push({
      code: "too_long",
      message: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
    });
  }
  if (!/[A-Z]/.test(password)) {
    issues.push({
      code: "missing_uppercase",
      message: "Include at least one uppercase letter.",
    });
  }
  if (!/[a-z]/.test(password)) {
    issues.push({
      code: "missing_lowercase",
      message: "Include at least one lowercase letter.",
    });
  }
  if (!/[0-9]/.test(password)) {
    issues.push({
      code: "missing_number",
      message: "Include at least one number.",
    });
  }
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    issues.push({
      code: "missing_symbol",
      message: "Include at least one symbol.",
    });
  }

  return issues;
}

export function isPasswordCompliant(password: string): boolean {
  return validatePassword(password).length === 0;
}
