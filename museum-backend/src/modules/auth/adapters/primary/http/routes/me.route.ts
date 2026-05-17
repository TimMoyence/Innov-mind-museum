import { type Request, type Response, Router } from 'express';

import { exportUserDataUseCase, userRepository } from '@modules/auth/useCase';
import { auditService } from '@shared/audit';
import { AUDIT_DATA_EXPORT } from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@shared/middleware/authenticated.middleware';
import { byUserId, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';

/** Mounted at `/users`; public path `GET /api/users/me/export`. */
const meRouter: Router = Router();

/**
 * 1 export per 7-day rolling window. Heavy payload + signed-URL S3 fan-out =
 * abuse must stay impossible. 429 carries `Retry-After`.
 */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const exportLimiter = createRateLimitMiddleware({
  limit: 1,
  windowMs: SEVEN_DAYS_MS,
  keyGenerator: byUserId,
  bucketName: 'dsar:export',
});

/**
 * Above this, switch from `res.json` to chunked write — avoid multi-MB JSON
 * heap pressure. Intentionally low so streaming path runs on heavy accounts.
 */
const STREAMING_THRESHOLD_BYTES = 10 * 1024 * 1024;

/**
 * `GET /me/export` — GDPR Art.15 + Art.20.
 * - User from `req.user.id`, never query/path (anti-IDOR).
 * - 1/user/7d sliding window.
 * - Audit `DATA_EXPORT` with byte size + per-category counts (Art.30 records).
 * - Always `Cache-Control: no-store`.
 * - >10 MB streams `Transfer-Encoding: chunked`.
 * Empty arrays for no-data users (never 404). Sessions purged by retention
 * cron NOT listed (consistent with retention semantics).
 */
meRouter.get('/me/export', isAuthenticated, exportLimiter, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);

  // DSAR payloads contain personal data — no proxy/browser cache.
  res.setHeader('Cache-Control', 'no-store');

  const user = await userRepository.getUserById(jwtUser.id);
  if (!user) {
    // Audit §2 — missing user after valid JWT = auth anomaly (deleted mid-flight), not 404.
    throw new AppError({ message: 'User not found', statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const payload = await exportUserDataUseCase.execute(user);

  const serialised = JSON.stringify(payload);
  const byteSize = Buffer.byteLength(serialised, 'utf8');

  // Audit MUST be durable before response is observable (SOC2 CC7.2 / GDPR Art. 30).
  await auditService.log({
    action: AUDIT_DATA_EXPORT,
    actorType: 'user',
    actorId: jwtUser.id,
    targetType: 'user',
    targetId: String(jwtUser.id),
    metadata: {
      byteSize,
      sessionsCount: payload.chatSessions.length,
      reviewsCount: payload.reviews.length,
      ticketsCount: payload.supportTickets.length,
      mediaCount: payload.chatSessions.reduce(
        (acc, s) =>
          acc + s.messages.filter((m) => Boolean(m.imageRef) || Boolean(m.audioUrl)).length,
        0,
      ),
    },
    ip: req.ip,
    requestId: req.requestId,
  });

  res.status(200);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (byteSize <= STREAMING_THRESHOLD_BYTES) {
    res.send(serialised);
    return;
  }

  // Express omits Content-Length when using res.write/end → Transfer-Encoding: chunked.
  res.write(serialised);
  res.end();
});

export default meRouter;
