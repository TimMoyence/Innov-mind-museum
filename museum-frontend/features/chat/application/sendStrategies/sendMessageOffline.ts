import { buildOptimisticMessage, sortByTime } from '../chatSessionLogic.pure';
import type { SendMessageContext, SendResult } from './sendStrategy.types';

/**
 * Offline strategy — queues the outgoing message and adds a local optimistic
 * entry so the user sees their text/image immediately. Returns `false` when the
 * queue enqueue fails (upstream backpressure).
 */
export const sendMessageOffline = async (
  attempt: { text?: string; imageUri?: string },
  context: SendMessageContext,
): Promise<SendResult> => {
  const queued = await context.enqueue({
    sessionId: context.sessionId,
    text: attempt.text,
    imageUri: attempt.imageUri,
  });
  if (!queued) return false;

  const offlineMessage = buildOptimisticMessage({
    text: attempt.text,
    imageUri: attempt.imageUri,
    id: queued.id,
    imageFallbackLabel: context.imageFallbackLabel,
  });
  context.setMessages((prev) => sortByTime([...prev, offlineMessage]));
  return true;
};
