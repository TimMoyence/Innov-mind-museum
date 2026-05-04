import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  ImageCleanupPort as SharedImageCleanupPort,
  LegacyImageKeyFetcher,
} from '@shared/ports/image-cleanup.port';

/**
 * Read-only projection of the chat repository needed by {@link DeleteAccountUseCase}.
 *
 * Narrow surface (one method) to keep auth ↔ chat coupling minimal and to let
 * tests inject a trivial mock without mounting the full TypeORM repository.
 */
export interface LegacyImageRefLookup {
  /** Return every `imageRef` tied to messages whose session belongs to the user. */
  findLegacyImageRefsByUserId(userId: number): Promise<string[]>;
}

/**
 * Minimal image-cleanup port consumed by {@link DeleteAccountUseCase}.
 *
 * Re-exported here for backwards compatibility with existing call sites.
 * The canonical definition lives in `@shared/ports/image-cleanup.port` so
 * the auth module no longer takes a static-type dependency on the chat
 * module's `ImageStorage` adapter; chat's `ImageStorage` still implements
 * this shape structurally.
 */
export type ImageCleanupPort = SharedImageCleanupPort;

/** Orchestrates permanent user account deletion (GDPR right-to-erasure). */
export class DeleteAccountUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly imageStorage?: ImageCleanupPort,
    private readonly legacyImageRefLookup?: LegacyImageRefLookup,
  ) {}

  /**
   * Delete a user and all associated data (sessions, messages, tokens, social accounts, images).
   *
   * Ordering is load-bearing — object-storage cleanup MUST run BEFORE the DB
   * rows are wiped. `chat_sessions` are removed first in {@link IUserRepository.deleteUser}
   * and CASCADE through `chat_messages`; once that happens the `imageRef` column
   * is gone and the legacy lookup returns an empty list.
   *
   * @param userId - The ID of the user to delete.
   * @throws {AppError} 404 if the user does not exist.
   */
  async execute(userId: number): Promise<void> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({
        message: 'User not found',
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    }

    // 1. Delete stored images (RGPD compliance — SEC-23).
    //    Run BEFORE DB cascade so `findLegacyImageRefsByUserId` can still resolve
    //    refs for records written under the pre-user-scoped key format.
    if (this.imageStorage) {
      try {
        const legacyFetcher = this.buildLegacyFetcher();
        await this.imageStorage.deleteByPrefix(userId, legacyFetcher);
      } catch (error) {
        logger.warn('delete_account_image_cleanup_failed', {
          userId,
          error: (error as Error).message,
        });
      }
    }

    // 2. Full RGPD deletion — transaction:
    //    - chat_sessions (CASCADE → messages, artwork_matches, reports)
    //    - users (CASCADE → refresh_tokens, social_accounts)
    await this.userRepository.deleteUser(userId);
  }

  /**
   * Build the {@link LegacyImageKeyFetcher} passed to the storage adapter, or
   * `undefined` when no lookup dependency is wired (tests, non-DB contexts).
   */
  private buildLegacyFetcher(): LegacyImageKeyFetcher | undefined {
    const lookup = this.legacyImageRefLookup;
    if (!lookup) return undefined;
    return async (lookupUserId: number): Promise<string[]> => {
      try {
        return await lookup.findLegacyImageRefsByUserId(lookupUserId);
      } catch (error) {
        logger.warn('delete_account_legacy_image_lookup_failed', {
          userId: lookupUserId,
          error: (error as Error).message,
        });
        return [];
      }
    };
  }
}
