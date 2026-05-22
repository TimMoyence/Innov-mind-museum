import { randomInt } from 'node:crypto';

import bcrypt from 'bcrypt';

import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import type { TotpRecoveryCode } from '@modules/auth/domain/totp/totp-secret.entity';

/** R16. */
export const RECOVERY_CODE_COUNT = 10;

/** ≈50 bits entropy per code (10 chars × 5 bits) — bounded by route limiter (5/15min). */
export const RECOVERY_CODE_LENGTH = 10;

/** Crockford-base32 (no I/L/O/U) — readable, no ambiguous chars, 5 bits/char. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Format: `XXXXX-XXXXX`.
 *
 * Uses `crypto.randomInt(0, N)` (rejection sampling) rather than
 * `randomBytes() % N` so the distribution is provably uniform even if the
 * alphabet is later resized to a non-power-of-2 length. (Today
 * ALPHABET.length = 32, a power of 2 → `byte % 32` is already uniform,
 * but CodeQL `js/biased-cryptographic-random` flags the pattern
 * unconditionally; `randomInt` keeps the call site self-documenting.)
 */
export function generateRecoveryCodePlain(): string {
  const half = RECOVERY_CODE_LENGTH / 2;
  let out = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i += 1) {
    out += ALPHABET[randomInt(0, ALPHABET.length)];
    if (i === half - 1) out += '-';
  }
  return out;
}

/** Returns plain (for one-time display) + bcrypt-hashed entries (persistable). */
export async function generateRecoveryCodes(): Promise<{
  plain: string[];
  persisted: TotpRecoveryCode[];
}> {
  const plain: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
    plain.push(generateRecoveryCodePlain());
  }

  const persisted = await Promise.all(
    plain.map(async (code) => ({
      hash: await bcrypt.hash(code, BCRYPT_ROUNDS),
      consumedAt: null,
    })),
  );

  return { plain, persisted };
}

/**
 * Returns matched index, or -1 (no match OR already consumed). Scans entire
 * array even after match so caller cannot infer position from latency.
 */
export async function findRecoveryCodeIndex(
  plain: string,
  codes: TotpRecoveryCode[],
): Promise<number> {
  const trimmed = plain.trim().toUpperCase();
  let matched = -1;
  for (let i = 0; i < codes.length; i += 1) {
    const entry = codes[i];
    // Continue after match — keeps timing roughly even.
    const ok = await bcrypt.compare(trimmed, entry.hash);
    if (ok && matched === -1 && entry.consumedAt === null) {
      matched = i;
    }
  }
  return matched;
}

/** Caller MUST persist returned array via `updateRecoveryCodes`. */
export function markCodeConsumed(
  codes: TotpRecoveryCode[],
  index: number,
  at: Date,
): TotpRecoveryCode[] {
  return codes.map((entry, i) =>
    i === index ? { ...entry, consumedAt: at.toISOString() } : entry,
  );
}
