import { Router } from 'express';

import { AppError, badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { dailyChatLimit } from '@src/helpers/middleware/daily-chat-limit.middleware';
import {
  bySession,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';

import { upload, parseContext, toImageSource, getRequestUser } from './chat-route.helpers';
import { parsePostMessageRequest } from './chat.contracts';
import {
  initSseResponse,
  sendSseToken,
  sendSseDone,
  sendSseError,
  sendSseGuardrail,
} from './sse.helpers';

import type { ChatService } from '../../../application/chat.service';
import type { ArtKeywordRepository } from '../../../domain/artKeyword.repository.interface';
import type { RequestHandler } from 'express';

/**
 * Creates the message sub-router (send, stream, list, art-keywords).
 *
 * @param chatService - Injected chat application service.
 * @param artKeywordRepo - Optional art keyword repository for keyword endpoints.
 * @param uploadAdmission - Shared upload-admission middleware (concurrency limiter).
 * @returns Router handling message operations and art-keyword endpoints.
 */
// eslint-disable-next-line max-lines-per-function -- sub-router registers all message endpoints
export const createMessageRouter = (
  chatService: ChatService,
  artKeywordRepo?: ArtKeywordRepository,
  uploadAdmission?: RequestHandler,
): Router => {
  const router = Router();

  const sessionLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.sessionLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: bySession,
  });

  // POST /sessions/:id/messages — send a message (non-streaming)
  router.post(
    '/sessions/:id/messages',
    isAuthenticated,
    dailyChatLimit,
    sessionLimiter,
    ...(uploadAdmission ? [uploadAdmission] : []),
    upload.single('image'),
    async (req, res, next) => {
      try {
        const currentUser = getRequestUser(req);
        const rawBody = (req.body ?? {}) as Record<string, unknown>;
        const parseableBody =
          typeof rawBody.context === 'string' ? { ...rawBody, context: undefined } : rawBody;
        const bodyPayload = parsePostMessageRequest(parseableBody);

        const parsedContext = parseContext(rawBody.context) ?? bodyPayload.context;
        const context = {
          ...parsedContext,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
          locale: parsedContext?.locale || req.clientLocale,
        };

        const imageFromBody = bodyPayload.image
          ? {
              source: toImageSource(bodyPayload.image),
              value: bodyPayload.image,
            }
          : undefined;

        const image = req.file
          ? {
              source: 'upload' as const,
              value: req.file.buffer.toString('base64'),
              mimeType: req.file.mimetype,
              sizeBytes: req.file.size,
            }
          : imageFromBody;

        const result = await chatService.postMessage(
          req.params.id,
          {
            text: bodyPayload.text,
            image,
            context,
          },
          (req as { requestId?: string }).requestId,
          currentUser?.id,
        );

        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /sessions/:id/messages/stream — SSE streaming message
  router.post(
    '/sessions/:id/messages/stream',
    isAuthenticated,
    dailyChatLimit,
    sessionLimiter,
    // eslint-disable-next-line complexity -- SSE streaming handler manages setup, timeout, error handling, and cleanup
    async (req, res) => {
      if (!env.featureFlags.streaming) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Streaming not enabled' } });
        return;
      }

      res.setTimeout(0);
      req.socket.setTimeout(0);
      initSseResponse(res);

      const controller = new AbortController();
      res.on('close', () => {
        controller.abort();
      });

      // SSE keep-alive: send comment frames every 15s while waiting for
      // semaphore slot / LLM provider so proxies don't drop the connection.
      const KEEP_ALIVE_MS = 15_000;
      const keepAliveTimer = setInterval(() => {
        if (!res.writableEnded && !res.destroyed) {
          res.write(': keep-alive\n\n');
        }
      }, KEEP_ALIVE_MS);

      // Hard timeout: cut SSE after 60s — if response takes longer, something is wrong
      // (LLM budget is 25s; beyond 60s = zombie connection or provider failure)
      const SSE_TIMEOUT_MS = 60_000;
      const sseTimer = setTimeout(() => {
        if (!res.writableEnded && !res.destroyed) {
          sendSseError(
            res,
            'TIMEOUT',
            'Stream timeout exceeded (60s). The response took too long.',
          );
          controller.abort();
          res.end();
        }
      }, SSE_TIMEOUT_MS);

      try {
        const currentUser = getRequestUser(req);
        const rawBody = (req.body ?? {}) as Record<string, unknown>;
        const parseableBody =
          typeof rawBody.context === 'string' ? { ...rawBody, context: undefined } : rawBody;
        const bodyPayload = parsePostMessageRequest(parseableBody);
        const parsedContext = parseContext(rawBody.context) ?? bodyPayload.context;
        const context = {
          ...parsedContext,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
          locale: parsedContext?.locale || req.clientLocale,
        };

        const result = await chatService.postMessageStream(
          req.params.id,
          { text: bodyPayload.text, context },
          (tokenText) => {
            // First real token arrived — stop keep-alive, proxy timeout no longer a risk
            clearInterval(keepAliveTimer);
            if (!res.writableEnded && !res.destroyed) sendSseToken(res, tokenText);
          },
          (guardrailText, reason) => {
            clearInterval(keepAliveTimer);
            if (!res.writableEnded && !res.destroyed) sendSseGuardrail(res, guardrailText, reason);
          },
          (req as { requestId?: string }).requestId,
          currentUser?.id,
          controller.signal,
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
    },
  );

  // GET /art-keywords — list art keywords by locale
  router.get('/art-keywords', isAuthenticated, async (req, res, next) => {
    try {
      if (!artKeywordRepo) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Art keywords not enabled' } });
        return;
      }
      const locale = typeof req.query.locale === 'string' ? req.query.locale : '%';
      const sinceRaw = typeof req.query.since === 'string' ? req.query.since : undefined;
      if (sinceRaw && Number.isNaN(Date.parse(sinceRaw))) {
        throw badRequest('since must be a valid ISO date');
      }
      const keywords = sinceRaw
        ? await artKeywordRepo.findByLocaleSince(locale, new Date(sinceRaw))
        : await artKeywordRepo.findByLocale(locale);
      res.status(200).json({ keywords: keywords.map((k: { keyword: string }) => k.keyword) });
    } catch (error) {
      next(error);
    }
  });

  // POST /art-keywords — bulk upsert art keywords
  router.post('/art-keywords', isAuthenticated, async (req, res, next) => {
    try {
      if (!artKeywordRepo) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Art keywords not enabled' } });
        return;
      }
      const { keywords, locale } = req.body as { keywords?: unknown[]; locale?: string };
      if (!Array.isArray(keywords) || keywords.length === 0) {
        throw badRequest('keywords must be a non-empty array of strings');
      }
      if (keywords.length > 100) {
        throw badRequest('Maximum 100 keywords per request');
      }
      const validated = keywords.filter(
        (k): k is string => typeof k === 'string' && k.trim().length > 0 && k.length <= 200,
      );
      if (validated.length === 0) {
        throw badRequest('keywords must contain at least one valid string');
      }
      if (locale && (typeof locale !== 'string' || locale.length > 10)) {
        throw badRequest('locale must be a string of max 10 characters');
      }
      await artKeywordRepo.bulkUpsert(validated, locale ?? 'en');
      res.status(201).json({ created: validated.length });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
