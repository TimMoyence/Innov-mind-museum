/**
 * Daily chat limit — PR-11 (2026-05-23). Thin wrapper around the shared
 * `createRateLimitMiddleware` factory. The legacy `CacheService` plumbing
 * (its boot wiring and non-atomic `get`+`set` read-modify-write pair) is
 * burned; all distributed counting now flows through `RedisRateLimitStore`,
 * which uses an atomic INCR+PEXPIRE Lua script.
 *
 * Spec / design refs:
 *   .claude/skills/team/team-state/2026-05-23-pr-11-dailyChatLimit/spec.md §4
 *   .claude/skills/team/team-state/2026-05-23-pr-11-dailyChatLimit/design.md §3.1
 */
import { createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { env } from '@src/config/env';

import type { Request, RequestHandler } from 'express';

/** ISO YYYY-MM-DD (UTC) — day key for the per-user bucket. */
const utcDateString = (): string => new Date().toISOString().slice(0, 10);

/** Milliseconds until the next UTC midnight — used as the rolling window TTL. */
const msUntilMidnightUtc = (): number => {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(1_000, midnight.getTime() - now.getTime());
};

/**
 * Cap: at least 1, default 100 (FREE_TIER_DAILY_CHAT_LIMIT). Resolved at
 * factory build so the value is stable across requests inside a single boot.
 */
const DAILY_CHAT_LIMIT = Math.max(1, env.freeTierDailyChatLimit);

/**
 * Ordering: MUST run AFTER `isAuthenticated` (consumes `req.user.id`).
 * Anonymous requests skip the limiter (keyGenerator returns null).
 * On cap → `AppError { statusCode: 429, code: 'DAILY_LIMIT_REACHED', details: { limit } }`
 * + `Retry-After` header (additive over the legacy impl, free via the shared factory).
 */
export const dailyChatLimit: RequestHandler = createRateLimitMiddleware({
  // PR-11 R8 — empty bucketName opts out of namespace prefixing. The Redis
  // key emitted to `RedisRateLimitStore.increment` is exactly
  // `daily-chat:<userId>:<UTC-date>` (matches spec §8 D1 and the legacy key
  // shape, so bake-prod buckets survive the cutover).
  bucketName: '',
  limit: DAILY_CHAT_LIMIT,
  // PR-11 R7 — function form, re-evaluated per request so the TTL tracks the
  // calendar-day rollover (ms-until-midnight).
  windowMs: () => msUntilMidnightUtc(),
  errorCode: 'DAILY_LIMIT_REACHED',
  errorMessage: 'Daily chat limit reached',
  statusCode: 429,
  keyGenerator: (req: Request) => {
    // PR-11 R2.1 — anonymous requests bypass the limiter entirely (no counter
    // touched). The route still enforces auth via `isAuthenticated` upstream;
    // this guard exists for tests/health probes that hit the middleware
    // without an authenticated session. We coerce to `unknown` because tests
    // exercise the empty-id branch with `user: {}` (no `id`) and with
    // `user: { id: '' }` — neither of which TS allows under `UserJwtPayload`.
    const userId = (req.user as { id?: unknown } | undefined)?.id;
    if (typeof userId !== 'number' && typeof userId !== 'string') return null;
    if (userId === '') return null;
    return `daily-chat:${String(userId)}:${utcDateString()}`;
  },
});
