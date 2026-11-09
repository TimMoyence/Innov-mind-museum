import { httpRequest } from '@/shared/api/httpRequest';
import { getErrorMessage } from '@/shared/lib/errors';
import { createAppError } from '@/shared/types/AppError';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';

import type { PostMessageResponseDTO } from '../../domain/contracts';
import { isPostMessageResponseDTO } from '../../domain/contracts';
import {
  CHAT_BASE,
  MODEL_REPLY_TIMEOUT_MS,
  appendRnFile,
  audioMimeByExtension,
  ensureContract,
} from './_internals';

export interface PostAudioMessageParams {
  sessionId: string;
  audioUri?: string;
  audioBlob?: Blob;
  museumMode?: boolean;
  location?: string;
  guideLevel?: GuideLevel;
  locale?: string;
  preClassified?: 'art';
  audioDescriptionMode?: boolean;
  voiceMode?: boolean;
  contentPreferences?: ContentPreference[];
}

export const postAudioMessage = async (
  params: PostAudioMessageParams,
): Promise<PostMessageResponseDTO> => {
  const {
    sessionId,
    audioUri,
    audioBlob,
    museumMode,
    location,
    guideLevel,
    locale,
    preClassified,
    audioDescriptionMode,
    voiceMode,
    contentPreferences,
  } = params;

  if (!audioUri && !audioBlob) {
    throw createAppError({
      kind: 'Contract',
      code: 'audio_missing',
      message: 'audioUri or audioBlob is required',
    });
  }

  const fallbackExt = audioBlob?.type.includes('webm') ? 'webm' : 'm4a';
  const fileName = (
    audioUri?.split('/').pop() ?? `voice-${String(Date.now())}.${fallbackExt}`
  ).trim();
  const extension = fileName.includes('.')
    ? (fileName.split('.').pop()?.toLowerCase() ?? fallbackExt)
    : fallbackExt;
  const mimeType = audioBlob?.type ?? audioMimeByExtension[extension] ?? 'audio/mp4';

  const formData = new FormData();
  formData.append(
    'context',
    JSON.stringify({
      museumMode,
      location,
      guideLevel,
      locale,
      preClassified,
      audioDescriptionMode,
      voiceMode,
      contentPreferences,
    }),
  );
  if (audioBlob) {
    formData.append('audio', audioBlob, fileName);
  } else if (audioUri) {
    appendRnFile(formData, 'audio', { uri: audioUri, name: fileName, type: mimeType });
  }

  const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions/${sessionId}/audio`, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeoutMs: MODEL_REPLY_TIMEOUT_MS,
  });

  return ensureContract(data, isPostMessageResponseDTO, 'post-audio-message');
};

export const synthesizeSpeech = async (messageId: string): Promise<ArrayBuffer | null> => {
  try {
    const response: ArrayBuffer | null | undefined = await httpRequest<ArrayBuffer | null>(
      `${CHAT_BASE}/messages/${messageId}/tts`,
      {
        method: 'POST',
        responseType: 'arraybuffer',
        timeoutMs: MODEL_REPLY_TIMEOUT_MS,
      },
    );
    if (!response || response.byteLength === 0) {
      return null;
    }
    return response;
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error));
  }
};
