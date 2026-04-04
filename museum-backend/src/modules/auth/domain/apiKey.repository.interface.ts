import type { ApiKey } from './apiKey.entity';

/** Port for API key persistence operations. */
export interface ApiKeyRepository {
  /** Find an API key by its prefix (first 8 chars after `msk_`). */
  findByPrefix(prefix: string): Promise<ApiKey | null>;

  /** List all API keys belonging to a user. */
  findByUserId(userId: number): Promise<ApiKey[]>;

  /** Persist a new or updated API key. */
  save(key: ApiKey): Promise<ApiKey>;

  /** Soft-delete (deactivate) an API key. Returns true if the key existed and belonged to the user. */
  remove(id: number, userId: number): Promise<boolean>;

  /** Touch `lastUsedAt` timestamp for an API key. */
  updateLastUsed(id: number): Promise<void>;
}
