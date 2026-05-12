import express from 'express';
import request from 'supertest';

import { createExplanationHandler } from '@modules/chat/adapters/primary/http/explanation.controller';
import {
  GetMessageExplanationUseCase,
  MessageNotFoundForExplanationError,
  type ExplanationChatRepository,
  type MessageExplanation,
} from '@modules/chat/useCase/explanation/get-message-explanation.use-case';
import { AppError } from '@shared/errors/app.error';

import type { NextFunction, Request, Response } from 'express';

// ─────────────────────────────────────────────────────────────────────────────
// Test rig — minimal Express app mounting only the explanation handler so the
// controller is exercised in isolation from the chat module composition root.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stand-in auth middleware that hydrates `req.user` from a header.
 * @param req
 * @param _res
 * @param next
 */
function fakeAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const userIdHeader = req.headers['x-test-user-id'];
  if (typeof userIdHeader !== 'string' || userIdHeader.length === 0) {
    next(new AppError({ message: 'Token required', statusCode: 401, code: 'UNAUTHORIZED' }));
    return;
  }
  req.user = { id: Number(userIdHeader), role: 'visitor' };
  next();
}

/**
 * Centralised error handler that mirrors the production app shape.
 * @param err
 * @param _req
 * @param res
 * @param _next
 */
function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unknown error' } });
}

function buildAppWith(useCase: GetMessageExplanationUseCase) {
  const app = express();
  app.use(express.json());
  app.get(
    '/api/chat/messages/:id/explanation',
    fakeAuthMiddleware,
    createExplanationHandler(useCase),
  );
  app.use(errorMiddleware);
  return app;
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function makeUseCase(execute: jest.Mock): GetMessageExplanationUseCase {
  // We intentionally bypass the real constructor — the controller only touches
  // `.execute()`. Casting via `unknown` keeps the test rig honest about the
  // narrow surface area it depends on.
  return { execute } as unknown as GetMessageExplanationUseCase;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/chat/messages/:id/explanation — controller', () => {
  it('returns 200 with the explanation payload on happy path', async () => {
    const payload: MessageExplanation = {
      decision: 'blocked',
      category: 'off_topic',
      reasonSummary: 'Outside the cultural scope.',
      recourse: {
        type: 'self-retry',
        description: 'Rephrase your question around a cultural topic.',
        supportUrl: null,
      },
      auditRef: '22222222-2222-4222-8222-222222222222',
      providedBy: { name: 'llm-guard', version: '0.3.16' },
      decisionAt: '2026-05-12T14:23:00.000Z',
      policyVersion: 'default-v0',
    };
    const execute = jest.fn().mockResolvedValue(payload);
    const app = buildAppWith(makeUseCase(execute));

    const res = await request(app)
      .get(`/api/chat/messages/${VALID_UUID}/explanation`)
      .set('x-test-user-id', '42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(execute).toHaveBeenCalledWith({
      messageId: VALID_UUID,
      userId: 42,
    });
  });

  it('returns 404 when the use-case raises MessageNotFoundForExplanationError', async () => {
    const execute = jest.fn().mockRejectedValue(new MessageNotFoundForExplanationError(VALID_UUID));
    const app = buildAppWith(makeUseCase(execute));

    const res = await request(app)
      .get(`/api/chat/messages/${VALID_UUID}/explanation`)
      .set('x-test-user-id', '7');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    // Privacy-by-design: do not leak whether the message exists or just isn't ours.
    expect(res.body.error.message).toBe('Message not found');
  });

  it('returns 401 when no auth header is present', async () => {
    const execute = jest.fn();
    const app = buildAppWith(makeUseCase(execute));

    const res = await request(app).get(`/api/chat/messages/${VALID_UUID}/explanation`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns 400 when the messageId path param is not a UUID', async () => {
    const execute = jest.fn();
    const app = buildAppWith(makeUseCase(execute));

    const res = await request(app)
      .get('/api/chat/messages/not-a-uuid/explanation')
      .set('x-test-user-id', '42');

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it('forwards an explicit `?locale=` query parameter to the use-case', async () => {
    const execute = jest.fn().mockResolvedValue({
      decision: 'allowed',
      category: null,
      reasonSummary: '...',
      recourse: { type: 'signal', description: '...', supportUrl: null },
      auditRef: null,
      providedBy: null,
      decisionAt: '2026-05-12T14:23:00.000Z',
      policyVersion: 'default-v0',
    });
    const app = buildAppWith(makeUseCase(execute));

    await request(app)
      .get(`/api/chat/messages/${VALID_UUID}/explanation?locale=fr`)
      .set('x-test-user-id', '42');

    expect(execute).toHaveBeenCalledWith({
      messageId: VALID_UUID,
      userId: 42,
      locale: 'fr',
    });
  });

  it('re-throws non-NotFound errors from the use-case so the global middleware can render them', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(
        new AppError({ message: 'boom', statusCode: 500, code: 'INTERNAL_ERROR' }),
      );
    const app = buildAppWith(makeUseCase(execute));

    const res = await request(app)
      .get(`/api/chat/messages/${VALID_UUID}/explanation`)
      .set('x-test-user-id', '42');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defensive coverage — the controller's auth re-check
// ─────────────────────────────────────────────────────────────────────────────

describe('controller defensive auth re-check', () => {
  /**
   * Simulates a regression where `isAuthenticated` is removed upstream but a
   * stray cookie still hydrates a stub `req.user` without an id. The handler
   * must throw 401 rather than silently call the use-case.
   */
  it('returns 401 when req.user is hydrated without an id', async () => {
    const execute = jest.fn();
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = { id: undefined as unknown as number, role: 'visitor' };
      next();
    });
    app.get('/api/chat/messages/:id/explanation', createExplanationHandler(makeUseCase(execute)));
    app.use(errorMiddleware);

    const res = await request(app).get(`/api/chat/messages/${VALID_UUID}/explanation`);

    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Anti-regression — ExplanationChatRepository should remain structurally
// compatible with the production repository (compile-time check only).
// ─────────────────────────────────────────────────────────────────────────────

describe('ExplanationChatRepository shape', () => {
  it('is satisfied by an object exposing only getMessageById()', () => {
    const repo: ExplanationChatRepository = {
      getMessageById: jest.fn().mockResolvedValue(null),
    };
    expect(typeof repo.getMessageById).toBe('function');
  });
});
