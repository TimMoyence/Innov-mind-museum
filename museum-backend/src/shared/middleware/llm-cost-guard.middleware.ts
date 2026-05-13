import { AppError } from '@shared/errors/app.error';
import { LlmCostGuard, LlmCostGuardError } from '@shared/llm-cost-guard/llm-cost-guard';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Conservative flat-rate worst-case dollar cost charged to the per-user
 * counter before any paid LLM call. Pre-launch V1 stub — refine later with
 * a real per-model token-rate table (cf. ADR-038 follow-up). Chosen as the
 * smallest figure that keeps the kill-switch / cap meaningful: a single
 * 250-token gpt-4o-mini turn currently costs ~$0.00015 input + ~$0.0009
 * output, so $0.002 leaves headroom for image-multimodal turns + TTS
 * without leaking budget on the cheap path.
 */
const FLAT_COST_PER_CALL_USD = 0.002;

/**
 * Shared mutable counter binding. Wired once at boot (see `src/index.ts`)
 * via {@link setLlmCostCounter}. When `null`, the middleware fails OPEN —
 * intentional for pre-launch V1 so dev / test stacks without Redis are not
 * blocked. Production sentinel (`env.production-validation.ts`) enforces
 * Redis presence and `LlmCostGuard` will thus always be active in prod.
 */
let llmCostCounter: LlmCostCounter | null = null;

/**
 * Register the Redis-backed cost counter at boot. Called from `src/index.ts`
 * after the ioredis client comes up. Mirrors the
 * {@link setRedisRateLimitStore} / {@link setDailyChatLimitCacheService}
 * boot pattern so the middleware module stays Redis-import-free at module
 * load time (avoids pulling ioredis into every test that imports a route
 * file).
 */
export const setLlmCostCounter = (counter: LlmCostCounter): void => {
  llmCostCounter = counter;
};

/**
 * Resets the counter reference. Intended for test teardown only.
 *
 * @internal
 */
export const _resetLlmCostCounter = (): void => {
  llmCostCounter = null;
};

/**
 * Maps a {@link LlmCostGuardError} to the HTTP 429 response shape demanded
 * by P0-4 (`{ code, dailySpentUsd?, capUsd? }`). The `details` payload
 * carries the structured fields so the existing error middleware
 * (`src/helpers/middleware/error.middleware.ts`) renders them under
 * `error.details` without any widening of `AppError`.
 *
 * `Retry-After: 60` is attached so well-behaved clients back off for a
 * minute rather than tight-looping into the cap.
 */
const toHttpAppError = (err: LlmCostGuardError): AppError =>
  new AppError({
    message: err.message,
    statusCode: 429,
    code: err.code,
    details: {
      ...(err.dailySpentUsd !== undefined ? { dailySpentUsd: err.dailySpentUsd } : {}),
      ...(err.capUsd !== undefined ? { capUsd: err.capUsd } : {}),
    },
    headers: { 'Retry-After': '60' },
  });

/**
 * Builds an Express middleware that asserts the caller is within the
 * per-user daily LLM cost cap and that the global kill-switch is not
 * active, BEFORE the downstream handler triggers a paid LLM call.
 *
 * Wiring strategy (P0-4, audit 2026-05-12):
 *   - Mounted on chat routes that synchronously trigger a paid OpenAI /
 *     DeepSeek / Google call (e.g. TTS, describe).
 *   - Reads `req.user?.id` (set by `isAuthenticated`); anonymous calls
 *     bypass the per-user cap but the kill-switch still applies.
 *   - On {@link LlmCostGuardError} the middleware forwards an `AppError`
 *     to `next()` so the global error middleware renders HTTP 429 with the
 *     canonical `{ error: { code, message, details: { dailySpentUsd?,
 *     capUsd? } } }` JSON shape.
 *   - Charges a conservative flat-rate stub (`FLAT_COST_PER_CALL_USD`)
 *     against the counter; refining to per-model token rates is a P1
 *     follow-up.
 *
 * Fails OPEN when no counter has been registered (dev / test stacks with
 * no Redis). Production enforces Redis at boot (deployment invariant), so
 * the counter is always wired there.
 */
export const llmCostGuard: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  // Fail-OPEN when the counter is unwired — dev/test ergonomics. The
  // kill-switch still cannot be honoured without a guard instance; treat
  // an unwired counter as "feature inactive". Pre-launch V1 doctrine —
  // prod boot fails fast if Redis is absent so this branch never runs there.
  if (!llmCostCounter) {
    next();
    return;
  }

  const guard = new LlmCostGuard({
    killSwitchEnabled: env.llm.costGuard.killSwitch,
    dailyCapUsd: env.llm.costGuard.userDailyCapUsd,
    counter: llmCostCounter,
    logger,
  });

  // `req.user.id` is a numeric DB id (UserJwtPayload). Coerce to string for the
  // guard, which keys per-user counters under a string identifier.
  const userId: string | null = req.user?.id !== undefined ? String(req.user.id) : null;

  guard
    .assertAllowed(userId, FLAT_COST_PER_CALL_USD)
    .then(() => {
      next();
    })
    .catch((err: unknown) => {
      if (err instanceof LlmCostGuardError) {
        next(toHttpAppError(err));
        return;
      }
      next(err instanceof Error ? err : new Error(String(err)));
    });
};
