import { ApiKey } from '../../../domain/api-key/apiKey.entity';

import type { ApiKeyRepository } from '../../../domain/api-key/apiKey.repository.interface';
import type { DataSource, Repository } from 'typeorm';

/** TypeORM implementation of {@link ApiKeyRepository}. */
export class ApiKeyRepositoryPg implements ApiKeyRepository {
  private readonly repo: Repository<ApiKey>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(ApiKey);
  }

  /** Finds an active API key by its prefix. */
  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    return await this.repo.findOne({
      where: { prefix, isActive: true },
    });
  }

  /** Lists all API keys owned by a user, ordered by creation date descending. */
  async findByUserId(userId: number): Promise<ApiKey[]> {
    return await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Inserts a new API key row and returns the persisted record. */
  async save(key: ApiKey): Promise<ApiKey> {
    const entity = this.repo.create({
      prefix: key.prefix,
      hash: key.hash,
      salt: key.salt,
      name: key.name,
      userId: key.userId,
      expiresAt: key.expiresAt,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: isActive may be undefined from external input
      isActive: key.isActive ?? true,
    });
    return await this.repo.save(entity);
  }

  /** Soft-deletes an API key by setting isActive to false. */
  async remove(id: number, userId: number): Promise<boolean> {
    const result = await this.repo.update({ id, userId, isActive: true }, { isActive: false });
    return (result.affected ?? 0) > 0;
  }

  /** Stamps the lastUsedAt timestamp on an API key. */
  async updateLastUsed(id: number): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }
}
