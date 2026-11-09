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
      voiceMode: true,
      contentPreferences:
        context.contentPreferences.length > 0
          ? ([...context.contentPreferences] as ContentPreference[])
          : undefined,
    });

    const assistantMetadata = response.metadata as ChatUiMessageMetadata;
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

    const transcriptionText = assistantMessage.transcription?.text;
    if (transcriptionText) {
      context.setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticMessage.id ? { ...message, text: transcriptionText } : message,
        ),
      );
    }

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
