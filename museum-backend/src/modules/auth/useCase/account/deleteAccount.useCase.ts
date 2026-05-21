import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AudioCleanupPort,
  MarketingContactRemovalPort,
} from '@shared/ports/audio-cleanup.port';
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

/**
 * GDPR right-to-erasure (Art.17) orchestrator.
 *
 * What this use case erases, in order, BEFORE the DB cascade:
 *  1. S3 chat IMAGES — prefix scan of `chat-images/` filtered to the user's
 *     `/user-<id>/` segment + a DB-sourced legacy/full ref fetcher (the native
 *     scan alone cannot reach every key layout).
 *  2. S3 TTS AUDIO — refs resolved from the DB (`findAudioRefsByUserId`) and
 *     deleted one-by-one via `AudioStorage.deleteByRef` (audio keys have no
 *     user segment, so no prefix delete is possible).
 *  3. The Brevo MARKETING contact (removed by email; 404 = already gone).
 *  4. The DB rows: `chat_sessions` (CASCADE → messages / artwork_matches /
 *     reports / feedback) and `users` (CASCADE → refresh_tokens / social_accounts
 *     / api_keys / consents).
 *
 * NOT erased (by design): the user's `audit_logs` rows — retained under a legal
 * obligation / legitimate interest (immutable INSERT-only hash chain). They
 * remain disclosable via the Art.15 DSAR export, but are not deleted here.
 *
 * Each external (object-storage / Brevo) step is BEST-EFFORT: a failure is
 * logged and swallowed, the remaining steps and the DB erasure still run (R17).
 * This is NOT a "full deletion via DB cascade" — object storage and the
 * marketing contact live outside the DB and are cleaned up explicitly here.
 */
export class DeleteAccountUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly imageStorage?: ImageCleanupPort,
    private readonly legacyImageRefLookup?: LegacyImageRefLookup,
    private readonly audioCleanup?: AudioCleanupPort,
    private readonly brevoRemoval?: MarketingContactRemovalPort,
  ) {}

  /**
   * Ordering is load-bearing — object-storage + marketing cleanup MUST run
   * BEFORE the DB rows are wiped (R16). `chat_sessions` are removed first in
   * {@link IUserRepository.deleteUser} (CASCADE → `chat_messages`), after which
   * the `imageRef` / `audioUrl` columns are gone and the user email is no longer
   * resolvable. All external steps are best-effort (R17).
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

    // 1. Delete stored IMAGES (RGPD — SEC-23). BEFORE DB cascade so
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

    // 2. Delete stored TTS AUDIO (B1, R1-R3). BEFORE DB cascade so the audio
    //    refs (`chat_messages.audioUrl`) can still be resolved from the DB.
    if (this.audioCleanup) {
      try {
        await this.audioCleanup.deleteUserAudio(userId);
      } catch (error) {
        logger.warn('delete_account_audio_cleanup_failed', {
          userId,
          error: (error as Error).message,
        });
      }
    }

    // 3. Remove the Brevo MARKETING contact (B2, R4-R6). BEFORE DB cascade so
    //    the user email is still available as the contact identifier.
    if (this.brevoRemoval) {
      try {
        await this.brevoRemoval.removeContact(user.email);
      } catch (error) {
        logger.warn('delete_account_brevo_cleanup_failed', {
          userId,
          error: (error as Error).message,
        });
      }
    }

    // 4. DB erasure — txn: chat_sessions (CASCADE → messages, artwork_matches,
    //    reports, feedback), users (CASCADE → refresh_tokens, social_accounts,
    //    api_keys, consents). audit_logs are RETAINED (legal obligation).
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
