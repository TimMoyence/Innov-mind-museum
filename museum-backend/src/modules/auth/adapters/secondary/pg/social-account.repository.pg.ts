import { SocialAccount } from '@modules/auth/domain/social-account/socialAccount.entity';

import type {
  ISocialAccountRepository,
  SocialAccountRow,
} from '@modules/auth/domain/social-account/socialAccount.repository.interface';
import type { DataSource, Repository } from 'typeorm';

function toRow(entity: SocialAccount): SocialAccountRow {
  return {
    id: entity.id,
    userId: entity.userId,
    provider: entity.provider,
    providerUserId: entity.providerUserId,
    email: entity.email ?? null,
    createdAt: entity.createdAt,
  };
}

export class SocialAccountRepositoryPg implements ISocialAccountRepository {
  private readonly repo: Repository<SocialAccount>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(SocialAccount);
  }

  async findByProviderAndProviderUserId(
    provider: string,
    providerUserId: string,
  ): Promise<SocialAccountRow | null> {
    const entity = await this.repo.findOne({
      where: { provider, providerUserId },
    });
    return entity ? toRow(entity) : null;
  }

  async findByUserId(userId: number): Promise<SocialAccountRow[]> {
    const entities = await this.repo.find({
      where: { userId },
    });
    return entities.map(toRow);
  }

  async create(params: {
    userId: number;
    provider: string;
    providerUserId: string;
    email?: string | null;
  }): Promise<SocialAccountRow> {
    const entity = this.repo.create({
      userId: params.userId,
      provider: params.provider,
      providerUserId: params.providerUserId,
      email: params.email ?? null,
    });
    const saved = await this.repo.save(entity);
    return toRow(saved);
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }
}
