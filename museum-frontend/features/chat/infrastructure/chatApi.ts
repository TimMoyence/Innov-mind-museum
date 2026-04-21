import { httpRequest } from '@/shared/api/httpRequest';
import { openApiRequest } from '@/shared/api/openapiClient';
import { getErrorMessage } from '@/shared/lib/errors';
import { createAppError } from '@/shared/types/AppError';
import type { components } from '@/shared/api/generated/openapi';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';
import { getAccessToken } from '@/features/auth/infrastructure/authTokenStore';
import { getApiBaseUrl, getLocale } from '@/shared/infrastructure/httpClient';
import { getCurrentDataMode } from '@/shared/infrastructure/dataMode/currentDataMode';
import { generateRequestId } from '@/shared/infrastructure/requestId';
import { fetch as expoFetch } from 'expo/fetch';
import { getTraceData, isInitialized } from '@sentry/core';
import type { SseStreamEvent } from './sseParser';
import { parseSseChunk } from './sseParser';
import type {
  CreateSessionRequestDTO,
  CreateSessionResponseDTO,
  DeleteSessionResponseDTO,
  GetSessionResponseDTO,
  ListSessionsRequestDTO,
  ListSessionsResponseDTO,
  PostMessageResponseDTO,
  ReportMessageResponseDTO,
  ReportReason,
} from '../domain/contracts';
import {
  isCreateSessionResponseDTO,
  isDeleteSessionResponseDTO,
  isGetSessionResponseDTO,
  isListSessionsResponseDTO,
  isPostMessageResponseDTO,
  isReportMessageResponseDTO,
} from '../domain/contracts';

type SignedImageUrlResponseDTO = components['schemas']['SignedImageUrlResponse'];

const CHAT_BASE = '/api/chat';

/**
 * Whether SSE streaming is enabled for chat messages.
 *
 * Controlled by `EXPO_PUBLIC_CHAT_STREAMING`. Defaults to `false` — the streaming
 * path is not yet reliable enough for production, so the client falls back to a
 * non-streaming POST and shows a WhatsApp-style typing indicator while waiting.
 */
