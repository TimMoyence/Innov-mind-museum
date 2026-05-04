import { IsNull } from 'typeorm';

import { UserConsent } from '../../../domain/consent/userConsent.entity';

import type { ConsentScope, ConsentSource } from '../../../domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '../../../domain/consent/userConsent.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM implementation of {@link IUserConsentRepository}. */
export class UserConsentRepositoryPg implements IUserConsentRepository {
  private readonly repo: Repository<UserConsent>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(UserConsent);
  }

  /** Inserts a new active consent row. */
  async grant(
    userId: number,
    scope: ConsentScope,
    version: string,
    source: ConsentSource,
  ): Promise<UserConsent> {
    const entity = this.repo.create({
      userId,
      scope,
      version,
      source,
      grantedAt: new Date(),
      revokedAt: null,
    });
    return await this.repo.save(entity);
  }

  /**
   * Stamps `revokedAt` on all still-active rows for the (user, scope) pair.
   * Idempotent: no-op if no active grant exists.
   */
  async revoke(userId: number, scope: ConsentScope): Promise<void> {
    await this.repo.update({ userId, scope, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /**
   * Returns true iff at least one active (revokedAt IS NULL) grant exists
   * for the (user, scope) pair.
   */
  async isGranted(userId: number, scope: ConsentScope): Promise<boolean> {
    const count = await this.repo.count({
      where: { userId, scope, revokedAt: IsNull() },
    });
    return count > 0;
  }

  /** Lists the full consent history for a user, most-recent grant first. */
  async listForUser(userId: number): Promise<UserConsent[]> {
    return await this.repo.find({
      where: { userId },
      order: { grantedAt: 'DESC' },
    });
  }
}
