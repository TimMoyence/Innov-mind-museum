import { TotpSecret, type TotpRecoveryCode } from '@modules/auth/domain/totp/totp-secret.entity';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { DataSource, Repository } from 'typeorm';

export class TotpSecretRepositoryPg implements ITotpSecretRepository {
  private readonly repo: Repository<TotpSecret>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(TotpSecret);
  }

  /** `recoveryCodes` always materialises as array (PG default `[]`). */
  async findByUserId(userId: number): Promise<TotpSecret | null> {
    return await this.repo.findOne({ where: { userId } });
  }

  /** Atomic. Resets `enrolledAt=null` so new enrollment must be verified before gating login. */
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

  /** Conditional UPDATE keeps earliest enrollment timestamp even on accidental re-verify. */
  async markEnrolled(userId: number, at: Date): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(TotpSecret)
      .set({ enrolledAt: at, lastUsedAt: at })
      .where('user_id = :userId AND enrolled_at IS NULL', { userId })
      .execute();
  }

  async markUsed(userId: number, at: Date): Promise<void> {
    await this.repo.update({ userId }, { lastUsedAt: at });
  }

  /** Atomic full-array replace. */
  async updateRecoveryCodes(userId: number, codes: TotpRecoveryCode[]): Promise<void> {
    await this.repo.update({ userId }, { recoveryCodes: codes });
  }

  /** Idempotent. */
  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }
}
