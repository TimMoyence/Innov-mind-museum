import type { ApiKeyRepository } from '@modules/auth/domain/api-key/apiKey.repository.interface';

/** Never includes hash or salt. */
interface ApiKeyListItem {
  id: number;
  prefix: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

export class ListApiKeysUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  async execute(userId: number): Promise<{ apiKeys: ApiKeyListItem[] }> {
    const keys = await this.apiKeyRepository.findByUserId(userId);

    const apiKeys: ApiKeyListItem[] = keys.map((k) => ({
      id: k.id,
      prefix: `msk_${k.prefix}...`,
      name: k.name,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      expiresAt: k.expiresAt,
      isActive: k.isActive,
    }));

    return { apiKeys };
  }
}
