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
import type { SendMessageContext, SendResult } from './sendStrategy.types';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';

/**
 * Direct audio strategy — non-streaming `postAudioMessage` call.
 * Shows an optimistic voice-placeholder, awaits the backend response, updates
 * the placeholder with the transcription text (if any) and appends the
 * assistant reply.
 */
export const sendMessageAudio = async (
  attempt: { text?: string; audioUri?: string; audioBlob?: Blob },
  context: SendMessageContext,
): Promise<SendResult> => {
  const optimisticMessage = buildOptimisticMessage({
    text: attempt.text,
    hasAudio: true,
    audioFallbackLabel: context.audioFallbackLabel,
  });

  context.setMessages((prev) => sortByTime([...prev, optimisticMessage]));
  context.setError(null);

  try {
    const response = await context.chatApi.postAudioMessage({
      sessionId: context.sessionId,
      audioUri: attempt.audioUri,
      audioBlob: attempt.audioBlob,
      museumMode: context.museumMode,
      guideLevel: context.guideLevel as GuideLevel,
      locale: context.locale,
      location: context.locationString,
      audioDescriptionMode: context.audioDescriptionMode ? true : undefined,
      // C9.10 (2026-05-17) — STT inputs always opt into voice-first prompt
      // (60-80w prose answer) because the response will be TTS-played back.
      voiceMode: true,
      contentPreferences:
        context.contentPreferences.length > 0
          ? ([...context.contentPreferences] as ContentPreference[])
          : undefined,
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
    const assistantMetadata = (response.metadata as ChatUiMessageMetadata) ?? null;
    const assistantMessage: ChatUiMessage = {
      id: response.message.id,
      role: response.message.role,
      text: response.message.text,
      createdAt: response.message.createdAt,
      metadata: assistantMetadata,
      suggestions: response.message.suggestions ?? undefined,
      transcription:
        'transcription' in response && response.transcription
          ? { text: (response.transcription as { text: string }).text }
          : null,
    };

    // EARS-9 — the optimistic user bubble keeps the transcription unconditionally,
    // even when the assistant reply is dropped as non-renderable below.
    const transcriptionText = assistantMessage.transcription?.text;
    if (transcriptionText) {
      context.setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticMessage.id ? { ...message, text: transcriptionText } : message,
        ),
      );
    }

    // Cycle 5 (D1/D7) — only append the assistant bubble when it has renderable
    // content (non-blank text OR enriched media). A blank/whitespace/null audio
    // reply must not add a phantom empty bubble.
    if (isRenderableAssistantContent(assistantMessage.text, assistantMetadata)) {
      context.setMessages((prev) => sortByTime([...prev, assistantMessage]));
    } else {
      logEmptyAssistantResponse('audio');
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
