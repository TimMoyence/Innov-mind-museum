import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  ImageCleanupPort as SharedImageCleanupPort,
  LegacyImageKeyFetcher,
} from '@shared/ports/image-cleanup.port';

/** Narrow chat-repo projection — keeps auth↔chat coupling minimal, trivial to mock. */
export interface LegacyImageRefLookup {
  /** Every `imageRef` tied to messages whose session belongs to the user. */
  findLegacyImageRefsByUserId(userId: number): Promise<string[]>;
}

/**
 * Re-exported for back-compat. Canonical def in `@shared/ports/image-cleanup.port`
 * so auth no longer takes a static-type dep on chat's `ImageStorage` adapter
 * (still implements this shape structurally).
 */
export type ImageCleanupPort = SharedImageCleanupPort;

/** GDPR right-to-erasure orchestrator. */
export class DeleteAccountUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly imageStorage?: ImageCleanupPort,
    private readonly legacyImageRefLookup?: LegacyImageRefLookup,
  ) {}

  /**
   * Ordering is load-bearing — object-storage cleanup MUST run BEFORE DB rows
   * are wiped. `chat_sessions` are removed first in {@link IUserRepository.deleteUser}
   * (CASCADE → `chat_messages`); after that the `imageRef` column is gone and
   * the legacy lookup returns an empty list.
   *
   * @throws {AppError} 404 if user does not exist.
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

    // 1. Delete stored images (RGPD — SEC-23). MUST run BEFORE DB cascade so
    //    `findLegacyImageRefsByUserId` can still resolve refs for legacy keys.
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

    // 2. Full RGPD deletion — txn: chat_sessions (CASCADE → messages,
    //    artwork_matches, reports), users (CASCADE → refresh_tokens, social_accounts).
    await this.userRepository.deleteUser(userId);
  }

  /** `undefined` when no lookup dependency is wired (tests, non-DB contexts). */
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
