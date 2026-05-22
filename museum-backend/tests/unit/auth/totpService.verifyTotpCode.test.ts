/**
 * RED — T1.3 — D2 — `verifyTotpCode` signature MUST change from
 * `(secret, code) => boolean` to `(secret, code) => { step: number } | null`.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R4/R5.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.2 D2.
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/otpauth/PATTERNS.md` §3 DO "pass `window: 1` to `validate()`" — preserved.
 *  - `lib-docs/otpauth/PATTERNS.md` §4 DON'T "interpret `validate()` as a
 *    boolean" + "skip replay protection" — the new return type makes the
 *    accepted step a first-class output for the caller to compare vs DB.
 *  - `lib-docs/otpauth/LESSONS.md:53-54` "il faudra ajouter une colonne
 *    last_delta_seen sur totp_secrets (RFC 6238 §5.2)" — this signature is the
 *    plumbing for that.
 *  - RFC 6238 §5.2 — `step = floor(unixTime / 30) + delta`.
 *
 * Failure mode at HEAD `00325d81` :
 *  - `totpService.ts:37` returns `boolean` → `.step` is undefined on TS,
 *    `(result as any).step` is undefined at runtime → step-shape assertions fail.
 *
 * Run scope :
 *   pnpm jest tests/unit/auth/totpService.verifyTotpCode.test.ts
 */

import * as OTPAuth from 'otpauth';

import { verifyTotpCode } from '@modules/auth/useCase/totp/totpService';

const PERIOD_SECONDS = 30;
const ISSUER = 'Musaium';
const ALGORITHM = 'SHA1';
const DIGITS = 6;

/**
 * Build an `OTPAuth.TOTP` instance mirroring `totpService.ts` constants so we
 * can generate codes deterministic-per-step and assert on the discrete `step`.
 */
const makeTotp = (secretBase32: string, label = 'user@test'): OTPAuth.TOTP =>
  new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

const FIXED_SECRET_B32 = new OTPAuth.Secret({ size: 20 }).base32;

describe('verifyTotpCode — new shape `{ step } | null` (D2, RFC 6238)', () => {
  /**
   * Cast helper — these tests are written against the FUTURE shape ; TypeScript
   * on HEAD `00325d81` still types `verifyTotpCode` as `boolean`. The cast pins
   * the contract for green-phase WITHOUT requiring the prod source to be edited
   * first. Once green ships, the cast becomes a no-op.
   */
  type VerifyResult = { step: number } | null;
  const asVerifyResult = (v: unknown): VerifyResult => v as VerifyResult;

  describe('malformed input → null', () => {
    it('returns null for non-digit input', () => {
      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, 'abcdef'));
      expect(result).toBeNull();
    });

    it('returns null for wrong-length input (5 chars)', () => {
      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, '12345'));
      expect(result).toBeNull();
    });

    it('returns null for wrong-length input (7 chars)', () => {
      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, '1234567'));
      expect(result).toBeNull();
    });

    it('returns null for empty input', () => {
      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, ''));
      expect(result).toBeNull();
    });

    it('returns null for bad base32 secret', () => {
      const result = asVerifyResult(verifyTotpCode('!!!invalid-base32!!!', '123456'));
      expect(result).toBeNull();
    });
  });

  describe('valid input → { step: number }', () => {
    let realDateNow: typeof Date.now;

    beforeEach(() => {
      realDateNow = Date.now;
    });

    afterEach(() => {
      Date.now = realDateNow;
    });

    it('returns an object with a numeric `step` field on a freshly-generated code', () => {
      const totp = makeTotp(FIXED_SECRET_B32);
      const code = totp.generate();

      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, code));

      expect(result).not.toBeNull();
      expect(result).toEqual(expect.objectContaining({ step: expect.any(Number) }));
    });

    it('step equals floor(now/30) when the code is for the current step (delta=0)', () => {
      const fixedTimeMs = 1_747_789_200_000; // 2026-05-21T17:00:00Z UTC — spec.md §6 glossary
      Date.now = () => fixedTimeMs;
      const expectedStep = Math.floor(fixedTimeMs / 1000 / PERIOD_SECONDS); // 58_259_640

      const totp = makeTotp(FIXED_SECRET_B32);
      const code = totp.generate({ timestamp: fixedTimeMs });

      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, code));

      expect(result).not.toBeNull();
      expect(result?.step).toBe(expectedStep);
    });

    it('step is `currentStep - 1` when code matches the previous step (window=1 backward)', () => {
      const fixedTimeMs = 1_747_789_200_000;
      Date.now = () => fixedTimeMs;
      const currentStep = Math.floor(fixedTimeMs / 1000 / PERIOD_SECONDS);

      const totp = makeTotp(FIXED_SECRET_B32);
      // Generate a code valid for the PREVIOUS step.
      const prevStepCode = totp.generate({ timestamp: fixedTimeMs - PERIOD_SECONDS * 1000 });

      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, prevStepCode));

      expect(result).not.toBeNull();
      expect(result?.step).toBe(currentStep - 1);
    });

    it('step is `currentStep + 1` when code matches the next step (window=1 forward)', () => {
      const fixedTimeMs = 1_747_789_200_000;
      Date.now = () => fixedTimeMs;
      const currentStep = Math.floor(fixedTimeMs / 1000 / PERIOD_SECONDS);

      const totp = makeTotp(FIXED_SECRET_B32);
      const nextStepCode = totp.generate({ timestamp: fixedTimeMs + PERIOD_SECONDS * 1000 });

      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, nextStepCode));

      expect(result).not.toBeNull();
      expect(result?.step).toBe(currentStep + 1);
    });

    it('returns null when the code is 2 steps away (outside window)', () => {
      const fixedTimeMs = 1_747_789_200_000;
      Date.now = () => fixedTimeMs;

      const totp = makeTotp(FIXED_SECRET_B32);
      // Generate a code valid for step-2 (outside ±1 window).
      const farCode = totp.generate({ timestamp: fixedTimeMs - 2 * PERIOD_SECONDS * 1000 });

      const result = asVerifyResult(verifyTotpCode(FIXED_SECRET_B32, farCode));

      expect(result).toBeNull();
    });
  });
});
