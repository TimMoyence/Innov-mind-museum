import {
  buildOptimisticMessage,
  sortByTime,
  type ChatUiMessage,
  type ChatUiMessageMetadata,
} from '../chatSessionLogic.pure';
import type { SendMessageContext } from './sendStrategy.types';

/** Outcome of the cache strategy — callers use this to decide whether to fall through to streaming. */
export type CacheOutcome =
  | { kind: 'hit' }
  | { kind: 'queued' }
  | { kind: 'miss' }
  | { kind: 'failed' };

/**
 * Low-data cache-first strategy.
 *
 * 1. Looks up a prior answer in `chatLocalCache`.
 * 2. On hit → renders user + cached assistant messages locally, returns `hit`.
 * 3. On miss + offline → enqueues the attempt, returns `queued`.
 * 4. On miss + online → returns `miss` so the caller falls through to streaming.
 */
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
    const userMsg = buildOptimisticMessage({ text: attempt.text });
    const assistantMsg: ChatUiMessage = {
      id: `${String(Date.now())}-cached`,
      role: 'assistant',
      text: cached.answer,
      createdAt: new Date().toISOString(),
      metadata: (cached.metadata as ChatUiMessageMetadata | undefined) ?? null,
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
