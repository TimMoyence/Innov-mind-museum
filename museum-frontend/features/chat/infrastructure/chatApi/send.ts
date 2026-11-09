import { httpRequest } from '@/shared/api/httpRequest';
import { openApiRequest } from '@/shared/api/openapiClient';
import { getErrorMessage } from '@/shared/lib/errors';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';

import type {
  CreateSessionRequestDTO,
  CreateSessionResponseDTO,
  PostMessageResponseDTO,
} from '../../domain/contracts';
import { isCreateSessionResponseDTO, isPostMessageResponseDTO } from '../../domain/contracts';
import {
  CHAT_BASE,
  MODEL_REPLY_TIMEOUT_MS,
  appendRnFile,
  ensureContract,
  normalizeImageMimeTypeFromExtension,
} from './_internals';

export interface PostMessageParams {
  sessionId: string;
  text?: string;
  imageUri?: string;
  museumMode?: boolean;
  location?: string;
  guideLevel?: GuideLevel;
  locale?: string;
  preClassified?: 'art';
  audioDescriptionMode?: boolean;
  voiceMode?: boolean;
  lowDataMode?: boolean;
  contentPreferences?: ContentPreference[];
  idempotencyKey?: string;
}

export interface SendMessageSmartParams extends PostMessageParams {
  onToken?: (text: string) => void;
  onDone?: (payload: {
    messageId: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }) => void;
  onGuardrail?: (text: string, reason: string) => void;
  signal?: AbortSignal;
}

export const createSession = async (
  payload: CreateSessionRequestDTO,
): Promise<CreateSessionResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/sessions',
    method: 'post',
    json: payload,
  });

  return ensureContract(data, isCreateSessionResponseDTO, 'create-session');
};

export const createSessionOrThrow = async (
  payload: CreateSessionRequestDTO,
): Promise<CreateSessionResponseDTO> => {
  try {
    return await createSession(payload);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

export const postMessage = async (params: PostMessageParams): Promise<PostMessageResponseDTO> => {
  const {
    sessionId,
    text,
    imageUri,
    museumMode,
    location,
    guideLevel,
    locale,
    preClassified,
    audioDescriptionMode,
    voiceMode,
    lowDataMode,
    contentPreferences,
    idempotencyKey,
  } = params;

  let payload: unknown;

  if (imageUri) {
    const fileName = imageUri.split('/').pop() ?? 'image.jpg';
    const extension = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';

    const formData = new FormData();
    if (text?.trim()) {
      formData.append('text', text.trim());
    }
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
    appendRnFile(formData, 'image', {
      uri: imageUri,
      name: fileName,
      type: normalizeImageMimeTypeFromExtension(extension),
    });

    payload = formData;
  } else {
    payload = JSON.stringify({
      text: text?.trim() ?? undefined,
      context: {
        museumMode,
        location,
        guideLevel,
        locale,
        preClassified,
        audioDescriptionMode,
        voiceMode,
        contentPreferences,
      },
    });
  }

  const headers: Record<string, string> = {};
  if (lowDataMode !== undefined) {
    headers['X-Data-Mode'] = lowDataMode ? 'low' : 'normal';
  }
  if (idempotencyKey !== undefined) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: payload,
    timeoutMs: MODEL_REPLY_TIMEOUT_MS,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });

  return ensureContract(data, isPostMessageResponseDTO, 'post-message');
};

interface SmartSendDeps {
  postMessage: (params: PostMessageParams) => Promise<PostMessageResponseDTO>;
}

export const sendMessageSmart =
  (deps: SmartSendDeps) =>
  async (params: SendMessageSmartParams): Promise<PostMessageResponseDTO | null> =>
    deps.postMessage(params);
