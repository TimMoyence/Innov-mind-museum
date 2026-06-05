import * as Sentry from '@sentry/react-native';

import { getErrorMessage, isDailyLimitError } from '@/shared/lib/errors';
import type { SendMessageContext } from './sendStrategy.types';

/**
 * Cycle 5 (UFR-022 / NFR-6, D3) — a degraded 200 whose assistant text is
 * empty/whitespace/null with no renderable media is silently dropped (no
 * bubble) by the send strategies. This is a degraded signal worth observing,
 * not a client error: emit a non-fatal warning so an over-frequent empty BE
 * response surfaces on the dashboard. No message payload (RGPD/secret-safe),
 * option-arg pattern only (no global scope mutation — lib-docs §Anti-patterns).
 */
export const logEmptyAssistantResponse = (strategy: 'streaming' | 'audio' | 'cache'): void => {
  Sentry.captureMessage('chat.emptyAssistantResponse', {
    level: 'warning',
    tags: { flow: 'chat.sendMessage', strategy },
  });
};

/**
 * Shared error handler for `sendMessageAudio` and `sendMessageStreaming`.
 * Removes the transient streaming placeholder, marks the optimistic user
 * message as failed and routes the error to `setError` / daily-limit state.
 */
export const handleSendError = (
  error: unknown,
  optimisticMessageId: string,
  context: SendMessageContext,
): void => {
  Sentry.captureException(error, { tags: { flow: 'chat.sendMessage' } });
  context.setIsStreaming(false);
  context.resetStreaming();

  context.setMessages((prev) =>
    prev
      .filter((message) => !message.id.endsWith('-streaming'))
      .map((message) =>
        message.id === optimisticMessageId ? { ...message, sendFailed: true } : message,
      ),
  );

  if (isDailyLimitError(error)) {
    context.setDailyLimitReached(true);
    return;
  }

  context.setError(getErrorMessage(error));
};
