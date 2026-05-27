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

/**
 * Streaming strategy — SSE path via `sendMessageSmart` for text / image messages.
 * Shows a streaming placeholder that is progressively filled via `onToken`
 * callbacks and finalized via `onDone`. On cache-eligible first-turn text-only
 * museum sessions, stores the answer in `chatLocalCache` for future low-data
 * hits.
 */
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

        // A5 (R22) — telemetry-only consume of `metadata.phase`. The phase is
        // a BE-owned audit signal ; the FE displays its own simulated phase
        // via `useStatusPhase` (R10-R17). When the field is absent (legacy
        // messages, R23) we silently skip — no throw, no log.
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
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
                  metadata: (payload.metadata as ChatUiMessageMetadata) ?? null,
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

    // Non-streaming fallback (image messages or streaming not available)
    if (response && context.streamingIdRef.current) {
      context.resetStreaming();
      // A5 (R22) — same telemetry hook as the SSE `onDone` branch above. The
      // BE today returns sync (SSE deprecated), so this is the live path.
      logPhaseTelemetry(response.metadata, {
        sessionId: context.sessionId,
        messageId: response.message.id,
      });
      // Cycle 5 (D1/D7) — a response is renderable when its text is non-blank OR
      // it carries enriched media (images / compareResults). A blank/whitespace/
      // null response with no media must NOT leave a bubble: we drop the orphan
      // `-streaming` placeholder (symmetric to `handleSendError`) rather than
      // finalize it into a phantom empty bubble.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
      const responseMetadata = (response.metadata as ChatUiMessageMetadata) ?? null;
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

      // Keep the optimistic user message with its local file:// URL — it renders
      // reliably on-device. Refreshing eagerly here risks overwriting a working
      // local preview with an unreachable signed URL.
    }

    context.setIsStreaming(false);

    // Cache successful text-only first-turn museum responses for future low-data hits.
    // Cycle 5 — never persist a non-renderable answer (empty/whitespace) or it
    // re-poisons the cache and a future low-data hit renders an empty bubble.
    if (
      response &&
      context.museumName &&
      attempt.text &&
      !attempt.imageUri &&
      attempt.isFirstTurn &&
      isRenderableAssistantContent(
        response.message.text,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
        (response.metadata as ChatUiMessageMetadata) ?? null,
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
