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
import { badRequest } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { monthlySessionQuota } from '@shared/middleware/monthly-session-quota.middleware';
import { parseStringParam } from '@shared/middleware/parseStringParam';
import { byUserId, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import type { UpdateSessionContextUseCase } from '@modules/chat/useCase/session/update-session-context.useCase';
import type { Request, Response } from 'express';

/**
 * Handler for `GET /api/chat/sessions/:id`. Extracted from the parent
 * router factory (pure refactor — pull image-URL hydration out to keep the
 * factory under the max-lines-per-function cap).
 */
const buildGetSessionHandler =
  (chatService: ChatService): ((req: Request, res: Response) => Promise<void>) =>
  async (req, res) => {
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

/**
 * W3 (T5.3) — handler for `PATCH /api/chat/sessions/:id/context`. Extracted
 * from the parent router factory to keep `createSessionRouter` under the
 * `max-lines-per-function` cap (80 LoC) — pure refactor, no behaviour change.
 */
const buildUpdateSessionContextHandler =
  (
    updateSessionContextUseCase: UpdateSessionContextUseCase,
  ): ((req: Request, res: Response) => Promise<void>) =>
  async (req, res) => {
    const user = requireUser(req);
    const sessionId = parseStringParam(req, 'id');
    if (!sessionId) {
      throw badRequest('session id param is required');
    }
    const payload = req.body as UpdateSessionContextBody;
    // The Zod schema produces optional fields (`undefined` when absent).
    // Forward verbatim to the use case — it preserves the
    // `undefined`-vs-`null` distinction down to the repo SET clause.
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
      throw badRequest('session id param is required');
    }
    const result = await chatService.deleteSessionIfEmpty(sessionId, currentUser?.id);
    res.status(200).json(result);
  });

  // W3 (T5.3) — see buildUpdateSessionContextHandler docstring.
  if (updateSessionContextUseCase) {
    // SEC MED-1 (security audit 2026-05-18) — mirror sibling chat routes
    // (chat-media / chat-message / chat-compare) which all apply a
    // per-user limiter. Without it, a hostile client could thrash a single
    // session's row + force redundant artwork-knowledge lookups on every
    // subsequent chat turn. 60/min byUserId matches the "low-cost UPDATE"
    // tier (vs the 15/min museum search and 30/min detect-museum limiters
    // which protect heavier reads).
    const contextUpdateLimiter = createRateLimitMiddleware({
      limit: 60,
      windowMs: 60_000,
      keyGenerator: byUserId,
    });
    router.patch(
      '/sessions/:id/context',
      isAuthenticated,
      contextUpdateLimiter,
      validateBody(updateSessionContextSchema),
      buildUpdateSessionContextHandler(updateSessionContextUseCase),
    );
  }

  return router;
};
