import { resolveActiveProviderForScope } from '@modules/chat/useCase/orchestration/provider-resolver';
import { consentRequired } from '@shared/errors/app.error';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { DispatchChannel } from '@modules/chat/useCase/orchestration/provider-resolver';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';

export const missingThirdPartyAiScope = async (
  checker: ThirdPartyAiConsentChecker,
  userId: number | undefined | null,
  channels: readonly DispatchChannel[],
): Promise<ConsentScope | null> => {
  for (const channel of channels) {
    const { scope } = resolveActiveProviderForScope(channel);
    if (!(await checker.isGranted(userId, scope))) return scope;
  }
  return null;
};

export const requireThirdPartyAiConsent = async (
  checker: ThirdPartyAiConsentChecker,
  userId: number | undefined | null,
  channel: 'image' | 'audio',
): Promise<void> => {
  const scope = await missingThirdPartyAiScope(checker, userId, [channel]);
  if (scope !== null) {
    throw consentRequired({ scope });
  }
};
