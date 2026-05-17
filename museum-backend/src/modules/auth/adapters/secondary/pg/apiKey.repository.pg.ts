import { ApiKey } from '@modules/auth/domain/api-key/apiKey.entity';

import type { ApiKeyRepository } from '@modules/auth/domain/api-key/apiKey.repository.interface';
import type { DataSource, Repository } from 'typeorm';

export class ApiKeyRepositoryPg implements ApiKeyRepository {
  private readonly repo: Repository<ApiKey>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(ApiKey);
  }

  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    return await this.repo.findOne({
      where: { prefix, isActive: true },
    });
  }

  async findByUserId(userId: number): Promise<ApiKey[]> {
    return await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

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

  async remove(id: number, userId: number): Promise<boolean> {
    const result = await this.repo.update({ id, userId, isActive: true }, { isActive: false });
    return (result.affected ?? 0) > 0;
  }

  async updateLastUsed(id: number): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }
}
