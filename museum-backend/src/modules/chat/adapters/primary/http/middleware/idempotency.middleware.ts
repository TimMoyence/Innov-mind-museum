/**
 * Idempotency-Key dedup middleware (2026-06-01, RUN_ID weak-net-idempotency, D2).
 *
 * Mounted on `POST /api/chat/sessions/:id/messages` INSIDE `createMessageRouter`
 * AFTER `isAuthenticated` + rate-limiters + `llmCostGuard` and BEFORE the upload
 * admission / multer / create handler (CLAUDE.md "Mutating middleware
 * ordering": the dedup key must not be burned by a request that a downstream
 * validator would 400). Behaviour:
 *   - no `Idempotency-Key` header → `next()` immediately (zero-overhead
 *     passthrough; the live send path is unchanged);
 *   - header present → the FIRST request runs the downstream chain once and the
 *     captured 201 response (status + JSON body) is stored under a short TTL; a
 *     REPLAY with the same key replays the stored response WITHOUT re-running
 *     the handler (so `chatService.postMessage` fires once).
 *
 * The dedup key is scoped by `Idempotency-Key + userId + sessionId` so the same
 * raw header from a different user OR on a different session is NOT deduped, and
 * a Zod-400 path cannot collide with a legitimate create.
 *
 * Only SUCCESSFUL creates (HTTP 2xx) are stored — a 4xx/5xx error is never
 * cached, so a transient failure can be retried with the same key. The store
 * (`idempotency.store`) is FAIL-OPEN: a cache outage degrades to "treat as new"
 * and never blocks the first send.
 *
 * lib-docs/express/PATTERNS.md §3.3 (mutating-mw ordering), §3.4 (check
 * `res.headersSent` before writing), §3.7 (configurable mw exported as a
 * factory). We wrap `res.json` to capture the handler's outcome — Express 5
 * `res.status(code).json(body)` chaining is preserved (PATTERNS §2).
 */
import { createHash } from 'node:crypto';

import { remember } from '@modules/chat/useCase/message/idempotency.store';
import { parseStringParam } from '@shared/middleware/parseStringParam';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

const IDEMPOTENCY_HEADER = 'idempotency-key';

/**
 * Upper bound on the raw `Idempotency-Key` length we embed verbatim into the
 * cache key. The header is fully user-controlled and unbounded; a client could
 * stream megabytes of distinct keys and force the dedup store (Redis in prod)
 * to retain arbitrarily long key strings — a memory-amplification DoS
 * (security finding W1-IDEM-SEC, MEDIUM). Keys at or below this cap are used
 * as-is (backward-compatible with the existing dedup behaviour); anything
 * longer is collapsed to a fixed-size sha256 digest so the stored key length is
 * bounded by the digest (64 hex chars) regardless of the input size. Two
 * requests carrying the SAME over-long key hash to the SAME digest, so a
 * legitimate retry still deduplicates.
 */
const MAX_RAW_KEY_LENGTH = 200;

/**
 * Bounds the user-controlled key segment. Returns the raw key unchanged when it
 * is within {@link MAX_RAW_KEY_LENGTH}; otherwise returns its sha256 hex digest
 * (length-bounded, collision-resistant, deterministic so equal long keys still
 * dedup).
 */
const boundKeySegment = (rawKey: string): string =>
  rawKey.length > MAX_RAW_KEY_LENGTH ? createHash('sha256').update(rawKey).digest('hex') : rawKey;

interface CapturedResponse {
  status: number;
  body: unknown;
}

/**
 * Builds the scoped dedup key. `undefined` userId still yields a stable,
 * distinct `anon` segment so an unauthenticated edge case never collides with a
 * real `{userId, sessionId}` pair.
 */
const buildScopedKey = (rawKey: string, userId: number | undefined, sessionId: string): string => {
  const userSegment = userId === undefined ? 'anon' : String(userId);
  return `idem:${userSegment}:${sessionId}:${boundKeySegment(rawKey)}`;
};

/** True for a storable (replayable) outcome — only successful creates. */
const isReplayable = (status: number): boolean => status >= 200 && status < 300;

/**
 * Runs the downstream chain once and captures the response the create handler
 * emits via `res.json`. Resolves to the captured 2xx response (storable) or
 * `null` for a non-2xx / non-json completion (NOT stored — the key stays free
 * for a retry). PATTERNS §3.1 (Express 5 auto-forwards async rejections to the
 * error middleware) — `res.on('finish')` still settles this promise.
 */
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
    // Safety net: the response completed without going through our wrapped
    // `res.json` (error handler, `res.end`, stream) → store nothing.
    res.on('finish', () => {
      settle(null);
    });
    next();
  });

/** The middleware itself — module-scoped so the factory returns a reference. */
const idempotencyHandler: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const rawKey = req.get(IDEMPOTENCY_HEADER);
  const sessionId = parseStringParam(req, 'id');

  // No header (or no session id to scope by) → passthrough, zero overhead.
  if (!rawKey || !sessionId) {
    next();
    return;
  }

  const scopedKey = buildScopedKey(rawKey, req.user?.id, sessionId);

  void (async () => {
    const captured = await remember<CapturedResponse | null>(scopedKey, () =>
      captureDownstream(res, next),
    );

    // On a REPLAY hit, `remember` returns the stored response without having
    // re-run the producer, so `res.json` was never called on THIS request →
    // replay it now. On the first (miss) request the producer already wrote the
    // response (`res.headersSent` is true) → do nothing.
    if (captured && !res.headersSent) {
      res.status(captured.status).json(captured.body);
    }
  })();
};

/**
 * Idempotency dedup middleware factory. No options today, but kept as a factory
 * for parity with the other configurable middleware (PATTERNS §3.7) and so the
 * mount site reads `idempotencyMiddleware()` alongside the rate limiters.
 */
export const idempotencyMiddleware = (): RequestHandler => idempotencyHandler;
