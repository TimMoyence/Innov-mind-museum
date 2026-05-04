/**
 * SSE streaming handler — DORMANT module.
 *
 * Status: DEACTIVATED since V1 (token-fluidity issues). Revival scheduled for V2.1
 * post-Walk feature. This module is intentionally not imported by the route layer.
 *
 * Revival steps:
 *   1. Import `createStreamHandler` in `chat-message.route.ts`.
 *   2. Re-add the `router.post('/sessions/:id/messages/stream', …, createStreamHandler(chatService))`
 *      block in `createMessageRouter` (commented guide present there).
 *   3. Set `EXPO_PUBLIC_CHAT_STREAMING=true` on mobile builds.
 *
 * See `docs/adr/ADR-001-sse-streaming-deprecated.md`.
 */
import { getRequestUser } from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import {
  initSseResponse,
  sendSseDone,
  sendSseError,
  sendSseGuardrail,
  sendSseToken,
} from '@modules/chat/adapters/primary/http/helpers/sse.helpers';
import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { Request, Response } from 'express';

/** Sets up SSE keep-alive and hard-timeout timers; returns handles for cleanup. */
export function initSseTimers(
  res: Response,
  controller: AbortController,
): { keepAliveTimer: NodeJS.Timeout; sseTimer: NodeJS.Timeout } {
  const KEEP_ALIVE_MS = 15_000;
  const keepAliveTimer = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(': keep-alive\n\n');
    }
  }, KEEP_ALIVE_MS);

  const SSE_TIMEOUT_MS = env.llm.totalBudgetMs + 10_000;
  const sseTimer = setTimeout(() => {
    if (!res.writableEnded && !res.destroyed) {
      sendSseError(
        res,
        'TIMEOUT',
        `Stream timeout exceeded (${SSE_TIMEOUT_MS / 1_000}s). The response took too long.`,
      );
      controller.abort();
      res.end();
    }
  }, SSE_TIMEOUT_MS);

  return { keepAliveTimer, sseTimer };
}

/** Handler factory for the (dormant) POST /sessions/:id/messages/stream SSE route. */
// eslint-disable-next-line max-lines-per-function -- Dormant SSE handler kept intact for V2.1 revival (ADR-001); splitting now would complicate the planned re-mount.
export function createStreamHandler(
  chatService: ChatService,
  parseMessageInput: (req: Request) => {
    bodyPayload: { text: string; context: unknown };
    context: unknown;
  },
) {
  return async (req: Request, res: Response) => {
    logger.warn('sse.stream.deactivated.hit', { sessionId: req.params.id });

    // RFC 9745 (Deprecation) + RFC 8594 (Sunset) — signals programmatic migration path
    res.set({
      Deprecation: 'true',
      Sunset: 'Sun, 01 Jun 2026 00:00:00 GMT',
      Link: `</api/chat/sessions/${req.params.id}/messages>; rel="successor-version"`,
    });
    res.setTimeout(0);
    req.socket.setTimeout(0);
    initSseResponse(res);

    const controller = new AbortController();
    res.on('close', () => {
      controller.abort();
    });

    const { keepAliveTimer, sseTimer } = initSseTimers(res, controller);

    try {
      const currentUser = getRequestUser(req);
      const { bodyPayload, context } = parseMessageInput(req);

      const result = await chatService.postMessageStream(
        req.params.id,
        { text: bodyPayload.text, context: context as never },
        {
          onToken: (tokenText) => {
            clearInterval(keepAliveTimer);
            if (!res.writableEnded && !res.destroyed) sendSseToken(res, tokenText);
          },
          onGuardrail: (guardrailText, reason) => {
            clearInterval(keepAliveTimer);
            if (!res.writableEnded && !res.destroyed) sendSseGuardrail(res, guardrailText, reason);
          },
          requestId: (req as { requestId?: string }).requestId,
          currentUserId: currentUser?.id,
          signal: controller.signal,
          ip: req.ip,
        },
      );

      if (!res.writableEnded && !res.destroyed) {
        sendSseDone(res, {
          messageId: result.message.id,
          createdAt: result.message.createdAt,
          metadata: result.metadata as Record<string, unknown>,
        });
      }
    } catch (error) {
      if (!res.writableEnded && !res.destroyed) {
        const isKnown = error instanceof AppError;
        sendSseError(
          res,
          isKnown ? error.code : 'INTERNAL_ERROR',
          isKnown ? error.message : 'Internal server error',
        );
      }
    } finally {
      clearInterval(keepAliveTimer);
      clearTimeout(sseTimer);
      if (!res.writableEnded) res.end();
    }
  };
}
