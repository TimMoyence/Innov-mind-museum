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

/** Malformed input (non-digit, wrong length, bad base32) returns `false` — no throws. */
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
