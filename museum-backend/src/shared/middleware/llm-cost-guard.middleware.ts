import { AppError } from '@shared/errors/app.error';
import { LlmCostGuard, LlmCostGuardError } from '@shared/llm-cost-guard/llm-cost-guard';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Conservative flat-rate worst-case $/call (pre-launch V1 stub, ADR-038 follow-up).
 * 250-tok gpt-4o-mini ≈ $0.00015 in + $0.0009 out — $0.002 leaves headroom for
 * image-multimodal + TTS without leaking budget on the cheap path.
 */
const FLAT_COST_PER_CALL_USD = 0.002;

/**
 * Wired once at boot via {@link setLlmCostCounter}. `null` → fail-OPEN (dev/test
 * without Redis). Prod sentinel enforces Redis presence so guard always active there.
 */
let llmCostCounter: LlmCostCounter | null = null;

export const setLlmCostCounter = (counter: LlmCostCounter): void => {
  llmCostCounter = counter;
};

/** @internal */
export const _resetLlmCostCounter = (): void => {
  llmCostCounter = null;
};

/** Maps LlmCostGuardError → 429 with `Retry-After: 60`. P0-4 shape: `{code, dailySpentUsd?, capUsd?}`. */
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
 * Asserts per-user daily $/cap + global kill-switch BEFORE paid LLM calls (P0-4, audit 2026-05-12).
 * Mounted on chat routes triggering paid OpenAI/DeepSeek/Google. Anonymous calls bypass per-user
 * cap but kill-switch still applies. Fails OPEN when counter unwired (dev/test); prod boot
 * sentinel requires Redis so this branch never runs in prod.
 */
export const llmCostGuard: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
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
