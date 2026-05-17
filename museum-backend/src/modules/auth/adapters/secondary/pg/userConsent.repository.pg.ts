import { IsNull } from 'typeorm';

import { UserConsent } from '@modules/auth/domain/consent/userConsent.entity';

import type { ConsentScope, ConsentSource } from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM implementation of {@link IUserConsentRepository}. */
export class UserConsentRepositoryPg implements IUserConsentRepository {
  private readonly repo: Repository<UserConsent>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(UserConsent);
  }

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

  /** Idempotent: no-op if no active grant exists. */
  async revoke(userId: number, scope: ConsentScope): Promise<void> {
    await this.repo.update({ userId, scope, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async isGranted(userId: number, scope: ConsentScope): Promise<boolean> {
    const count = await this.repo.count({
      where: { userId, scope, revokedAt: IsNull() },
    });
    return count > 0;
  }

  async listForUser(userId: number): Promise<UserConsent[]> {
    return await this.repo.find({
      where: { userId },
      order: { grantedAt: 'DESC' },
    });
  }
}
