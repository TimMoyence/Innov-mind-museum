import { env } from '@src/config/env';

import { sectionRunnerHooks } from './langchain-orchestrator-support';

interface BuildRunnerOptionsParams {
  requestId: string | undefined;
  shouldRetry: (error: unknown, status: string) => boolean;
}

export function buildRunnerOptions(params: BuildRunnerOptionsParams): {
  maxConcurrent: number;
  retries: number;
  retryBaseDelayMs: number;
  totalBudgetMs: number;
  requestId: string | undefined;
  shouldRetry: (error: unknown, status: string) => boolean;
  hooks: typeof sectionRunnerHooks;
} {
  return {
    maxConcurrent: 1,
    retries: env.llm.retries,
    retryBaseDelayMs: env.llm.retryBaseDelayMs,
    totalBudgetMs: env.llm.totalBudgetMs,
    requestId: params.requestId,
    shouldRetry: params.shouldRetry,
    hooks: sectionRunnerHooks,
  };
}
