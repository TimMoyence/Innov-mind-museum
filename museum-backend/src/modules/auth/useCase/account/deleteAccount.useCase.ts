import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AudioCleanupPort,
  LeadErasurePort,
  MarketingContactRemovalPort,
  MarketingErasureFallbackPort,
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
 *  3. The Brevo MARKETING contact (removed by email; 404 = already gone). On a
 *     failure (5xx / 429 / timeout) the intent is NOT dropped — it is persisted
 *     as a durable `brevo_erasure` lead (R5) the redelivery cron retries until
 *     the contact is gone, so residual third-party PII cannot survive silently.
 *  3.b The persisted `leads` rows carrying this email (R6) — purged via
 *     `LeadErasurePort.deleteByEmail` BEFORE the cascade, while the email is
 *     still resolvable.
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
/**
 * Named options for {@link DeleteAccountUseCase}. Replaces the prior 7-param
 * positional ctor — every best-effort erasure port is optional + independently
 * swappable for hexagonal testability, so a named-options object reads clearer
 * than positional order and removes the `max-params` friction.
 */
export interface DeleteAccountUseCaseOptions {
  userRepository: IUserRepository;
  imageStorage?: ImageCleanupPort;
  legacyImageRefLookup?: LegacyImageRefLookup;
  audioCleanup?: AudioCleanupPort;
  brevoRemoval?: MarketingContactRemovalPort;
  /** R5 — durable fallback when the inline Brevo `removeContact` fails. */
  marketingErasureFallback?: MarketingErasureFallbackPort;
  /** R6 — purges persisted `leads` rows carrying the account email. */
  leadErasure?: LeadErasurePort;
}

export class DeleteAccountUseCase {
  private readonly userRepository: IUserRepository;
  private readonly imageStorage?: ImageCleanupPort;
  private readonly legacyImageRefLookup?: LegacyImageRefLookup;
  private readonly audioCleanup?: AudioCleanupPort;
  private readonly brevoRemoval?: MarketingContactRemovalPort;
  private readonly marketingErasureFallback?: MarketingErasureFallbackPort;
  private readonly leadErasure?: LeadErasurePort;

  constructor(options: DeleteAccountUseCaseOptions) {
    this.userRepository = options.userRepository;
    this.imageStorage = options.imageStorage;
    this.legacyImageRefLookup = options.legacyImageRefLookup;
    this.audioCleanup = options.audioCleanup;
    this.brevoRemoval = options.brevoRemoval;
    this.marketingErasureFallback = options.marketingErasureFallback;
    this.leadErasure = options.leadErasure;
  }

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
    //    the user email is still available as the contact identifier. On a
    //    failure, enqueue a DURABLE erasure intent (R5) so the contact is still
    //    removed by the redelivery cron — never warn-and-drop (residual PII).
    if (this.brevoRemoval) {
      try {
        await this.brevoRemoval.removeContact(user.email);
      } catch (error) {
        logger.warn('delete_account_brevo_cleanup_failed', {
          userId,
          error: (error as Error).message,
        });
        if (this.marketingErasureFallback) {
          try {
            await this.marketingErasureFallback.enqueueBrevoErasure(user.email);
            logger.info('delete_account_brevo_erasure_enqueued', { userId });
          } catch (enqueueError) {
            // Best-effort: a failed enqueue must NOT abort the DB erasure (R10).
            logger.warn('delete_account_brevo_erasure_enqueue_failed', {
              userId,
              error: (enqueueError as Error).message,
            });
          }
        }
      }
    }

    // 3.b Purge persisted `leads` rows carrying this email (R6). BEFORE the DB
    //     cascade — the email is still resolvable. Best-effort: a leads-store
    //     hiccup must not abort the DB erasure (R10). Logs only `userId` +
    //     `deletedCount` (no email — R12).
    if (this.leadErasure) {
      try {
        const deletedCount = await this.leadErasure.deleteByEmail(user.email.trim().toLowerCase());
        logger.info('delete_account_leads_erasure', { userId, deletedCount });
      } catch (error) {
        logger.warn('delete_account_leads_erasure_failed', {
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
