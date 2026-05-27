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
   * Atomic compare-and-set replay-protection (RFC 6238 §5.2). Stamps
   * `last_used_at` + `last_used_step` ONLY IF the stored step is null or strictly
   * less than `step` — so two concurrent requests carrying the same accepted step
   * cannot both win (the DB row write-lock serialises them; the second matches 0
   * rows). Returns `{ affected }`: `affected === 1` ⇒ this caller consumed the
   * step, `affected === 0` ⇒ another request already consumed it (lost the race).
   *
   * `step` is REQUIRED — passing `undefined` would silent-skip the column write
   * under TypeORM 0.3.x (lib-docs/typeorm/LESSONS.md verifyEmail replay 2026-05);
   * the CAS uses `createQueryBuilder().update().where(...).execute()` reading
   * `UpdateResult.affected` (lib-docs/typeorm/LESSONS.md 2026-05-20).
   */
  markUsed(userId: number, at: Date, step: number): Promise<{ affected: number }>;

  /** Atomic replace. Callers MUST read-modify-write — adapter does NOT diff entries. */
  updateRecoveryCodes(userId: number, codes: TotpRecoveryCode[]): Promise<void>;

  /**
   * Atomic compare-and-set consumption of a single recovery-code entry at the
   * JS-resolved `index`. Stamps `recovery_codes[index].consumedAt = at` ONLY IF
   * that entry is still unconsumed (`WHERE (recovery_codes -> :idx ->> 'consumedAt')
   * IS NULL`). Returns `{ affected }`: `affected === 1` ⇒ this caller consumed the
   * code, `affected === 0` ⇒ already consumed (concurrent winner) OR index
   * out-of-range. The `index` is a coordinate found by `findRecoveryCodeIndex`;
   * correctness rests on the `IS NULL` DB guard, not on the read (design §9 D1).
   */
  consumeRecoveryCode(userId: number, index: number, at: Date): Promise<{ affected: number }>;

  /** Idempotent. */
  deleteByUserId(userId: number): Promise<void>;
}
