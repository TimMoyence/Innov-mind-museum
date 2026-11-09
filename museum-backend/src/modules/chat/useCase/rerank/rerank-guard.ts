import { createHash } from 'node:crypto';

import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';
import { logger } from '@shared/logger/logger';
import { raceSignal } from '@shared/utils/race-signal';

import type { RerankerPort, RerankResult } from '@modules/chat/domain/ports/reranker.port';

const fallbackReason = (err: unknown): 'unavailable' | 'timeout' | 'error' => {
  if (err instanceof RerankerUnavailableError) {
    return err.message.includes('timed out') ? 'timeout' : 'unavailable';
  }
  return 'error';
};

export const logRerankFallback = (
  caller: string,
  query: string,
  candidateCount: number,
  err: unknown,
): void => {
  logger.warn('reranker_fallback', {
    caller,
    reason: fallbackReason(err),
    errorClass: err instanceof Error ? err.constructor.name : 'Unknown',
    originalCount: candidateCount,
    queryHash: createHash('sha256').update(query).digest('hex').slice(0, 16),
  });
};

interface RunRerankArgs {
  reranker: RerankerPort;
  timeoutMs: number;
  query: string;
  docs: string[];
  topN: number;
  signal: AbortSignal;
}

export const runRerankWithSignal = async ({
  reranker,
  timeoutMs,
  query,
  docs,
  topN,
  signal,
}: RunRerankArgs): Promise<readonly RerankResult[]> => {
  const budgetMs = String(timeoutMs);
  if (signal.aborted) {
    throw new RerankerUnavailableError(`rerank aborted before start (${budgetMs}ms budget)`);
  }

  return await raceSignal(
    reranker.rerank(query, docs, topN),
    signal,
    () => new RerankerUnavailableError(`rerank timed out after ${budgetMs}ms`),
  );
};
