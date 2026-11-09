import { createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { env } from '@src/config/env';

import type { Request, RequestHandler } from 'express';

const utcDateString = (): string => new Date().toISOString().slice(0, 10);

const msUntilMidnightUtc = (): number => {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(1_000, midnight.getTime() - now.getTime());
};

const DAILY_CHAT_LIMIT = Math.max(1, env.freeTierDailyChatLimit);

export const dailyChatLimit: RequestHandler = createRateLimitMiddleware({
  bucketName: '',
  limit: DAILY_CHAT_LIMIT,
  windowMs: () => msUntilMidnightUtc(),
  errorCode: 'DAILY_LIMIT_REACHED',
  errorMessage: 'Daily chat limit reached',
  statusCode: 429,
  keyGenerator: (req: Request) => {
    const userId = (req.user as { id?: unknown } | undefined)?.id;
    if (typeof userId !== 'number' && typeof userId !== 'string') return null;
    if (userId === '') return null;
    return `daily-chat:${String(userId)}:${utcDateString()}`;
  },
});
