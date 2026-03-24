import { Request, Router } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import multer from 'multer';

import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import {
  bySession,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';
import { AppError, badRequest } from '@shared/errors/app.error';
import {
  initSseResponse,
  sendSseToken,
  sendSseDone,
  sendSseError,
  sendSseGuardrail,
} from './sse.helpers';
import { resolveLocalImageFilePath } from '../../secondary/image-storage.stub';
import {
  buildS3SignedReadUrlFromRef,
  isS3ImageRef,
} from '../../secondary/image-storage.s3';
import { ChatService } from '../../../application/chat.service';
import {
  buildSignedChatImageReadUrl,
  verifySignedChatImageReadUrl,
} from './chat.image-url';
import {
  parseCreateSessionRequest,
  parseListSessionsQuery,
  parsePostMessageRequest,
  parseReportMessageRequest,
} from './chat.contracts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxImageBytes,
    files: 1,
  },
});

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxAudioBytes,
    files: 1,
  },
});

const parseContext = (
  input: unknown,
): {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
} | undefined => {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }

  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw badRequest('context must be valid JSON when provided as string');
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw badRequest('context must be an object');
  }

  const value = raw as Record<string, unknown>;

  const context: {
    location?: string;
    museumMode?: boolean;
    guideLevel?: 'beginner' | 'intermediate' | 'expert';
    locale?: string;
  } = {};
  if (value.location !== undefined) {
    if (typeof value.location !== 'string') {
      throw badRequest('context.location must be a string');
    }
    context.location = value.location;
  }

  if (value.museumMode !== undefined) {
    if (typeof value.museumMode === 'boolean') {
      context.museumMode = value.museumMode;
    } else if (typeof value.museumMode === 'string') {
      if (value.museumMode.toLowerCase() === 'true') {
        context.museumMode = true;
      } else if (value.museumMode.toLowerCase() === 'false') {
        context.museumMode = false;
      } else {
        throw badRequest('context.museumMode must be a boolean');
      }
    } else {
      throw badRequest('context.museumMode must be a boolean');
    }
  }

  if (value.guideLevel !== undefined) {
    if (typeof value.guideLevel !== 'string') {
      throw badRequest('context.guideLevel must be a string');
    }
    if (!['beginner', 'intermediate', 'expert'].includes(value.guideLevel)) {
      throw badRequest('context.guideLevel must be beginner, intermediate, or expert');
    }
    context.guideLevel = value.guideLevel as 'beginner' | 'intermediate' | 'expert';
  }

  if (value.locale !== undefined) {
    if (typeof value.locale !== 'string') {
      throw badRequest('context.locale must be a string');
    }
    context.locale = value.locale;
  }

  return context;
};

const toImageSource = (
  imageValue: string,
): 'url' | 'base64' => {
  if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
    return 'url';
  }
  return 'base64';
};

const resolveRequestBaseUrl = (req: {
  protocol?: string;
  get?: (name: string) => string | undefined;
}): string | null => {
  const host = req.get?.('host')?.trim();
  if (!host) {
    return null;
  }

  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
};

const contentTypeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const getRequestUser = (req: Request): { id?: number } | undefined => {
  return (req as Request & { user?: { id?: number } }).user;
};

const buildImageReadUrl = (params: {
  baseUrl: string | null;
  messageId: string;
  imageRef: string;
}): { url: string; expiresAt: string } | null => {
  if (isS3ImageRef(params.imageRef)) {
    const s3 = env.storage.s3;
    if (
      !s3?.endpoint ||
      !s3.region ||
      !s3.bucket ||
      !s3.accessKeyId ||
      !s3.secretAccessKey
    ) {
      return null;
    }

    return buildS3SignedReadUrlFromRef({
      imageRef: params.imageRef,
      config: {
        endpoint: s3.endpoint,
        region: s3.region,
        bucket: s3.bucket,
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
        signedUrlTtlSeconds: env.storage.signedUrlTtlSeconds,
        publicBaseUrl: s3.publicBaseUrl,
        sessionToken: s3.sessionToken,
      },
    });
  }

  if (!params.baseUrl) {
    return null;
  }

  return buildSignedChatImageReadUrl({
    baseUrl: params.baseUrl,
    messageId: params.messageId,
  });
};

