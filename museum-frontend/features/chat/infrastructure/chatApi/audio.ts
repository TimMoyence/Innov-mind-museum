import { httpRequest } from '@/shared/api/httpRequest';
import { getErrorMessage } from '@/shared/lib/errors';
import { createAppError } from '@/shared/types/AppError';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';

import type { PostMessageResponseDTO } from '../../domain/contracts';
import { isPostMessageResponseDTO } from '../../domain/contracts';
import { CHAT_BASE, appendRnFile, audioMimeByExtension, ensureContract } from './_internals';

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
  contentPreferences?: ContentPreference[];
}

/**
 * Posts an audio message for transcription and returns the assistant
 * response. Accepts either a local audio URI or a Blob.
 */
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
  const mimeType = audioBlob?.type ?? (audioMimeByExtension[extension] || 'audio/mp4');

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
  });

  return ensureContract(data, isPostMessageResponseDTO, 'post-audio-message');
};

/**
 * Synthesises speech from an assistant message and returns the audio buffer.
 * Returns `null` when the backend responds 204 (message has no text).
 */
export const synthesizeSpeech = async (messageId: string): Promise<ArrayBuffer | null> => {
  try {
    const response = await httpRequest<ArrayBuffer>(`${CHAT_BASE}/messages/${messageId}/tts`, {
      method: 'POST',
      responseType: 'arraybuffer',
    });
    // 204 No Content: Axios returns empty/zero-length data
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive response check
    if (!response || (response instanceof ArrayBuffer && response.byteLength === 0)) {
      return null;
    }
    return response;
  } catch (error: unknown) {
    throw new Error(getErrorMessage(error));
  }
};
