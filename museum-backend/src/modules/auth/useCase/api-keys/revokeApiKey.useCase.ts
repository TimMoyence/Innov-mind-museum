import { notFound } from '@shared/errors/app.error';

import type { ApiKeyRepository } from '@modules/auth/domain/api-key/apiKey.repository.interface';

/** Soft-delete (isActive=false). Only owner can revoke. */
export class RevokeApiKeyUseCase {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {}

  /** @throws {AppError} 404 if key not found or not owned by the user. */
  async execute(keyId: number, userId: number): Promise<{ revoked: boolean }> {
    const removed = await this.apiKeyRepository.remove(keyId, userId);
    if (!removed) {
      throw notFound('API key not found');
    }
    return { revoked: true };
  }
}
