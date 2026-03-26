import { notFound } from '@shared/errors/app.error';

import type { ApiKeyRepository } from '../domain/apiKey.repository.interface';

/** Revokes (soft-deletes) an API key. Only the key owner can revoke. */
export class RevokeApiKeyUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  /**
   * Revoke an API key by setting isActive = false.
   *
   * @param keyId - The API key ID.
   * @param userId - The authenticated user's ID (must be the key owner).
   * @returns `{ revoked: true }` on success.
   * @throws {AppError} 404 if key not found or not owned by the user.
   */
  async execute(keyId: number, userId: number): Promise<{ revoked: boolean }> {
    const removed = await this.apiKeyRepository.remove(keyId, userId);
    if (!removed) {
      throw notFound('API key not found');
    }
    return { revoked: true };
  }
}
