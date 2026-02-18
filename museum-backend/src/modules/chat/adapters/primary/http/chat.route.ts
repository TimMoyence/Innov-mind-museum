import { Router } from 'express';
import multer from 'multer';

import { env } from '@src/config/env';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import {
  bySession,
  createRateLimitMiddleware,
} from '@src/helpers/middleware/rate-limit.middleware';
import { badRequest } from '@shared/errors/app.error';
import { ChatService } from '../../../application/chat.service';
import {
  parseCreateSessionRequest,
  parseListSessionsQuery,
  parsePostMessageRequest,
} from './chat.contracts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxImageBytes,
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

export const createChatRouter = (chatService: ChatService): Router => {
  const router = Router();

  const sessionLimiter = createRateLimitMiddleware({
    limit: env.rateLimit.sessionLimit,
    windowMs: env.rateLimit.windowMs,
    keyGenerator: bySession,
  });

  router.post('/sessions', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = req.user as { id?: number } | undefined;
      const payload = parseCreateSessionRequest(req.body || {});
      const session = await chatService.createSession({
        ...payload,
        userId: currentUser?.id,
      });
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  });

  router.get('/sessions', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = req.user as { id?: number } | undefined;
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

  router.post(
    '/sessions/:id/messages',
    isAuthenticated,
    sessionLimiter,
    upload.single('image'),
    async (req, res, next) => {
      try {
        const currentUser = req.user as { id?: number } | undefined;
        const bodyPayload = parsePostMessageRequest(req.body || {});

        const context = parseContext(req.body?.context) || bodyPayload.context;

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

  router.get('/sessions/:id', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = req.user as { id?: number } | undefined;
      const result = await chatService.getSession(req.params.id, {
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        limit:
          typeof req.query.limit === 'string'
            ? Number(req.query.limit)
            : undefined,
      }, currentUser?.id);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
