import { SocialAccount } from '@modules/auth/domain/social-account/socialAccount.entity';

import type {
  ISocialAccountRepository,
  SocialAccountRow,
} from '@modules/auth/domain/social-account/socialAccount.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** Helper to convert a SocialAccount entity to a plain SocialAccountRow DTO. */
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

/** TypeORM implementation of {@link ISocialAccountRepository}. */
export class SocialAccountRepositoryPg implements ISocialAccountRepository {
  private readonly repo: Repository<SocialAccount>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(SocialAccount);
  }

  /**
   * Finds a social account by provider and provider-specific user ID.
   *
   * @param provider - OAuth provider name (e.g. `apple`, `google`).
   * @param providerUserId - The user's ID within the provider.
   * @returns The matching row or `null`.
   */
  async findByProviderAndProviderUserId(
    provider: string,
    providerUserId: string,
  ): Promise<SocialAccountRow | null> {
    const entity = await this.repo.findOne({
      where: { provider, providerUserId },
    });
    return entity ? toRow(entity) : null;
  }

  /**
   * Lists all social accounts linked to a user.
   *
   * @param userId - Numeric user ID.
   * @returns Array of social account rows.
   */
  async findByUserId(userId: number): Promise<SocialAccountRow[]> {
    const entities = await this.repo.find({
      where: { userId },
    });
    return entities.map(toRow);
  }

  /**
   * Links a new social account to an existing user.
   *
   * @param params - User ID, provider, providerUserId, and optional email.
   * @param params.userId - ID of the user to link.
   * @param params.provider - OAuth provider name.
   * @param params.providerUserId - User ID from the OAuth provider.
   * @param params.email - Email associated with the social account.
   * @returns The inserted social account row.
   */
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

  /**
   * Deletes all social accounts linked to a user.
   *
   * @param userId - Numeric user ID.
   */
  async deleteByUserId(userId: number): Promise<void> {
    await this.repo.delete({ userId });
  }
}
