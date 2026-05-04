import { type Request, Router } from 'express';

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
import { AppError } from '@shared/errors/app.error';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { validateBody } from '@src/helpers/middleware/validate-body.middleware';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

/**
 * Creates the session CRUD sub-router.
 *
 * @param chatService - Injected chat application service.
 * @returns Router handling session create, list, get, delete.
 */
export const createSessionRouter = (chatService: ChatService): Router => {
  const router = Router();

  // POST /sessions — create a new chat session
  router.post('/sessions', isAuthenticated, validateBody(createSessionSchema), async (req, res) => {
    const currentUser = getRequestUser(req);
    const payload = req.body as CreateSessionBody;
    const session = await chatService.createSession({
      ...payload,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      locale: payload.locale || req.clientLocale,
      userId: currentUser?.id,
      museumId: payload.museumId ?? (req as Request & { museumId?: number }).museumId,
    });
    res.status(201).json({ session });
  });

  // GET /sessions — list user's sessions
  router.get('/sessions', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    if (!currentUser?.id) {
      throw new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const query = parseListSessionsQuery(req.query);
    const result = await chatService.listSessions(query, currentUser.id);
    res.status(200).json(result);
  });

  // GET /sessions/:id — get session with paginated messages
  router.get('/sessions/:id', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    const result = await chatService.getSession(
      req.params.id,
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

  // DELETE /sessions/:id — delete an empty session
  router.delete('/sessions/:id', isAuthenticated, async (req, res) => {
    const currentUser = getRequestUser(req);
    const result = await chatService.deleteSessionIfEmpty(req.params.id, currentUser?.id);
    res.status(200).json(result);
  });

  return router;
};
