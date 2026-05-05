import { httpRequest } from '@/shared/api/httpRequest';
import { openApiRequest } from '@/shared/api/openapiClient';
import { getErrorMessage } from '@/shared/lib/errors';
import { createAppError } from '@/shared/types/AppError';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';

import type {
  CreateSessionRequestDTO,
  CreateSessionResponseDTO,
  PostMessageResponseDTO,
} from '../../domain/contracts';
import {
  isCreateSessionResponseDTO,
  isPostMessageResponseDTO,
} from '../../domain/contracts';
import {
  CHAT_BASE,
  appendRnFile,
  ensureContract,
  isChatStreamingEnabled,
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
  lowDataMode?: boolean;
  contentPreferences?: ContentPreference[];
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

/** Creates a new chat session and validates the response against the contract. */
export const createSession = async (
  payload: CreateSessionRequestDTO,
): Promise<CreateSessionResponseDTO> => {
  const data = await openApiRequest({
    path: '/api/chat/sessions',
    method: 'post',
    body: JSON.stringify(payload),
  });

  return ensureContract(data, isCreateSessionResponseDTO, 'create-session');
};

/**
 * `createSession` wrapper that re-throws any error as a plain `Error` carrying
 * the user-facing message. Used by UI flows that surface the error directly.
 */
export const createSessionOrThrow = async (
  payload: CreateSessionRequestDTO,
): Promise<CreateSessionResponseDTO> => {
  try {
    return await createSession(payload);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};

/**
 * Posts a text or image message and returns the assistant response. Builds a
 * multipart form when an image URI is provided; falls back to JSON otherwise.
 */
export const postMessage = async (
  params: PostMessageParams,
): Promise<PostMessageResponseDTO> => {
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
    lowDataMode,
    contentPreferences,
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
        contentPreferences,
      },
    });
  }

  const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: payload,
    ...(lowDataMode === undefined
      ? {}
      : { headers: { 'X-Data-Mode': lowDataMode ? 'low' : 'normal' } }),
  });

  return ensureContract(data, isPostMessageResponseDTO, 'post-message');
};

interface SmartSendDeps {
  postMessage: (params: PostMessageParams) => Promise<PostMessageResponseDTO>;
  postMessageStream: (params: import('./stream').PostMessageStreamParams) => Promise<void>;
}

/**
 * Smart message sender: tries SSE streaming first when `onToken` is supplied
 * and the env flag enables it, falls back to non-streaming `postMessage` on
 * `STREAMING_NOT_AVAILABLE` / `STREAMING_UNAUTHORIZED` errors. Image messages
 * always take the non-streaming path.
 *
 * Dependencies are injected so the index façade can wire them while keeping
 * each capability module decoupled.
 */
export const sendMessageSmart = (deps: SmartSendDeps) =>
  async (params: SendMessageSmartParams): Promise<PostMessageResponseDTO | null> => {
    if (params.imageUri) {
      return deps.postMessage(params);
    }

    if (!isChatStreamingEnabled()) {
      return deps.postMessage(params);
    }

    if (params.onToken) {
      try {
        let result: PostMessageResponseDTO | null = null;
        let streamError: { code: string; message: string } | null = null;

        await deps.postMessageStream({
          sessionId: params.sessionId,
          text: params.text,
          museumMode: params.museumMode,
          location: params.location,
          guideLevel: params.guideLevel,
          locale: params.locale,
          lowDataMode: params.lowDataMode,
          contentPreferences: params.contentPreferences,
          onToken: params.onToken,
          onDone: (payload) => {
            result = {
              sessionId: params.sessionId,
              message: {
                id: payload.messageId,
                role: 'assistant',
                text: '',
                createdAt: payload.createdAt,
              },
              metadata: payload.metadata,
            } as PostMessageResponseDTO;
            params.onDone?.(payload);
          },
          onError: (code, message) => {
            streamError = { code, message };
          },
          onGuardrail: params.onGuardrail,
          signal: params.signal,
        });

        const err = streamError as { code: string; message: string } | null;
        if (err) {
          throw createAppError({
            kind: 'Streaming',
            code: 'server_error',
            message: `${err.code}: ${err.message}`,
            details: err,
          });
        }

        return result;
      } catch (error) {
        const msg = (error as Error).message;
        if (msg === 'STREAMING_NOT_AVAILABLE' || msg === 'STREAMING_UNAUTHORIZED') {
          return deps.postMessage(params);
        }
        throw error;
      }
    }

    return deps.postMessage(params);
  };
