import { type Request, Router } from 'express';

import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';

import { getRequestUser, resolveRequestBaseUrl, buildImageReadUrl } from './chat-route.helpers';
import { parseCreateSessionRequest, parseListSessionsQuery } from './chat.contracts';

import type { ChatService } from '../../../application/chat.service';

/**
 * Creates the session CRUD sub-router.
 *
 * @param chatService - Injected chat application service.
 * @returns Router handling session create, list, get, delete.
 */
export const createSessionRouter = (chatService: ChatService): Router => {
  const router = Router();

  // POST /sessions — create a new chat session
  router.post('/sessions', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      const payload = parseCreateSessionRequest(req.body ?? {});
      const session = await chatService.createSession({
        ...payload,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        locale: payload.locale || req.clientLocale,
        userId: currentUser?.id,
        museumId: payload.museumId ?? (req as Request & { museumId?: number }).museumId,
      });
      res.status(201).json({ session });
    } catch (error) {
      next(error);
    }
  });

  // GET /sessions — list user's sessions
  router.get('/sessions', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      if (!currentUser?.id) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Token required' },
        });
        return;
      }

      const query = parseListSessionsQuery(req.query);
      const result = await chatService.listSessions(query, currentUser.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  // GET /sessions/:id — get session with paginated messages
  router.get('/sessions/:id', isAuthenticated, async (req, res, next) => {
    try {
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
    } catch (error) {
      next(error);
    }
  });

  // DELETE /sessions/:id — delete an empty session
  router.delete('/sessions/:id', isAuthenticated, async (req, res, next) => {
    try {
      const currentUser = getRequestUser(req);
      const result = await chatService.deleteSessionIfEmpty(req.params.id, currentUser?.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
};
