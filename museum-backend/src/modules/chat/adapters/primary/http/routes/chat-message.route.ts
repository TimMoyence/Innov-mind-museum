import { Router } from 'express';

import { UserRole } from '@modules/auth/domain/user/user-role';
import { parsePostMessageRequest } from '@modules/chat/adapters/primary/http/chat.contracts';
import {
  upload,
  parseContext,
  toImageSource,
  getRequestUser,
  extendTimeoutForUpload,
} from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import { idempotencyMiddleware } from '@modules/chat/adapters/primary/http/middleware/idempotency.middleware';
import { invalidInput } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { dailyChatLimit } from '@shared/middleware/daily-chat-limit.middleware';
import { llmCostGuard } from '@shared/middleware/llm-cost-guard.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import {
  bySession,
  byUserId,
  createRateLimitMiddleware,
} from '@shared/middleware/rate-limit.middleware';
import { requireRole } from '@shared/middleware/require-role.middleware';
import { nonEmpty } from '@shared/utils/defaults';
import { env } from '@src/config/env';

import type { PostMessageRequest } from '@modules/chat/adapters/primary/http/chat.contracts';
import type { ArtKeywordRepository } from '@modules/chat/domain/art-keyword/artKeyword.repository.interface';
import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { Request, Response, RequestHandler } from 'express';

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
    locale: nonEmpty(parsedContext?.locale) ?? req.clientLocale,
    lowDataMode: req.dataMode === 'low',
  };
  return { bodyPayload, context };
}

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

    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw invalidInput('session id param is required');
    }

    const result = await chatService.postMessage(
      sessionId,
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

function createListArtKeywordsHandler(artKeywordRepo?: ArtKeywordRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!artKeywordRepo) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Art keywords not enabled' } });
      return;
    }
    const locale = typeof req.query.locale === 'string' ? req.query.locale : '%';
    const sinceRaw = typeof req.query.since === 'string' ? req.query.since : undefined;
    if (sinceRaw && Number.isNaN(Date.parse(sinceRaw))) {
      throw invalidInput('since must be a valid ISO date');
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

function createBulkUpsertArtKeywordsHandler(artKeywordRepo?: ArtKeywordRepository) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!artKeywordRepo) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Art keywords not enabled' } });
      return;
    }
    const { keywords, locale } = req.body as { keywords?: unknown[]; locale?: string };
    if (!Array.isArray(keywords) || keywords.length === 0) {
      throw invalidInput('keywords must be a non-empty array of strings');
    }
    if (keywords.length > 100) {
      throw invalidInput('Maximum 100 keywords per request');
    }
    const validated = keywords.filter(
      (k): k is string => typeof k === 'string' && k.trim().length > 0 && k.length <= 200,
    );
    if (validated.length === 0) {
      throw invalidInput('keywords must contain at least one valid string');
    }
    if (locale && (typeof locale !== 'string' || locale.length > 10)) {
      throw invalidInput('locale must be a string of max 10 characters');
    }
    await artKeywordRepo.bulkUpsert(validated, locale ?? 'en');
    res.status(201).json({ created: validated.length });
  };
}

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

  const userLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.userLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: byUserId,
  });

  const taxonomyWriteLimiter = createRateLimitMiddleware({
    limit: 10,
    windowMs: 60_000,
    keyGenerator: byUserId,
    bucketName: 'taxonomy-write',
  });

  router.post(
    '/sessions/:id/messages',
    isAuthenticated,
    dailyChatLimit,
    userLimiter,
    sessionLimiter,
    llmCostGuard,
    idempotencyMiddleware(),
    ...(uploadAdmission ? [uploadAdmission] : []),
    extendTimeoutForUpload,
    upload.single('image'),
    createPostMessageHandler(chatService),
  );

  router.get('/art-keywords', isAuthenticated, createListArtKeywordsHandler(artKeywordRepo));
  router.post(
    '/art-keywords',
    isAuthenticated,
    requireRole(UserRole.ADMIN, UserRole.MODERATOR),
    taxonomyWriteLimiter,
    createBulkUpsertArtKeywordsHandler(artKeywordRepo),
  );

  return router;
};
