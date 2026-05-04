import { badRequest, notFound } from '@shared/errors/app.error';

import {
  CONTENT_PREFERENCES,
  isContentPreference,
  type ContentPreference,
} from '../../domain/consent/content-preference';

import type { IUserRepository } from '../../domain/user/user.repository.interface';

/**
 * Persists a user's content preferences (which aspects of an artwork they
 * prefer to learn about: history, technique, artist). Validates the input,
 * deduplicates, and caps at the exhaustive set.
 */
export class UpdateContentPreferencesUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  /**
   * Validates, deduplicates, and persists the user's content preferences.
   *
   * @param userId - Authenticated user id.
   * @param preferences - Raw preferences payload (validated at runtime).
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
    // Sanity cap to prevent a malicious client from sending a giant payload.
    // The dedup step below guarantees the final persisted array has at most
    // CONTENT_PREFERENCES.length (3) items, so duplicates in the raw input are fine.
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

    // Dedupe while preserving the canonical order defined in CONTENT_PREFERENCES.
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

/** Anti-DoS cap on the raw preferences payload (before dedup). */
const MAX_RAW_PAYLOAD_LENGTH = 50;
