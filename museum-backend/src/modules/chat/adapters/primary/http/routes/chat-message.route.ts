import { Router } from 'express';

import { parsePostMessageRequest } from '@modules/chat/adapters/primary/http/chat.contracts';
import {
  upload,
  parseContext,
  toImageSource,
  getRequestUser,
  extendTimeoutForUpload,
} from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { dailyChatLimit } from '@src/helpers/middleware/daily-chat-limit.middleware';
import {
  bySession,
  byUserId,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';

import type { PostMessageRequest } from '@modules/chat/adapters/primary/http/chat.contracts';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { Request, Response, RequestHandler } from 'express';

/**
 * Parses and validates message input from an Express request.
 *
 * NOTE on the validation pattern: this route accepts both JSON and multipart
 * form-data (image upload), and `context` arrives as a JSON string via
 * multipart. The Zod schema (`postMessageSchema`) expects a parsed object,
 * so we cannot use `validateBody(postMessageSchema)` middleware directly —
 * we have to JSON-parse `context` first. The error wire format stays
 * consistent with `validateBody` because `parsePostMessageRequest` and
 * `validateBody` both delegate to the shared `formatZodIssues` formatter.
 */
function parseMessageInput(req: Request): {
  bodyPayload: PostMessageRequest;
  context: PostMessageRequest['context'];
} {
  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  const parseableBody =
    typeof rawBody.context === 'string' ? { ...rawBody, context: undefined } : rawBody;
  const bodyPayload = parsePostMessageRequest(parseableBody);
  const parsedContext = parseContext(rawBody.context) ?? bodyPayload.context;

  const context = {
    ...parsedContext,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    locale: parsedContext?.locale || req.clientLocale,
    lowDataMode: req.dataMode === 'low',
  };
  return { bodyPayload, context };
}

/** Handler factory: POST /sessions/:id/messages (non-streaming). */
function createPostMessageHandler(chatService: ChatService) {
  return async (req: Request, res: Response) => {
    const currentUser = getRequestUser(req);
    const { bodyPayload, context } = parseMessageInput(req);

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
      req.ip,
    );

    res.status(201).json(result);
  };
}

// SSE streaming handler moved to `./chat-message.sse-dormant.ts` (DEACTIVATED post-V1,
// revival scheduled for V2.1 post-Walk feature). See `docs/adr/ADR-001-sse-streaming-deprecated.md`.

/** Handler factory: GET /art-keywords (list keywords by locale, optional since filter). */
function createListArtKeywordsHandler(artKeywordRepo?: ArtKeywordRepository) {
  return async (req: Request, res: Response): Promise<void> => {
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
    res.status(200).json({
      keywords: keywords.map((k) => ({
        id: k.id,
        keyword: k.keyword,
        locale: k.locale,
        category: k.category,
        updatedAt: k.updatedAt.toISOString(),
      })),
      syncedAt: new Date().toISOString(),
    });
  };
}

/** Handler factory: POST /art-keywords (bulk upsert with input validation). */
function createBulkUpsertArtKeywordsHandler(artKeywordRepo?: ArtKeywordRepository) {
  return async (req: Request, res: Response): Promise<void> => {
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
  };
}

/**
 * Creates the message sub-router (send, stream, list, art-keywords).
 *
 * @param chatService - Injected chat application service.
 * @param artKeywordRepo - Optional art keyword repository for keyword endpoints.
 * @param uploadAdmission - Shared upload-admission middleware (concurrency limiter).
 * @returns Router handling message operations and art-keyword endpoints.
 */
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

  // SEC-20 (2026-04-08): per-authenticated-user limiter complementing the
  // per-session limiter. Without this, a single user can multiply throughput
  // by spawning many sessions in parallel (each gets its own session bucket).
  // Mounted AFTER `isAuthenticated` so byUserId resolves req.user; falls back
  // to byIp for any code path that bypasses auth (defensive).
  const userLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.userLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: byUserId,
  });

  // POST /sessions/:id/messages — send a message (non-streaming)
  router.post(
    '/sessions/:id/messages',
    isAuthenticated,
    dailyChatLimit,
    userLimiter,
    sessionLimiter,
    ...(uploadAdmission ? [uploadAdmission] : []),
    extendTimeoutForUpload,
    upload.single('image'),
    createPostMessageHandler(chatService),
  );

  // POST /sessions/:id/messages/stream — SSE streaming (DEACTIVATED, revival V2.1 post-Walk).
  //   Route intentionally unmounted. Handler `createStreamHandler` + service method kept for revival.
  //   To reactivate: uncomment the `router.post(...)` block below + set EXPO_PUBLIC_CHAT_STREAMING=true on mobile.
  // router.post(
  //   '/sessions/:id/messages/stream',
  //   isAuthenticated,
  //   dailyChatLimit,
  //   userLimiter,
  //   sessionLimiter,
  //   createStreamHandler(chatService),
  // );

  // Art-keywords offline-sync endpoints (handlers extracted for max-lines-per-function compliance).
  router.get('/art-keywords', isAuthenticated, createListArtKeywordsHandler(artKeywordRepo));
  router.post('/art-keywords', isAuthenticated, createBulkUpsertArtKeywordsHandler(artKeywordRepo));

  return router;
};
