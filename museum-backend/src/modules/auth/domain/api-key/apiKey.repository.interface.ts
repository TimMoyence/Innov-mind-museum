import type { ApiKey } from './apiKey.entity';

export interface ApiKeyRepository {
  /** Prefix = first 8 chars after `msk_`. */
  findByPrefix(prefix: string): Promise<ApiKey | null>;

  findByUserId(userId: number): Promise<ApiKey[]>;

  save(key: ApiKey): Promise<ApiKey>;

  /** Soft-delete. Returns true iff the key existed and belonged to the user. */
  remove(id: number, userId: number): Promise<boolean>;

  updateLastUsed(id: number): Promise<void>;
}
