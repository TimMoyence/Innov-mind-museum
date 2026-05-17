import {
  CONTENT_PREFERENCES,
  isContentPreference,
  type ContentPreference,
} from '@modules/auth/domain/consent/content-preference';
import { badRequest, notFound } from '@shared/errors/app.error';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export class UpdateContentPreferencesUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * @throws {AppError} 400 if payload is not an array or any value is invalid.
   * @throws {AppError} 404 if the user does not exist.
   */
  async execute(
    userId: number,
    preferences: unknown,
  ): Promise<{ contentPreferences: ContentPreference[] }> {
    if (!Array.isArray(preferences)) {
      throw badRequest('preferences must be an array');
    }
    // Anti-DoS cap — dedup below guarantees final array ≤ CONTENT_PREFERENCES.length (3).
    if (preferences.length > MAX_RAW_PAYLOAD_LENGTH) {
      throw badRequest(`preferences payload too large`);
    }
    for (const value of preferences) {
      if (!isContentPreference(value)) {
        throw badRequest(
          `invalid preference "${String(value)}"; allowed: ${CONTENT_PREFERENCES.join(', ')}`,
        );
      }
    }

    // Dedupe preserving canonical CONTENT_PREFERENCES order.
    const selected = new Set<ContentPreference>(preferences);
    const deduped = CONTENT_PREFERENCES.filter((p) => selected.has(p));

    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw notFound('User not found');
    }

    await this.userRepository.updateContentPreferences(userId, deduped);
    return { contentPreferences: deduped };
  }
}

const MAX_RAW_PAYLOAD_LENGTH = 50;
