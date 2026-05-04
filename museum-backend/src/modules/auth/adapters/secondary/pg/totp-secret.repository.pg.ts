import { TotpSecret, type TotpRecoveryCode } from '../../../domain/totp/totp-secret.entity';

import type { ITotpSecretRepository } from '../../../domain/totp/totp-secret.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM implementation of {@link ITotpSecretRepository}. */
export class TotpSecretRepositoryPg implements ITotpSecretRepository {
  private readonly repo: Repository<TotpSecret>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(TotpSecret);
  }

  /**
   * Returns the row for the given user, or `null` when MFA was never enrolled.
   * Returned `recoveryCodes` always materialises as an array (PG default `[]`).
   */
  async findByUserId(userId: number): Promise<TotpSecret | null> {
    return await this.repo.findOne({ where: { userId } });
  }

  /**
   * Atomically rotates the secret + recovery codes. Designed for both first
   * enrollment and re-enrollment after `disable`. `enrolledAt` is reset to
   * null so the new enrollment must be verified before it can gate login.
   */
  async upsertEnrollment(input: {
    userId: number;
    secretEncrypted: string;
    recoveryCodes: TotpRecoveryCode[];
  }): Promise<TotpSecret> {
    const existing = await this.repo.findOne({ where: { userId: input.userId } });
    if (existing) {
      existing.secretEncrypted = input.secretEncrypted;
      existing.recoveryCodes = input.recoveryCodes;
      existing.enrolledAt = null;
      existing.lastUsedAt = null;
      return await this.repo.save(existing);
    }

    const entity = this.repo.create({
      userId: input.userId,
      secretEncrypted: input.secretEncrypted,
      recoveryCodes: input.recoveryCodes,
      enrolledAt: null,
      lastUsedAt: null,
    });
    return await this.repo.save(entity);
  }

  /**
   * Stamps `enrolledAt` only when it is still null — the conditional UPDATE
   * keeps the earliest enrollment timestamp even if the user re-runs the
   * verification flow accidentally.
   */
  async markEnrolled(userId: number, at: Date): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(TotpSecret)
      .set({ enrolledAt: at, lastUsedAt: at })
      .where('user_id = :userId AND enrolled_at IS NULL', { userId })
      .execute();
  }

  /** Update `lastUsedAt` after a successful TOTP or recovery-code submission. */
  async markUsed(userId: number, at: Date): Promise<void> {
    await this.repo.update({ userId }, { lastUsedAt: at });
  }

  /** Replace the full recovery-code array atomically. */
  async updateRecoveryCodes(userId: number, codes: TotpRecoveryCode[]): Promise<void> {
    await this.repo.update({ userId }, { recoveryCodes: codes });
  }

  /** Idempotent delete — the disable flow can be retried safely. */
  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }
}
