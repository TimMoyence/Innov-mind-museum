import {
  buildOptimisticMessage,
  bumpSuccessfulSend,
  isRenderableAssistantContent,
  sortByTime,
  type ChatUiMessage,
  type ChatUiMessageMetadata,
} from '../chatSessionLogic.pure';
import { incrementCompletedSessions } from '@/shared/infrastructure/inAppReview';
import { handleSendError, logEmptyAssistantResponse } from './sendStrategy.shared';
import { logPhaseTelemetry } from './phase-telemetry';
import type { SendMessageContext, SendResult } from './sendStrategy.types';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';

interface StreamingAttempt {
  text?: string;
  imageUri?: string;
  isFirstTurn: boolean;
}

export const sendMessageStreaming = async (
  attempt: StreamingAttempt,
  context: SendMessageContext,
): Promise<SendResult> => {
  const optimisticMessage = buildOptimisticMessage({
    text: attempt.text,
    imageUri: attempt.imageUri,
    imageFallbackLabel: context.imageFallbackLabel,
  });

  context.setMessages((prev) => sortByTime([...prev, optimisticMessage]));
  context.setError(null);

  try {
    const streamingPlaceholderId = `${String(Date.now())}-streaming`;
    context.streamTextRef.current = '';
    context.streamingIdRef.current = streamingPlaceholderId;

    const streamingPlaceholder: ChatUiMessage = {
      id: streamingPlaceholderId,
      role: 'assistant',
      text: '',
      createdAt: new Date().toISOString(),
      metadata: null,
    };

    context.setMessages((prev) => sortByTime([...prev, streamingPlaceholder]));
    context.setIsStreaming(true);

    const preClassified =
      attempt.text && context.classifyText(attempt.text, context.locale) === 'art'
        ? ('art' as const)
        : undefined;

    const response = await context.chatApi.sendMessageSmart({
      sessionId: context.sessionId,
      text: attempt.text,
      imageUri: attempt.imageUri,
      museumMode: context.museumMode,
      guideLevel: context.guideLevel as GuideLevel,
      locale: context.locale,
      location: context.locationString,
      preClassified,
      audioDescriptionMode: context.audioDescriptionMode ? true : undefined,
      lowDataMode: context.isLowData,
      contentPreferences:
        context.contentPreferences.length > 0
          ? ([...context.contentPreferences] as ContentPreference[])
          : undefined,
      onToken: (chunk) => {
        context.streamTextRef.current += chunk;
        context.scheduleFlush();
      },
      onDone: (payload) => {
        const finalText = context.streamTextRef.current;
        context.resetStreaming();

        logPhaseTelemetry(payload.metadata, {
          sessionId: context.sessionId,
          messageId: payload.messageId,
        });

        context.setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingPlaceholderId
              ? {
                  ...m,
                  id: payload.messageId,
                  text: finalText,
                  createdAt: payload.createdAt,
                  metadata: payload.metadata as ChatUiMessageMetadata,
                  suggestions: (payload.metadata.suggestions as string[] | undefined) ?? undefined,
                }
              : m,
          ),
        );
      },
      onGuardrail: (guardrailText) => {
        context.streamTextRef.current = guardrailText;
        context.flushStreamText();
      },
    });

    if (response && context.streamingIdRef.current) {
      context.resetStreaming();
      logPhaseTelemetry(response.metadata, {
        sessionId: context.sessionId,
        messageId: response.message.id,
      });
      const responseMetadata = response.metadata as ChatUiMessageMetadata;
      if (isRenderableAssistantContent(response.message.text, responseMetadata)) {
        context.setMessages((prev) => {
          const hasPlaceholder = prev.some((m) => m.id === streamingPlaceholderId);
          if (!hasPlaceholder) return prev;

          return prev.map((m) =>
            m.id === streamingPlaceholderId
              ? {
                  id: response.message.id,
                  role: response.message.role as 'assistant',
                  text: response.message.text,
                  createdAt: response.message.createdAt,
                  metadata: responseMetadata,
                  suggestions: response.message.suggestions ?? undefined,
                  image: null,
                }
              : m,
          );
        });
      } else {
        logEmptyAssistantResponse('streaming');
        context.setMessages((prev) => prev.filter((m) => m.id !== streamingPlaceholderId));
      }
    }

    context.setIsStreaming(false);

    if (
      response &&
      context.museumName &&
      attempt.text &&
      !attempt.imageUri &&
      attempt.isFirstTurn &&
      isRenderableAssistantContent(
        response.message.text,
        response.metadata as ChatUiMessageMetadata,
      )
    ) {
      context.cacheStore({
        question: attempt.text,
        answer: response.message.text,
        metadata: response.metadata as Record<string, unknown> | undefined,
        museumId: context.museumName,
        locale: context.locale,
        guideLevel: context.guideLevel,
        cachedAt: Date.now(),
        source: 'previous-call',
      });
    }

    if (bumpSuccessfulSend(context.successfulSendsRef)) {
      void incrementCompletedSessions();
    }
    return true;
  } catch (error) {
    handleSendError(error, optimisticMessage.id, context);
    return false;
  }
};
