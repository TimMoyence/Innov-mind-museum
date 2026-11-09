import {
  buildOptimisticMessage,
  isRenderableAssistantContent,
  sortByTime,
  type ChatUiMessage,
  type ChatUiMessageMetadata,
} from '../chatSessionLogic.pure';
import { logEmptyAssistantResponse } from './sendStrategy.shared';
import type { SendMessageContext } from './sendStrategy.types';

export type CacheOutcome =
  | { kind: 'hit' }
  | { kind: 'queued' }
  | { kind: 'miss' }
  | { kind: 'failed' };

export const sendMessageCache = async (
  attempt: { text: string },
  context: SendMessageContext,
): Promise<CacheOutcome> => {
  if (!context.museumName) return { kind: 'miss' };

  const cached = context.cacheLookup({
    text: attempt.text,
    museumId: context.museumName,
    locale: context.locale,
    guideLevel: context.guideLevel,
  });

  if (cached) {
    const cachedMetadata = (cached.metadata as ChatUiMessageMetadata | undefined) ?? null;
    if (!isRenderableAssistantContent(cached.answer, cachedMetadata)) {
      logEmptyAssistantResponse('cache');
      return { kind: 'miss' };
    }

    const userMsg = buildOptimisticMessage({ text: attempt.text });
    const assistantMsg: ChatUiMessage = {
      id: `${String(Date.now())}-cached`,
      role: 'assistant',
      text: cached.answer,
      createdAt: new Date().toISOString(),
      metadata: cachedMetadata,
      cached: true,
    };
    context.setMessages((prev) => sortByTime([...prev, userMsg, assistantMsg]));
    return { kind: 'hit' };
  }

  if (!context.isConnected) {
    const queued = await context.enqueue({
      sessionId: context.sessionId,
      text: attempt.text,
    });
    if (!queued) return { kind: 'failed' };

    const offlineMessage = buildOptimisticMessage({ text: attempt.text, id: queued.id });
    context.setMessages((prev) => sortByTime([...prev, offlineMessage]));
    return { kind: 'queued' };
  }

  return { kind: 'miss' };
};
