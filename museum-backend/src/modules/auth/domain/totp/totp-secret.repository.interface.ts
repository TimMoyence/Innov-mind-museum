import type { TotpRecoveryCode, TotpSecret } from './totp-secret.entity';

/**
 * Port. Adapters MUST treat the row as a single durable unit — an enrollment
 * that stores a secret without recovery codes (or vice-versa) is a recovery
 * hazard during incident response. The PG adapter always upserts the full row.
 */
export interface ITotpSecretRepository {
  findByUserId(userId: number): Promise<TotpSecret | null>;

  /** Rotates encrypted secret + recovery codes, resets `enrolledAt`. */
  upsertEnrollment(input: {
    userId: number;
    secretEncrypted: string;
    recoveryCodes: TotpRecoveryCode[];
  }): Promise<TotpSecret>;

  /**
   * Stamp `enrolledAt` + `lastUsedAt` on first successful verification.
   * Idempotent — keeps earliest non-null `enrolledAt` so we never back-date
   * a row already confirmed.
   */
  markEnrolled(userId: number, at: Date): Promise<void>;

  /**
   * Stamp `last_used_at` AND `last_used_step` (RFC 6238 §5.2 replay-protection).
   * `step` is REQUIRED — passing `undefined` would silent-skip the column write under
   * TypeORM 0.3.x (lib-docs/typeorm/LESSONS.md verifyEmail replay 2026-05).
   */
  markUsed(userId: number, at: Date, step: number): Promise<void>;

  /** Atomic replace. Callers MUST read-modify-write — adapter does NOT diff entries. */
  updateRecoveryCodes(userId: number, codes: TotpRecoveryCode[]): Promise<void>;

  /** Idempotent. */
  deleteByUserId(userId: number): Promise<void>;
}
