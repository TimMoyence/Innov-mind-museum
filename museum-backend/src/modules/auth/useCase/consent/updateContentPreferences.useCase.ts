import {
  CONTENT_PREFERENCES,
  isContentPreference,
  type ContentPreference,
} from '@modules/auth/domain/consent/content-preference';
import { invalidInput, notFound } from '@shared/errors/app.error';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export class UpdateContentPreferencesUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(
    userId: number,
    preferences: unknown,
  ): Promise<{ contentPreferences: ContentPreference[] }> {
    if (!Array.isArray(preferences)) {
      throw invalidInput('preferences must be an array');
    }
    if (preferences.length > MAX_RAW_PAYLOAD_LENGTH) {
      throw invalidInput(`preferences payload too large`);
    }
    for (const value of preferences) {
      if (!isContentPreference(value)) {
        throw invalidInput(
          `invalid preference "${String(value)}"; allowed: ${CONTENT_PREFERENCES.join(', ')}`,
        );
      }
    }

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
