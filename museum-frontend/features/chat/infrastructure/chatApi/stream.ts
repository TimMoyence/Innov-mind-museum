import { fetch as expoFetch } from 'expo/fetch';
import { getTraceData, isInitialized } from '@sentry/core';

import { createAppError } from '@/shared/types/AppError';
import { getAccessToken } from '@/features/auth/infrastructure/authTokenStore';
import { getApiBaseUrl, getLocale } from '@/shared/infrastructure/httpClient';
import { getCurrentDataMode } from '@/shared/infrastructure/dataMode/currentDataMode';
import { generateRequestId } from '@/shared/infrastructure/requestId';
import type { ContentPreference } from '@/shared/types/content-preference';
import type { GuideLevel } from '@/features/settings/runtimeSettings';

import type { SseStreamEvent } from '../sseParser';
import { parseSseChunk } from '../sseParser';
import { CHAT_BASE } from './_internals';

export interface PostMessageStreamParams {
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
}

const STREAM_TIMEOUT_MS = 60_000;

/**
 * Posts a text message via SSE streaming. Tokens arrive progressively via
 * `onToken`. Uses raw `fetch()` to access the `text/event-stream` response
 * body. **Status: deactivated post-V1** (token-fluidity issues, ADR-001) —
 * `isChatStreamingEnabled()` returns `false` by default so `sendMessageSmart`
 * skips this path today; revival scheduled for V2.1 post-Walk.
 */
export const postMessageStream = async (params: PostMessageStreamParams): Promise<void> => {
  const baseUrl = getApiBaseUrl();
  const token = getAccessToken();
  const url = `${baseUrl}${CHAT_BASE}/sessions/${params.sessionId}/messages/stream`;

  const traceHeaders = isInitialized() ? getTraceData() : {};
  const requestId = generateRequestId();

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

  const processEvent = (event: SseStreamEvent): void => {
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

          const { events, remainder } = parseSseChunk(buffer);
          buffer = remainder;
          for (const event of events) {
            processEvent(event);
          }
        }
        if (buffer.trim()) {
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
      const { events } = parseSseChunk(text + '\n\n');
      for (const event of events) {
        processEvent(event);
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }
};
