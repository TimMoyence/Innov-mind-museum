import type { ApiKeyRepository } from '../domain/apiKey.repository.interface';

/** Public API key info — never includes hash or salt. */
export interface ApiKeyListItem {
  id: number;
  prefix: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isActive: boolean;
}

/** Lists a user's API keys with safe, masked output. */
export class ListApiKeysUseCase {
  constructor(private apiKeyRepository: ApiKeyRepository) {}

  /**
   * List all API keys for a user.
   * @param userId - The authenticated user's ID.
   * @returns Array of key metadata (hash and salt are never exposed).
   */
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
