import * as Sentry from '@sentry/react-native';

import { getErrorMessage, isDailyLimitError } from '@/shared/lib/errors';
import type { SendMessageContext } from './sendStrategy.types';

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
