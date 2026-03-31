import { ApiKey } from '@modules/auth/core/domain/apiKey.entity';
import type { ApiKeyRepository } from '@modules/auth/core/domain/apiKey.repository.interface';

/** In-memory implementation of ApiKeyRepository for unit tests. */
export class InMemoryApiKeyRepository implements ApiKeyRepository {
  private keys: ApiKey[] = [];
  private nextId = 1;

  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    return this.keys.find((k) => k.prefix === prefix && k.isActive) ?? null;
  }

  async findByUserId(userId: number): Promise<ApiKey[]> {
    return this.keys.filter((k) => k.userId === userId);
  }

  async save(key: ApiKey): Promise<ApiKey> {
    const saved = { ...key };
    saved.id = this.nextId++;
    saved.createdAt = new Date();
    saved.updatedAt = new Date();
    this.keys.push(saved);
    return saved;
  }

  async remove(id: number, userId: number): Promise<boolean> {
    const key = this.keys.find((k) => k.id === id && k.userId === userId && k.isActive);
    if (!key) return false;
    key.isActive = false;
    return true;
  }

  async updateLastUsed(id: number): Promise<void> {
    const key = this.keys.find((k) => k.id === id);
    if (key) {
      key.lastUsedAt = new Date();
    }
  }

  /** Test helper: get all stored keys (including inactive). */
  getAll(): ApiKey[] {
    return [...this.keys];
  }
}
