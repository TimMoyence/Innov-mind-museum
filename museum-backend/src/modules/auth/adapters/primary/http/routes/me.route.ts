import { type Request, type Response, Router } from 'express';

import { auditService } from '@shared/audit';
import { AUDIT_DATA_EXPORT } from '@shared/audit/audit.types';
import { AppError } from '@shared/errors/app.error';
import { requireUser } from '@shared/http/requireUser';
import { isAuthenticated } from '@src/helpers/middleware/authenticated.middleware';
import { byUserId, createRateLimitMiddleware } from '@src/helpers/middleware/rate-limit.middleware';

import { exportUserDataUseCase, userRepository } from '../../../../useCase';

/**
 * Express router for current-user (`req.user`) GDPR endpoints.
 *
 * Currently exposes the Article 15 (right of access) + Article 20 (data
 * portability) export at `GET /me/export`. Mounted by the API router at
 * `/users`, so the public path is `GET /api/users/me/export`.
 */
const meRouter: Router = Router();

/**
 * Per-user rate limit for the GDPR DSAR export.
 *
 * Confirmed restrictive policy: 1 export per 7-day rolling window. Heavy
 * payloads + signed-URL fan-out across S3 means abuse must stay impossible.
 * On 429 the existing rate-limit middleware sets `Retry-After` so the client
 * sees when the next attempt is allowed.
 */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const exportLimiter = createRateLimitMiddleware({
  limit: 1,
  windowMs: SEVEN_DAYS_MS,
  keyGenerator: byUserId,
  bucketName: 'dsar:export',
});

/**
 * Streaming threshold (bytes). When the serialised payload exceeds this size
 * the handler switches from `res.json(...)` to a chunked write so we never
 * buffer multi-megabyte JSON in memory.
 *
 * 10 MB matches the audit-mandated cutover. Most users sit far below; the
 * threshold is intentionally low so we exercise the streaming path on heavy
 * accounts (long-tenure visitors with thousands of chat messages).
 */
const STREAMING_THRESHOLD_BYTES = 10 * 1024 * 1024;

/**
 * `GET /me/export` — GDPR Article 15 (access) + Article 20 (portability).
 *
 * - Auth: `isAuthenticated`. The user is always taken from `req.user.id`,
 *   never from a query/path param (anti-IDOR).
 * - Rate limit: 1 export per user / 7 days (sliding window).
 * - Audit: emits `DATA_EXPORT` to the hashed audit chain on success, with the
 *   payload byte size and per-category counts to support Art. 30 records.
 * - Cache: `Cache-Control: no-store` always — payload is sensitive.
 * - Streaming: small payloads use `res.json`. Above 10 MB the handler streams
 *   the JSON in chunks (Transfer-Encoding: chunked) to avoid heap pressure.
 *
 * Empty arrays are returned for users with no data (never 404). Sessions
 * already purged by the retention cron are NOT listed (consistent with
 * retention semantics).
 */
meRouter.get('/me/export', isAuthenticated, exportLimiter, async (req: Request, res: Response) => {
  const jwtUser = requireUser(req);

  // Always cache-bust — DSAR payloads contain personal data; no intermediary
  // proxy or browser cache should retain them.
  res.setHeader('Cache-Control', 'no-store');

  const user = await userRepository.getUserById(jwtUser.id);
  if (!user) {
    // Per audit § 2: a missing user after a valid JWT is an auth-level
    // anomaly, not a 404 (account may have just been deleted between issuing
    // the token and the export request). Treat as 401 to force re-auth.
    throw new AppError({ message: 'User not found', statusCode: 401, code: 'UNAUTHORIZED' });
  }

  const payload = await exportUserDataUseCase.execute(user);

  const serialised = JSON.stringify(payload);
  const byteSize = Buffer.byteLength(serialised, 'utf8');

  // Audit MUST be durable before the response is observable (SOC2 CC7.2 /
  // GDPR Art. 30). Awaited so the hashed chain captures this access event.
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

  // Chunked streaming path for >10 MB payloads. Express omits the
  // Content-Length header automatically when we use res.write/end, so the
  // response uses Transfer-Encoding: chunked.
  res.write(serialised);
  res.end();
});

export default meRouter;