/**
 * Builds Express router for chat endpoints (sessions, messages, audio, image serving, reporting).
 * @param chatService - Injected chat application service.
 * @returns Configured Express Router.
 */
export const createChatRouter = (chatService: ChatService): Router => {
  const router = Router();

  const sessionLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.sessionLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: bySession,
  });

  router.post('/sessions', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      const payload = parseCreateSessionRequest(req.body || {});
      const session = await chatService.createSession({
        ...payload,
        locale: payload.locale || req.clientLocale,
        userId: currentUser?.id,
        museumId: payload.museumId ?? (req as Request & { museumId?: number }).museumId,
      });
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sessions', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      if (!currentUser?.id) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Token required' },
        });
        return;
      }

      const query = parseListSessionsQuery(req.query || {});
      const result = await chatService.listSessions(query, currentUser.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/sessions/:id', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      const result = await chatService.deleteSessionIfEmpty(
        req.params.id,
        currentUser?.id,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/sessions/:id/messages',
    isAuthenticated,
    sessionLimiter,
    upload.single('image'),
    async (req, res, next) => {
      try {
        const currentUser = getRequestUser(req);
        const rawBody = (req.body || {}) as Record<string, unknown>;
        const parseableBody =
          typeof rawBody.context === 'string'
            ? { ...rawBody, context: undefined }
            : rawBody;
        const bodyPayload = parsePostMessageRequest(parseableBody);

        const parsedContext = parseContext(rawBody.context) || bodyPayload.context;
        const context = {
          ...parsedContext,
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

  router.post(
    '/sessions/:id/messages/stream',
    isAuthenticated,
    sessionLimiter,
    async (req, res) => {
      if (!env.featureFlags.streaming) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Streaming not enabled' } });
        return;
      }

      res.setTimeout(0);
      req.socket.setTimeout(0);
      initSseResponse(res);

      const controller = new AbortController();
      res.on('close', () => controller.abort());

      // Hard timeout: cut SSE after 60s — if response takes longer, something is wrong
      // (LLM budget is 25s; beyond 60s = zombie connection or provider failure)
      const SSE_TIMEOUT_MS = 60_000;
      const sseTimer = setTimeout(() => {
        if (!res.writableEnded && !res.destroyed) {
          sendSseError(res, 'TIMEOUT', 'Stream timeout exceeded (60s). The response took too long.');
          controller.abort();
          res.end();
        }
      }, SSE_TIMEOUT_MS);

      try {
        const currentUser = getRequestUser(req);
        const rawBody = (req.body || {}) as Record<string, unknown>;
        const parseableBody =
          typeof rawBody.context === 'string'
            ? { ...rawBody, context: undefined }
            : rawBody;
        const bodyPayload = parsePostMessageRequest(parseableBody);
        const parsedContext = parseContext(rawBody.context) || bodyPayload.context;
        const context = {
          ...parsedContext,
          locale: parsedContext?.locale || req.clientLocale,
        };

        const result = await chatService.postMessageStream(
          req.params.id,
          { text: bodyPayload.text, context },
          (tokenText) => {
            if (!res.writableEnded && !res.destroyed) sendSseToken(res, tokenText);
          },
          (guardrailText, reason) => {
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
            isKnown ? (error as AppError).code : 'INTERNAL_ERROR',
            isKnown ? error.message : 'Internal server error',
          );
        }
      } finally {
        clearTimeout(sseTimer);
        if (!res.writableEnded) res.end();
      }
    },
  );

  router.post(
    '/sessions/:id/audio',
    isAuthenticated,
    sessionLimiter,
    audioUpload.single('audio'),
    async (req, res, next) => {
      try {
        const currentUser = getRequestUser(req);
        const parsedAudioContext = parseContext(req.body?.context);
        const context = {
          ...parsedAudioContext,
          locale: parsedAudioContext?.locale || req.clientLocale,
        };

        if (!req.file) {
          throw badRequest('audio file is required');
        }

        const result = await chatService.postAudioMessage(
          req.params.id,
          {
            audio: {
              base64: req.file.buffer.toString('base64'),
              mimeType: req.file.mimetype,
              sizeBytes: req.file.size,
            },
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

  router.get('/sessions/:id', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      const result = await chatService.getSession(req.params.id, {
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        limit:
          typeof req.query.limit === 'string'
            ? Number(req.query.limit)
            : undefined,
      }, currentUser?.id);

      const baseUrl = resolveRequestBaseUrl(req);
      result.messages = result.messages.map((message) => {
        if (!message.imageRef) {
          return message;
        }

        const image = buildImageReadUrl({
          baseUrl,
          messageId: message.id,
          imageRef: message.imageRef,
        });

        return {
          ...message,
          image: image ?? null,
        };
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/messages/:messageId/report', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      if (!currentUser?.id) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Token required' },
        });
        return;
      }

      const payload = parseReportMessageRequest(req.body || {});
      const result = await chatService.reportMessage(
        req.params.messageId,
        payload.reason,
        currentUser.id,
        payload.comment,
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/messages/:messageId/image-url', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      const image = await chatService.getMessageImageRef(req.params.messageId, currentUser?.id);
      const signed = buildImageReadUrl({
        baseUrl: resolveRequestBaseUrl(req),
        messageId: req.params.messageId,
        imageRef: image.imageRef,
      });
      if (!signed) {
        throw badRequest('Unable to generate image URL for current storage backend');
      }

      res.status(200).json(signed);
    } catch (error) {
      next(error);
    }
  });

  router.post('/messages/:messageId/tts', isAuthenticated, sessionLimiter, async (req, res, next) => {
    if (!env.featureFlags.voiceMode) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Voice mode is not enabled' } });
      return;
    }

    try {
      const currentUser = getRequestUser(req);
      const result = await chatService.synthesizeSpeech(
        req.params.messageId,
        currentUser?.id,
      );

      if (!result) {
        res.status(204).end();
        return;
      }

      res.set('Content-Type', result.contentType);
      res.set('Content-Length', String(result.audio.length));
      res.send(result.audio);
    } catch (error) {
      next(error);
    }
  });

  router.get('/messages/:messageId/image', async (req, res, next) => {
    try {
      const verification = verifySignedChatImageReadUrl({
        messageId: req.params.messageId,
        token: typeof req.query.token === 'string' ? req.query.token : undefined,
        signature: typeof req.query.sig === 'string' ? req.query.sig : undefined,
      });

      if (!verification.ok) {
        throw badRequest(verification.reason);
      }

      const image = await chatService.getMessageImageRef(req.params.messageId);
      if (isS3ImageRef(image.imageRef)) {
        const signed = buildImageReadUrl({
          baseUrl: resolveRequestBaseUrl(req),
          messageId: req.params.messageId,
          imageRef: image.imageRef,
        });
        if (!signed) {
          throw badRequest('Unable to generate image URL for current storage backend');
        }

        res.redirect(302, signed.url);
        return;
      }

      const imagePath = resolveLocalImageFilePath(image.imageRef, env.storage.localUploadsDir);
      if (!imagePath) {
        res.status(501).json({
          error: {
            code: 'IMAGE_STORAGE_NOT_SUPPORTED',
            message: 'This image backend is not yet supported for direct read URLs.',
          },
        });
        return;
      }

      const fileStat = await stat(imagePath);
      const ext = image.fileName?.split('.').pop()?.toLowerCase() || '';
      const contentType = image.contentType || contentTypeByExtension[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(fileStat.size));
      res.setHeader('Cache-Control', 'private, max-age=60');

      const stream = createReadStream(imagePath);
      stream.on('error', next);
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
