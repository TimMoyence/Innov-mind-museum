import * as OTPAuth from 'otpauth';

/**
 * Thin RFC 6238 wrapper around `otpauth`.
 *
 * Centralises:
 *   - Issuer + algorithm + digits + period (so every code path uses the
 *     same TOTP parameters; mismatched `period` between enrollment and
 *     verification is the most common interop bug with authenticator apps).
 *   - The verification window (`±1` step → 30 s before / after).
 *   - The `otpauth://` URI builder used by the frontend QR display.
 */

const ISSUER = 'Musaium';
const ALGORITHM = 'SHA1' as const;
const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** ±1 step gives ~60 s of forgiveness — matches Google Authenticator default. */
const WINDOW = 1;

/** Result of generating a fresh enrollment secret. */
export interface NewTotpSecret {
  /** Base32-encoded shared secret (RFC 4648). Stored encrypted. */
  base32: string;
  /** `otpauth://totp/...` URI suitable for QR rendering. */
  otpauthUrl: string;
}

/** Produce a brand-new shared secret + matching otpauth:// URI. */
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
 * Verify a 6-digit code against a stored Base32 secret. Returns `true` only
 * when the code falls inside the ±1 step window. Any malformed input
 * (non-digit, wrong length, bad base32 secret) returns `false` — no throws,
 * because callers always reduce the result to a 401 anyway.
 */
export function verifyTotpCode(secretBase32: string, code: string): boolean {
  const sanitized = code.trim();
  if (!/^\d{6}$/.test(sanitized)) return false;

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
    return delta !== null;
  } catch {
    return false;
  }
}
