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
  /**
   * C9.10 (2026-05-17) — set by the STT-message path to opt the response into
   * a 60-80w prose-only branch suited to TTS playback.
   */
  voiceMode?: boolean;
  lowDataMode?: boolean;
  contentPreferences?: ContentPreference[];
  /**
   * D2 (2026-06-01) — OPTIONAL backend dedup key. Set by the offline-flush path
   * to the queued item's stable id so a replayed send (flapping reconnect /
   * double-flush) collapses to a single message. Sent as the `Idempotency-Key`
   * header; omitted (no header) on the live send path, which is unchanged.
   */
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

  // Merge optional headers: X-Data-Mode (low-data toggle) + Idempotency-Key
  // (D2 dedup key, set only on the offline-flush path). Both omitted on the
  // live send path → no header object, request unchanged.
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
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });

  return ensureContract(data, isPostMessageResponseDTO, 'post-message');
};

interface SmartSendDeps {
  postMessage: (params: PostMessageParams) => Promise<PostMessageResponseDTO>;
}

/**
 * Smart message sender — always synchronous. The dormant SSE streaming path
 * was buried (D1): the only transport is the non-streaming `postMessage`.
 * The `onToken`/`onDone`/`onGuardrail`/`signal` callbacks accepted by
 * {@link SendMessageSmartParams} are intentionally ignored here so the LIVE
 * `sendMessageStreaming.ts` strategy keeps type-checking and runs unchanged
 * via the sync fallback block it already documents as the live path.
 *
 * Dependencies are injected so the index façade can wire them while keeping
 * each capability module decoupled.
 */
export const sendMessageSmart =
  (deps: SmartSendDeps) =>
  async (params: SendMessageSmartParams): Promise<PostMessageResponseDTO | null> =>
    deps.postMessage(params);
