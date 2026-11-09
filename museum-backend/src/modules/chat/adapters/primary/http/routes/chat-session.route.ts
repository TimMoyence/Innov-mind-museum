import { Router } from 'express';

import { parseListSessionsQuery } from '@modules/chat/adapters/primary/http/chat.contracts';
import {
  getRequestUser,
  resolveRequestBaseUrl,
  buildImageReadUrl,
} from '@modules/chat/adapters/primary/http/helpers/chat-route.helpers';
import {
  createSessionSchema,
  updateSessionContextSchema,
  type CreateSessionBody,
  type UpdateSessionContextBody,
} from '@modules/chat/adapters/primary/http/schemas/chat-session.schemas';
import { invalidInput } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { monthlySessionQuota } from '@shared/middleware/monthly-session-quota.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { byUserId, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';
import { nonEmpty } from '@shared/utils/defaults';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { UpdateSessionContextUseCase } from '@modules/chat/useCase/session/update-session-context.useCase';
import type { Request, Response } from 'express';

const buildGetSessionHandler =
  (chatService: ChatService): ((req: Request, res: Response) => Promise<void>) =>
  async (req, res) => {
    const currentUser = getRequestUser(req);
    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw invalidInput('session id param is required');
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
      if (!message.imageRef) return message;
      const image = buildImageReadUrl({
        baseUrl,
        messageId: message.id,
        imageRef: message.imageRef,
      });
      return { ...message, image: image ?? null };
    });
    res.status(200).json(result);
  };

const buildUpdateSessionContextHandler =
  (
    updateSessionContextUseCase: UpdateSessionContextUseCase,
  ): ((req: Request, res: Response) => Promise<void>) =>
  async (req, res) => {
    const user = requireUser(req);
    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw invalidInput('session id param is required');
    }
    const payload = req.body as UpdateSessionContextBody;
    const result = await updateSessionContextUseCase.execute({
      sessionId,
      currentUserId: user.id,
      ...(Object.prototype.hasOwnProperty.call(payload, 'currentArtworkId')
        ? { currentArtworkId: payload.currentArtworkId ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, 'currentRoom')
        ? { currentRoom: payload.currentRoom ?? null }
        : {}),
    });
    res.status(200).json(result);
  };

export const createSessionRouter = (
  chatService: ChatService,
  updateSessionContextUseCase?: UpdateSessionContextUseCase,
): Router => {
  const router = Router();

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
        locale: nonEmpty(payload.locale) ?? req.clientLocale,
        userId: currentUser?.id,
        museumId: payload.museumId ?? req.museumId ?? undefined,
      });
      res.status(201).json({ session });
    },
  );

  router.get('/sessions', isAuthenticated, async (req, res) => {
    const user = requireUser(req);

    const query = parseListSessionsQuery(req.query);
    const result = await chatService.listSessions(query, user.id);
    res.status(200).json(result);
  });

  router.get('/sessions/:id', isAuthenticated, buildGetSessionHandler(chatService));

  router.delete('/sessions/:id', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw invalidInput('session id param is required');
    }
    const result = await chatService.deleteSessionIfEmpty(sessionId, currentUser?.id);
    res.status(200).json(result);
  });

  if (updateSessionContextUseCase) {
    const contextUpdateLimiter = createRateLimitMiddleware({
      limit: 60,
      windowMs: 60_000,
      keyGenerator: byUserId,
    });
    router.patch(
      '/sessions/:id/context',
      isAuthenticated,
      validateBody(updateSessionContextSchema),
      contextUpdateLimiter,
      buildUpdateSessionContextHandler(updateSessionContextUseCase),
    );
  }

  return router;
};
