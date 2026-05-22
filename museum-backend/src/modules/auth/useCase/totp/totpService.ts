import * as OTPAuth from 'otpauth';

/**
 * Thin RFC 6238 wrapper. Centralises params (issuer/algorithm/digits/period) so
 * enrollment and verification use the same values — mismatched `period` is the
 * #1 interop bug with authenticator apps.
 */

const ISSUER = 'Musaium';
const ALGORITHM = 'SHA1' as const;
const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** ±1 step ≈ 60s forgiveness (matches Google Authenticator default). */
const WINDOW = 1;

export interface NewTotpSecret {
  /** RFC 4648. Stored encrypted. */
  base32: string;
  /** `otpauth://totp/...` for QR. */
  otpauthUrl: string;
}

export function generateTotpSecret(label: string): NewTotpSecret {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret,
  });
  return { base32: secret.base32, otpauthUrl: totp.toString() };
}

/**
 * Verifies a TOTP code and (on accept) returns the RFC 6238 step that matched.
 *
 * Returns `null` on malformed input (non-digit, wrong length, bad base32) OR
 * when no step within the `WINDOW` matches. Returns `{ step }` where
 * `step = floor(now/PERIOD_SECONDS) + delta` (delta ∈ {-1,0,+1} with WINDOW=1).
 *
 * Callers (`challengeMfa`, `verifyMfa`) compare the returned `step` to the
 * persisted `last_used_step` to enforce RFC 6238 §5.2 "MUST NOT accept the
 * second attempt of the OTP" — see lib-docs/otpauth/LESSONS.md 2026-05-20
 * "Replay-protection (rappel doctrinal)".
 *
 * lib-docs/otpauth/PATTERNS.md §4 DON'T #2 — never interpret `validate()` as
 * boolean ; we expose the `delta` (via `step`) so the caller can ledger it.
 */
export function verifyTotpCode(secretBase32: string, code: string): { step: number } | null {
  const sanitized = code.trim();
  if (!/^\d{6}$/.test(sanitized)) return null;

  try {
    const secret = OTPAuth.Secret.fromBase32(secretBase32);
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: ALGORITHM,
      digits: DIGITS,
      period: PERIOD_SECONDS,
      secret,
    });
    const delta = totp.validate({ token: sanitized, window: WINDOW });
    // lib-docs/otpauth/LESSONS.md L21 — `validate().delta !== null` discrimination
    // (never `delta > 0` ; delta=0 = current step IS valid).
    if (delta === null) return null;
    const currentStep = Math.floor(Date.now() / 1000 / PERIOD_SECONDS);
    return { step: currentStep + delta };
  } catch {
    return null;
  }
}
