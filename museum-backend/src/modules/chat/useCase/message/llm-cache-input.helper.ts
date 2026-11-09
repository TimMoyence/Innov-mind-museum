import { createHash } from 'node:crypto';

import { env } from '@src/config/env';

import type { PostMessageInput } from '@modules/chat/domain/chat.types';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';
import type { PrepareReady } from '@modules/chat/useCase/orchestration/prepare-message.pipeline';

function hashString16(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function buildLlmCacheInput(
  prep: PrepareReady,
  sanitizedText: string,
  input: PostMessageInput,
): LlmCacheKeyInput | null {
  if (!sanitizedText) return null;
  return {
    model: env.llm.model,
    userId: prep.ownerId ?? 'anon',
    systemSection: 'chat-default',
    locale: prep.requestedLocale ?? 'en',
    museumContext: {
      museumId: prep.session.museumId ?? null,
      museumName: prep.session.museumName ?? null,
    },
    userPreferencesHash: prep.userMemoryBlock ? hashString16(prep.userMemoryBlock) : undefined,
    prompt: sanitizedText,
    imageContentHash: prep.imageContentHash,
    voiceMode: input.context?.voiceMode,
    audioDescriptionMode: input.context?.audioDescriptionMode,
    lowDataMode: input.context?.lowDataMode,
    currentArtworkKey: prep.session.currentArtworkId ?? prep.currentArtwork?.title ?? undefined,
  };
}
