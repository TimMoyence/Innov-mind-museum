import { type Request, type Response, Router } from 'express';

import { auditOwnAccount } from '@modules/auth/adapters/primary/http/helpers/auth-route.helpers';
import { exportUserDataUseCase, userRepository } from '@modules/auth/useCase';
import { AUDIT_DATA_EXPORT } from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { byUserId, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';

const meRouter: Router = Router();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const exportLimiter = createRateLimitMiddleware({
  limit: 1,
  windowMs: SEVEN_DAYS_MS,
  keyGenerator: byUserId,
  bucketName: 'dsar:export',
});

const STREAMING_THRESHOLD_BYTES = 10 * 1024 * 1024;

meRouter.get('/me/export', isAuthenticated, exportLimiter, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);

  res.setHeader('Cache-Control', 'no-store');

  const user = await userRepository.getUserById(jwtUser.id);
  if (!user) {
    throw new AppError({ message: 'User not found', statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const payload = await exportUserDataUseCase.execute(user);

  const serialised = JSON.stringify(payload);
  const byteSize = Buffer.byteLength(serialised, 'utf8');

  await auditOwnAccount(req, jwtUser.id, AUDIT_DATA_EXPORT, {
    byteSize,
    sessionsCount: payload.chatSessions.length,
    reviewsCount: payload.reviews.length,
    ticketsCount: payload.supportTickets.length,
    mediaCount: payload.chatSessions.reduce(
      (acc, s) => acc + s.messages.filter((m) => Boolean(m.imageRef) || Boolean(m.audioUrl)).length,
      0,
    ),
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (byteSize <= STREAMING_THRESHOLD_BYTES) {
    res.send(serialised);
    return;
  }

  res.write(serialised);
  res.end();
});

export default meRouter;
