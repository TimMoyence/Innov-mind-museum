import type { TotpRecoveryCode, TotpSecret } from './totp-secret.entity';

/**
 * Persistence port for the TOTP shared-secret + recovery-codes table.
 *
 * Adapters MUST treat the row as a single durable unit: an enrollment that
 * stores a secret without recovery codes (or vice-versa) is a recovery hazard
 * during incident response. The PG adapter satisfies this by always upserting
 * the full row.
 */
export interface ITotpSecretRepository {
  /** Returns the TotpSecret row for the user, or `null` when MFA has never been touched. */
  findByUserId(userId: number): Promise<TotpSecret | null>;

  /**
   * Insert a fresh enrollment (or rotate an unverified row). Designed for
   * `enrollMfa.useCase.ts`: rotates the encrypted secret and recovery codes,
   * resets `enrolledAt`. Returns the persisted row.
   */
  upsertEnrollment(input: {
    userId: number;
    secretEncrypted: string;
    recoveryCodes: TotpRecoveryCode[];
  }): Promise<TotpSecret>;

  /**
   * Stamp `enrolledAt` (and `lastUsedAt`) on first successful verification.
   * Idempotent — calling twice with the same `at` keeps the earliest non-null
   * `enrolledAt` so we never accidentally back-date a row that had already
   * been confirmed.
   */
  markEnrolled(userId: number, at: Date): Promise<void>;

  /**
   * Update `lastUsedAt`. Called from `challengeMfa` and `verifyMfa` after a
   * successful TOTP / recovery code submission.
   */
  markUsed(userId: number, at: Date): Promise<void>;

  /**
   * Replace the full recovery-code array atomically — used by
   * `recoveryMfa.useCase.ts` to flip a single entry's `consumedAt`. Callers
   * MUST read-modify-write the array they already loaded, the adapter does
   * NOT diff entries.
   */
  updateRecoveryCodes(userId: number, codes: TotpRecoveryCode[]): Promise<void>;

  /** Delete the row outright — used by `disableMfa.useCase.ts`. Idempotent. */
  deleteByUserId(userId: number): Promise<void>;
}
