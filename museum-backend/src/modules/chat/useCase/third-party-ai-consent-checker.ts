import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

export interface ThirdPartyAiConsentChecker {
  isGranted(userId: number | undefined | null, scope: ConsentScope): Promise<boolean>;
}

export function buildThirdPartyAiConsentChecker(
  repoOverride?: IUserConsentRepository,
): ThirdPartyAiConsentChecker {
  return {
    async isGranted(userId: number | undefined | null, scope: ConsentScope): Promise<boolean> {
      if (userId === undefined || userId === null) {
        return await Promise.resolve(false);
      }
      if (repoOverride) {
        return await repoOverride.isGranted(userId, scope);
      }
      const { userConsentRepository } = await import('@modules/auth/useCase');
      return await userConsentRepository.isGranted(userId, scope);
    },
  };
}
