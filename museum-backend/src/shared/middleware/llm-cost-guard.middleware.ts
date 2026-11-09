import { AppError } from '@shared/errors/app.error';
import { errorMessage } from '@shared/errors/error-message';
import { LlmCostGuard, LlmCostGuardError } from '@shared/llm-cost-guard/llm-cost-guard';
import { logger } from '@shared/logger/logger';
import { onInputRejected } from '@shared/middleware/input-rejected';
import { env } from '@src/config/env';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const FLAT_COST_PER_CALL_USD = 0.002;

const FANOUT_COST_USD = {
  text: FLAT_COST_PER_CALL_USD,
  audio: 0.012,
  tts: 0.0015,
} as const;

type FanoutClass = keyof typeof FANOUT_COST_USD;

const classifyFanout = (req: Request): FanoutClass => {
  const fullPath = `${req.baseUrl}${req.path}`;
  const route = (req.baseUrl ? fullPath : req.originalUrl).split('?')[0];
  if (route.endsWith('/audio')) return 'audio';
  if (route.endsWith('/tts')) return 'tts';
  if (route.endsWith('/messages')) return 'text';
  return 'text';
};

let llmCostCounter: LlmCostCounter | null = null;

export const setLlmCostCounter = (counter: LlmCostCounter): void => {
  llmCostCounter = counter;
};

export const _resetLlmCostCounter = (): void => {
  llmCostCounter = null;
};

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

export const llmCostGuard: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!llmCostCounter) {
    if (env.nodeEnv === 'production') {
      logger.error('llm_cost_guard_not_wired_in_production');
      next(
        new AppError({
          message: 'LLM cost guard unavailable',
          statusCode: 503,
          code: 'COST_GUARD_UNAVAILABLE',
        }),
      );
      return;
    }
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
  const estimatedCostUsd = FANOUT_COST_USD[classifyFanout(req)];

  guard
    .assertAllowed(userId, estimatedCostUsd)
    .then(() => {
      onInputRejected(res, () => {
        guard.refund().catch((err: unknown) => {
          logger.warn('llm_cost_refund_failed', {
            userId,
            reason: errorMessage(err),
          });
        });
      });
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
