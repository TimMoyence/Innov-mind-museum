import { withPolicyCitation } from '@modules/chat/useCase/image/chat-image.helpers';

import { buildGuardrailRefusal } from './art-topic-guardrail';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';

/**
 * Pure helper: build the `{ text, metadata, allowed: false }` payload returned
 * by the output guardrail when the LLM response is suppressed. Bundles the
 * localised refusal text with the policy citation merged into the metadata
 * envelope. No I/O, no side effects.
 */
export function buildBlockedOutputPayload(params: {
  reason: GuardrailBlockReason | undefined;
  requestedLocale: string | undefined;
  metadata: ChatAssistantMetadata;
}): { text: string; metadata: ChatAssistantMetadata; allowed: false } {
  return {
    text: buildGuardrailRefusal(params.requestedLocale, params.reason),
    metadata: withPolicyCitation(params.metadata, params.reason),
    allowed: false,
  };
}
