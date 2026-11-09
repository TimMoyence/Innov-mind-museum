import * as Sentry from '@sentry/react-native';

import { getErrorMessage, isDailyLimitError } from '@/shared/lib/errors';
import type { SendMessageContext } from './sendStrategy.types';

export const logEmptyAssistantResponse = (strategy: 'streaming' | 'audio' | 'cache'): void => {
  Sentry.captureMessage('chat.emptyAssistantResponse', {
    level: 'warning',
    tags: { flow: 'chat.sendMessage', strategy },
  });
};

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
