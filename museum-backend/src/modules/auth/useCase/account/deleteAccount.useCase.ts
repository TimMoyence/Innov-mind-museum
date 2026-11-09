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

export interface LegacyImageRefLookup {
  findLegacyImageRefsByUserId(userId: number): Promise<string[]>;
}

export type ImageCleanupPort = SharedImageCleanupPort;

export interface DeleteAccountUseCaseOptions {
  userRepository: IUserRepository;
  imageStorage?: ImageCleanupPort;
  legacyImageRefLookup?: LegacyImageRefLookup;
  audioCleanup?: AudioCleanupPort;
  brevoRemoval?: MarketingContactRemovalPort;
  marketingErasureFallback?: MarketingErasureFallbackPort;
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

  async execute(userId: number): Promise<void> {
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new AppError({
        message: 'User not found',
        statusCode: 404,
        code: 'USER_NOT_FOUND',
      });
    }

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
            logger.warn('delete_account_brevo_erasure_enqueue_failed', {
              userId,
              error: (enqueueError as Error).message,
            });
          }
        }
      }
    }

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

    await this.userRepository.deleteUser(userId);
  }

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
