import { createHash } from 'node:crypto';

import { remember } from '@modules/chat/useCase/message/idempotency.store';
import { parseStringParam } from '@shared/middleware/parseStringParam';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const IDEMPOTENCY_HEADER = 'idempotency-key';

const MAX_RAW_KEY_LENGTH = 200;

const boundKeySegment = (rawKey: string): string =>
  rawKey.length > MAX_RAW_KEY_LENGTH ? createHash('sha256').update(rawKey).digest('hex') : rawKey;

interface CapturedResponse {
  status: number;
  body: unknown;
}

const buildScopedKey = (rawKey: string, userId: number | undefined, sessionId: string): string => {
  const userSegment = userId === undefined ? 'anon' : String(userId);
  return `idem:${userSegment}:${sessionId}:${boundKeySegment(rawKey)}`;
};

const isReplayable = (status: number): boolean => status >= 200 && status < 300;

const captureDownstream = (res: Response, next: NextFunction): Promise<CapturedResponse | null> =>
  new Promise<CapturedResponse | null>((resolve) => {
    let settled = false;
    const settle = (value: CapturedResponse | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const status = res.statusCode;
      settle(isReplayable(status) ? { status, body } : null);
      return originalJson(body);
    };
    res.on('finish', () => {
      settle(null);
    });
    next();
  });

const idempotencyHandler: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const rawKey = req.get(IDEMPOTENCY_HEADER);
  const sessionId = parseStringParam(req, 'id');

  if (!rawKey || !sessionId) {
    next();
    return;
  }

  const scopedKey = buildScopedKey(rawKey, req.user?.id, sessionId);

  void (async () => {
    const captured = await remember<CapturedResponse | null>(scopedKey, () =>
      captureDownstream(res, next),
    );

    if (captured && !res.headersSent) {
      res.status(captured.status).json(captured.body);
    }
  })();
};

export const idempotencyMiddleware = (): RequestHandler => idempotencyHandler;