const isChatStreamingEnabled = (): boolean => {
  const raw = process.env.EXPO_PUBLIC_CHAT_STREAMING?.toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const audioMimeByExtension: Record<string, string> = {
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

const normalizeImageMimeTypeFromExtension = (extensionRaw: string | undefined): string => {
  const extension = (extensionRaw ?? 'jpg').toLowerCase();
  if (extension === 'jpg') {
    return 'image/jpeg';
  }
  if (extension === 'jpeg') {
    return 'image/jpeg';
  }
  if (extension === 'png') {
    return 'image/png';
  }
  if (extension === 'webp') {
    return 'image/webp';
  }
  return `image/${extension}`;
};

const ensureContract = <T>(
  payload: unknown,
  validator: (value: unknown) => value is T,
  label: string,
): T => {
  if (!validator(payload)) {
    throw createAppError({
      kind: 'Contract',
      code: 'invalid',
      message: `Invalid ${label} contract`,
      details: { label },
    });
  }

  return payload;
};

/** Service for chat API operations: session CRUD, messaging (text/image/audio), and message reporting. */
export const chatApi = {
  /**
   * Creates a new chat session.
   * @param payload - Session creation parameters (locale, museum mode, etc.).
   * @returns The created session response, validated against the contract.
   */
  async createSession(payload: CreateSessionRequestDTO): Promise<CreateSessionResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/sessions',
      method: 'post',
      body: JSON.stringify(payload),
    });

    return ensureContract(data, isCreateSessionResponseDTO, 'create-session');
  },

  /**
   * Posts a text or image message to a session and returns the assistant response.
   * Builds a multipart form when an image URI is provided.
   * @param params - Message payload including session ID, optional text, image URI, and context.
   * @returns The assistant's response, validated against the contract.
   */
  async postMessage(params: {
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
  }): Promise<PostMessageResponseDTO> {
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
      formData.append('image', {
        uri: imageUri,
        name: fileName,
        type: normalizeImageMimeTypeFromExtension(extension),
      } as unknown as Blob);

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
  },

  /**
   * Posts an audio message for transcription and returns the assistant response.
   * Accepts either a local audio URI or a Blob.
   * @param params - Audio payload including session ID, audio source, and context.
   * @returns The assistant's response with optional transcription, validated against the contract.
   */
  async postAudioMessage(params: {
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
  }): Promise<PostMessageResponseDTO> {
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
    } else {
      formData.append('audio', {
        uri: audioUri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob);
    }

    const data = await httpRequest<unknown>(`${CHAT_BASE}/sessions/${sessionId}/audio`, {
      method: 'POST',
      body: formData,
    });

    return ensureContract(data, isPostMessageResponseDTO, 'post-audio-message');
  },

  /**
   * Fetches a session with its messages (up to 50 per page).
   * @param sessionId - ID of the session to retrieve.
   * @returns Session details and messages, validated against the contract.
   */
  async getSession(sessionId: string): Promise<GetSessionResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/sessions/{id}',
      method: 'get',
      pathParams: { id: sessionId },
      query: { limit: 50 },
    });

    return ensureContract(data, isGetSessionResponseDTO, 'get-session');
  },

  /**
   * Deletes a session (typically only when it has no messages).
   * @param sessionId - ID of the session to delete.
   * @returns Deletion confirmation, validated against the contract.
   */
  async deleteSessionIfEmpty(sessionId: string): Promise<DeleteSessionResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/sessions/{id}',
      method: 'delete',
      pathParams: { id: sessionId },
    });

    return ensureContract(data, isDeleteSessionResponseDTO, 'delete-session');
  },

  /**
   * Requests a signed URL for a message's attached image.
   * @param messageId - ID of the message whose image URL is needed.
   * @returns A signed URL response with expiration metadata.
   */
  async getMessageImageUrl(messageId: string): Promise<SignedImageUrlResponseDTO> {
    return openApiRequest({
      path: '/api/chat/messages/{messageId}/image-url',
      method: 'post',
      pathParams: { messageId },
    });
  },

  /**
   * Lists chat sessions with cursor-based pagination.
   * @param params - Optional cursor and limit for pagination.
   * @returns Paginated session list, validated against the contract.
   */
  async listSessions(params: ListSessionsRequestDTO = {}): Promise<ListSessionsResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/sessions',
      method: 'get',
      query: {
        cursor: params.cursor,
        limit: params.limit,
      },
    });

    return ensureContract(data, isListSessionsResponseDTO, 'list-sessions');
  },

  /**
   * Reports a message for moderation.
   * @param params - Message ID, report reason, and optional comment.
   * @returns Report confirmation, validated against the contract.
   */
  async reportMessage(params: {
    messageId: string;
    reason: ReportReason;
    comment?: string;
  }): Promise<ReportMessageResponseDTO> {
    const data = await openApiRequest({
      path: '/api/chat/messages/{messageId}/report',
      method: 'post',
      pathParams: { messageId: params.messageId },
      body: JSON.stringify({
        reason: params.reason,
        comment: params.comment,
      }),
    });

    return ensureContract(data, isReportMessageResponseDTO, 'report-message');
  },

  /**
   * Sets or toggles feedback (thumbs up/down) on an assistant message.
   * @param messageId - ID of the message to rate.
   * @param value - 'positive' or 'negative'.
   * @returns Feedback status: created, updated, or removed.
   */
  async setMessageFeedback(
    messageId: string,
    value: 'positive' | 'negative',
  ): Promise<{ messageId: string; status: string }> {
    const data = await openApiRequest({
      path: '/api/chat/messages/{messageId}/feedback',
      method: 'post',
      pathParams: { messageId },
      body: JSON.stringify({ value }),
    });

    return data as { messageId: string; status: string };
  },

  /**
   * Synthesizes speech from an assistant message and returns the audio buffer.
   * @param messageId - ID of the assistant message to synthesize.
   * @returns ArrayBuffer of audio/mpeg data, or null if the message has no text (204).
   */
  async synthesizeSpeech(messageId: string): Promise<ArrayBuffer | null> {
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
  },

  /**
   * Creates a session, re-throwing any error as a plain `Error` with a user-facing message.
   * @param payload - Session creation parameters.
   * @returns The created session response.
   * @throws A plain `Error` wrapping the user-facing error message.
   */
  async createSessionOrThrow(payload: CreateSessionRequestDTO): Promise<CreateSessionResponseDTO> {
    try {
      return await this.createSession(payload);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  },

  /**
   * Posts a text message via SSE streaming. Tokens arrive progressively via onToken.
   * Uses raw fetch() to access the text/event-stream response body.
   *
   * @deprecated SSE streaming retired in V1 — see `docs/adr/ADR-001-sse-streaming-deprecated.md`.
   *   Use `postMessage` instead. Kept for residual client compatibility.
   *
   * @param params - Session ID, text, context, and stream event callbacks.
   */
  async postMessageStream(params: {
    sessionId: string;
    text?: string;
    museumMode?: boolean;
    location?: string;
    guideLevel?: GuideLevel;
    locale?: string;
    preClassified?: 'art';
    audioDescriptionMode?: boolean;
    lowDataMode?: boolean;
    contentPreferences?: ContentPreference[];
    onToken: (text: string) => void;
    onDone: (payload: {
      messageId: string;
      createdAt: string;
      metadata: Record<string, unknown>;
    }) => void;
    onError: (code: string, message: string, requestId?: string) => void;
    onGuardrail?: (text: string, reason: string) => void;
    signal?: AbortSignal;
  }): Promise<void> {
    const baseUrl = getApiBaseUrl();
    const token = getAccessToken();
    const url = `${baseUrl}${CHAT_BASE}/sessions/${params.sessionId}/messages/stream`;

    const traceHeaders = isInitialized() ? getTraceData() : {};
    const requestId = generateRequestId();

    const STREAM_TIMEOUT_MS = 60_000;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort(new DOMException('The operation timed out.', 'TimeoutError'));
    }, STREAM_TIMEOUT_MS);

    // Forward caller's signal to our controller
    if (params.signal) {
      if (params.signal.aborted) {
        timeoutController.abort(params.signal.reason);
      } else {
        params.signal.addEventListener(
          'abort',
          () => {
            timeoutController.abort(params.signal?.reason);
          },
          { once: true },
        );
      }
    }

    const combinedSignal = timeoutController.signal;

    const response = await expoFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'Accept-Language': getLocale(),
        'X-Request-Id': requestId,
        'X-Data-Mode':
          params.lowDataMode === undefined
            ? getCurrentDataMode()
            : params.lowDataMode
              ? 'low'
              : 'normal',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...traceHeaders,
      },
      body: JSON.stringify({
        text: params.text?.trim() ?? undefined,
        context: {
          museumMode: params.museumMode,
          location: params.location,
          guideLevel: params.guideLevel,
          locale: params.locale,
          preClassified: params.preClassified,
          audioDescriptionMode: params.audioDescriptionMode,
          contentPreferences: params.contentPreferences,
        },
      }),
      signal: combinedSignal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw createAppError({
          kind: 'Streaming',
          code: 'unavailable',
          message: 'STREAMING_NOT_AVAILABLE',
          status: 404,
        });
      }
      if (response.status === 401) {
        // Throw so sendMessageSmart falls back to Axios path (which has refresh interceptor)
        throw createAppError({
          kind: 'Streaming',
          code: 'unauthorized',
          message: 'STREAMING_UNAUTHORIZED',
          status: 401,
        });
      }
      // Extract backend error code from response body for precise error classification
      if (response.status === 429) {
        try {
          const body = (await response.json()) as { error?: { code?: string } };
          if (body.error?.code === 'DAILY_LIMIT_REACHED') {
            params.onError('DAILY_LIMIT_REACHED', 'Daily chat limit reached', requestId);
            return;
          }
        } catch {
          /* body parse failed — fall through to generic error */
        }
      }
      params.onError('HTTP_ERROR', `HTTP ${String(response.status)}`, requestId);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated type used within deprecated SSE function implementation (ADR-001)
    const processEvent = (event: SseStreamEvent) => {
      switch (event.type) {
        case 'token':
          params.onToken(event.text);
          break;
        case 'done':
          params.onDone({
            messageId: event.messageId,
            createdAt: event.createdAt,
            metadata: event.metadata,
          });
          break;
        case 'error':
          params.onError(event.code, event.message, requestId);
          break;
        case 'guardrail':
          params.onGuardrail?.(event.text, event.reason);
          break;
      }
    };

    try {
      // Primary: ReadableStream with progressive parsing
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- infinite SSE read loop
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated fn within deprecated SSE impl (ADR-001)
            const { events, remainder } = parseSseChunk(buffer);
            buffer = remainder;
            for (const event of events) {
              processEvent(event);
            }
          }
          // Process any remaining buffer
          if (buffer.trim()) {
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated fn within deprecated SSE impl (ADR-001)
            const { events } = parseSseChunk(buffer + '\n\n');
            for (const event of events) {
              processEvent(event);
            }
          }
        } catch (error) {
          const err = error as Error;
          if (err.name === 'TimeoutError') {
            params.onError(
              'STREAM_TIMEOUT',
              'The response took too long. Please try again.',
              requestId,
            );
          } else if (err.name !== 'AbortError') {
            params.onError('STREAM_ERROR', err.message, requestId);
          }
        }
      } else {
        // Fallback: read full response text and parse all events at once
        const text = await response.text();
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- deprecated fn within deprecated SSE impl (ADR-001)
        const { events } = parseSseChunk(text + '\n\n');
        for (const event of events) {
          processEvent(event);
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /**
   * Smart message sender: tries streaming first, falls back to non-streaming on 404.
   * @returns The full PostMessageResponseDTO (from either path).
   */
  async sendMessageSmart(params: {
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
    onToken?: (text: string) => void;
    onDone?: (payload: {
      messageId: string;
      createdAt: string;
      metadata: Record<string, unknown>;
    }) => void;
    onGuardrail?: (text: string, reason: string) => void;
    signal?: AbortSignal;
  }): Promise<PostMessageResponseDTO | null> {
    // Image messages always use non-streaming path
    if (params.imageUri) {
      return this.postMessage(params);
    }

    // SSE streaming feature flag — when disabled, skip the stream attempt entirely.
    // The UI displays a WhatsApp-style typing indicator while waiting for the full response.
    if (!isChatStreamingEnabled()) {
      return this.postMessage(params);
    }

    // Try streaming
    if (params.onToken) {
      try {
        let result: PostMessageResponseDTO | null = null;
        let streamError: { code: string; message: string } | null = null;

        // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy SSE path kept for residual client compat (ADR-001); new clients use sendMessageSmart non-streaming fallback
        await this.postMessageStream({
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
                text: '', // Text was streamed via onToken
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
        // 404 or 401 — fallback to Axios path (which has refresh interceptor)
        if (msg === 'STREAMING_NOT_AVAILABLE' || msg === 'STREAMING_UNAUTHORIZED') {
          return this.postMessage(params);
        }
        throw error;
      }
    }

    // No onToken callback — use non-streaming
    return this.postMessage(params);
  },
};
