import { Router } from 'express';

import { parseListSessionsQuery } from '@modules/chat/adapters/primary/http/chat.contracts';
import {
  getRequestUser,
  resolveRequestBaseUrl,
  buildImageReadUrl,
} from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import {
  createSessionSchema,
  type CreateSessionBody,
} from '@modules/chat/adapters/primary/http/schemas/chat-session.schemas';
import { AppError, badRequest } from '@shared/errors/app.error';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { monthlySessionQuota } from '@shared/middleware/monthly-session-quota.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

export const createSessionRouter = (chatService: ChatService): Router => {
  const router = Router();

  // R1 F1 (2026-05-16 ultrareview bug_001) — validateBody MUST run BEFORE
  // monthlySessionQuota: a Zod 400 must short-circuit BEFORE the atomic UPDATE
  // counter (else free-tier slot burned on invalid body → KR4 funnel corruption).
  // Concurrent-race invariant (R1 §3.3 D2) preserved by PG row-lock.
  router.post(
    '/sessions',
    isAuthenticated,
    validateBody(createSessionSchema),
    monthlySessionQuota,
    async (req, res) => {
      const currentUser = getRequestUser(req);
      const payload = req.body as CreateSessionBody;
      const session = await chatService.createSession({
        ...payload,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        locale: payload.locale || req.clientLocale,
        userId: currentUser?.id,
        museumId: payload.museumId ?? req.museumId ?? undefined,
      });
      res.status(201).json({ session });
    },
  );

  router.get('/sessions', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const query = parseListSessionsQuery(req.query);
    const result = await chatService.listSessions(query, currentUser.id);
    res.status(200).json(result);
  });

  router.get('/sessions/:id', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw badRequest('session id param is required');
    }
    const result = await chatService.getSession(
      sessionId,
      {
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
      },
      currentUser?.id,
    );

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
  });

  router.delete('/sessions/:id', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw badRequest('session id param is required');
    }
    const result = await chatService.deleteSessionIfEmpty(sessionId, currentUser?.id);
    res.status(200).json(result);
  });

  return router;
};
