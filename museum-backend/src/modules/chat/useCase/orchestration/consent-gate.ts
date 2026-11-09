import { resolveActiveProviderForScope } from '@modules/chat/useCase/orchestration/provider-resolver';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { PostMessageInput } from '@modules/chat/domain/chat.types';
import type { PrepareRefused } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';
import type { ThirdPartyAiConsentChecker } from '@modules/chat/useCase/third-party-ai-consent-checker';

export interface ConsentGateInput {
  sessionId: string;
  text: string | undefined;
  image: PostMessageInput['image'];
  imageRef: string | undefined;
  currentUserId: number | undefined;
  requestedLocale: string | undefined;
}

export async function checkThirdPartyAiConsent(args: {
  checker: ThirdPartyAiConsentChecker | undefined;
  input: ConsentGateInput;
}): Promise<PrepareRefused | null> {
  const { checker, input } = args;
  if (!checker) return null;

  const requiredScopes: ConsentScope[] = [];
  if (input.text && input.text.length > 0) {
    requiredScopes.push(resolveActiveProviderForScope('text').scope);
  }
  if (input.image) {
    requiredScopes.push(resolveActiveProviderForScope('image').scope);
  }
  if (requiredScopes.length === 0) return null;

  for (const scope of requiredScopes) {
    const granted = await checker.isGranted(input.currentUserId, scope);
    if (!granted) {
      return buildConsentRefusal({
        sessionId: input.sessionId,
        scope,
        requestedLocale: input.requestedLocale,
      });
    }
  }
  return null;
}

function buildConsentRefusal(params: {
  sessionId: string;
  scope: ConsentScope;
  requestedLocale: string | undefined;
}): PrepareRefused {
  const refusalText = buildConsentRefusalText(params.requestedLocale);
  const refusalMetadata: Record<string, unknown> = {
    phase: 'done',
    refusalReason: 'consent_required',
    consentScope: params.scope,
  };
  const refusal = {
    id: `consent_refusal::${params.scope}`,
    role: 'assistant' as const,
    text: refusalText,
    createdAt: new Date().toISOString(),
  };

  return {
    kind: 'refused',
    result: {
      sessionId: params.sessionId,
      message: refusal,
      metadata: refusalMetadata,
    },
  };
}

function buildConsentRefusalText(requestedLocale: string | undefined): string {
  const lang = (requestedLocale ?? 'en').slice(0, 2).toLowerCase();
  if (lang === 'fr') {
    return "Pour répondre à ce message, j'ai besoin de votre consentement pour partager vos données avec notre fournisseur d'IA. Vous pouvez l'activer dans Paramètres › Confidentialité.";
  }
  return 'To answer this message I need your consent to share your data with our AI provider. You can enable it in Settings › Privacy.';
}
