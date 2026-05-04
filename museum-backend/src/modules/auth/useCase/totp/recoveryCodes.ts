import { randomBytes } from 'node:crypto';

import bcrypt from 'bcrypt';

import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import type { TotpRecoveryCode } from '../../domain/totp/totp-secret.entity';

/** Number of recovery codes generated per enrollment (R16). */
export const RECOVERY_CODE_COUNT = 10;

/**
 * Length (after hyphen split) of each generated recovery code. 10 chars from
 * a 32-symbol alphabet ≈ 50 bits of entropy per code, plenty against any
 * online attacker constrained by the route-level rate limiter (5 attempts /
 * 15 min). Exposed as a constant to keep the test fixtures and the format
 * docs perfectly aligned.
 */
export const RECOVERY_CODE_LENGTH = 10;

/**
 * Crockford-base32 alphabet (no I/L/O/U) — readable when printed, no
 * ambiguous characters, 32 symbols so each char carries 5 bits of entropy.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a single human-friendly recovery code. Format: `XXXXX-XXXXX` (so
 * 5+5 grouped for legibility). Each character pulls 5 bits of entropy from
 * `crypto.randomBytes` — total ≈ 50 bits per code.
 */
export function generateRecoveryCodePlain(): string {
  const half = RECOVERY_CODE_LENGTH / 2;
  const bytes = randomBytes(RECOVERY_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i === half - 1) out += '-';
  }
  return out;
}

/**
 * Generates {@link RECOVERY_CODE_COUNT} fresh codes, returning both the plain
 * codes (for one-time display to the user) and the bcrypt-hashed entries to
 * persist via {@link ITotpSecretRepository.upsertEnrollment}.
 *
 * Bcrypt cost is taken from {@link BCRYPT_ROUNDS} so we inherit the same
 * salt-and-cost discipline as user passwords. Hash + verify happen in the
 * recovery flow only, so the constant 10×bcrypt cost on enrollment is fine.
 */
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
 * Looks up a plain code against the persisted hashes. Returns the index of
 * the matched entry, or `-1` when no match exists OR the matched entry has
 * already been consumed.
 *
 * Constant-time semantics rely on bcrypt — but we still scan the entire
 * array even after a match so the caller cannot infer position from latency.
 */
export async function findRecoveryCodeIndex(
  plain: string,
  codes: TotpRecoveryCode[],
): Promise<number> {
  const trimmed = plain.trim().toUpperCase();
  let matched = -1;
  for (let i = 0; i < codes.length; i += 1) {
    const entry = codes[i];
    // Continue iterating after a match to keep timing roughly even.
    const ok = await bcrypt.compare(trimmed, entry.hash);
    if (ok && matched === -1 && entry.consumedAt === null) {
      matched = i;
    }
  }
  return matched;
}

/**
 * Returns a copy of `codes` with `index` flipped to consumed. Caller must
 * persist the returned array via `updateRecoveryCodes`.
 */
export function markCodeConsumed(
  codes: TotpRecoveryCode[],
  index: number,
  at: Date,
): TotpRecoveryCode[] {
  return codes.map((entry, i) =>
    i === index ? { ...entry, consumedAt: at.toISOString() } : entry,
  );
}
