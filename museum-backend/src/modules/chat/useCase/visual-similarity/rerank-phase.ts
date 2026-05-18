/**
 * C9.13 — optional rerank phase for {@link VisualSimilarityService.compare}.
 * Extracted here to keep `similarity.service.ts` under the 400-line cap.
 *
 * Contract (mirrors the KR-side phase in `knowledge-router.service.ts`):
 *  - Skipped by caller when `queryText` is undefined or `topMatches.length ≤ 1`.
 *  - Fail-open: any throw / timeout returns `topMatches` untouched.
 *  - Telemetry: Langfuse span `chat.rerank` + Prom histogram
 *    `musaium_rerank_latency_ms` (+ counter on fallback). All wrapped in
 *    `safeTrace` so observability outage cannot propagate.
 */
import { createHash } from 'node:crypto';

import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';
import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { rerankFallbackTotal, rerankLatencyMs } from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';

import type { RerankerPort, RerankResult } from '@modules/chat/domain/ports/reranker.port';
import type { CompareMatch } from '@modules/chat/domain/visual-similarity/compare-result.types';

/** Telemetry label used by both Prom metrics and Langfuse spans. */
const CALLER_LABEL = 'visual-similarity';

export interface RerankPhaseDeps {
  reranker: RerankerPort;
  /** Hard deadline on a single rerank call before fail-open. */
  rerankTimeoutMs: number;
}

/**
 * Re-order `topMatches` against `queryText` via the cross-encoder.
 * Returns the input unchanged on any failure (caller already sorted by
 * fused score).
 */
export async function maybeRerankCompareMatches(
  deps: RerankPhaseDeps,
  queryText: string,
  topMatches: CompareMatch[],
): Promise<CompareMatch[]> {
  const candidateCount = topMatches.length;
  const docs = topMatches.map((m) => m.facts.title);
  const rerankStart = Date.now();

  try {
    const rerankSignal = AbortSignal.timeout(deps.rerankTimeoutMs);
    const rerankResults = await runRerankWithSignal({
      reranker: deps.reranker,
      timeoutMs: deps.rerankTimeoutMs,
      query: queryText,
      docs,
      topN: candidateCount,
      signal: rerankSignal,
    });
    const latencyMs = Date.now() - rerankStart;
    const reordered = applyPermutation(topMatches, rerankResults);

    emitRerankTelemetry({
      queryText,
      candidateCount,
      topN: candidateCount,
      latencyMs,
      outcome: 'success',
    });
    return reordered;
  } catch (err) {
    const latencyMs = Date.now() - rerankStart;
    emitRerankTelemetry({
      queryText,
      candidateCount,
      topN: candidateCount,
      latencyMs,
      outcome: 'fallback',
      reason: pickRerankFallbackReason(err),
      errorClass: err instanceof Error ? err.constructor.name : 'Unknown',
    });
    return topMatches;
  }
}

function applyPermutation(
  topMatches: CompareMatch[],
  rerankResults: readonly RerankResult[],
): CompareMatch[] {
  const reordered: CompareMatch[] = [];
  const usedIndices = new Set<number>();
  for (const { docIndex } of rerankResults) {
    if (docIndex < 0 || docIndex >= topMatches.length) continue;
    reordered.push(topMatches[docIndex]);
    usedIndices.add(docIndex);
  }
  for (let i = 0; i < topMatches.length; i += 1) {
    if (!usedIndices.has(i)) {
      reordered.push(topMatches[i]);
    }
  }
  return reordered;
}

interface RunRerankArgs {
  reranker: RerankerPort;
  timeoutMs: number;
  query: string;
  docs: string[];
  topN: number;
  signal: AbortSignal;
}

/**
 * AbortSignal-aware wrapper around `reranker.rerank()`. The port has no
 * signal arg; on abort we synthesize a `RerankerUnavailableError` whose
 * message contains "timed out" so `pickRerankFallbackReason` maps to
 * `reason='timeout'`.
 */
async function runRerankWithSignal(args: RunRerankArgs): Promise<readonly RerankResult[]> {
  const { reranker, timeoutMs, query, docs, topN, signal } = args;
  const budgetMs = String(timeoutMs);
  if (signal.aborted) {
    throw new RerankerUnavailableError(`rerank aborted before start (${budgetMs}ms budget)`);
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      reject(new RerankerUnavailableError(`rerank timed out after ${budgetMs}ms`));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    reranker.rerank(query, docs, topN).then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

interface RerankTelemetryPayload {
  queryText: string;
  candidateCount: number;
  topN: number;
  latencyMs: number;
  outcome: 'success' | 'fallback';
  reason?: 'unavailable' | 'timeout' | 'error';
  errorClass?: string;
}

function emitRerankTelemetry(payload: RerankTelemetryPayload): void {
  safeTrace('visualSimilarity.metric.rerank', () => {
    rerankLatencyMs.observe({ caller: CALLER_LABEL, outcome: payload.outcome }, payload.latencyMs);
    if (payload.outcome === 'fallback' && payload.reason !== undefined) {
      rerankFallbackTotal.inc({
        caller: CALLER_LABEL,
        reason: payload.reason,
      });
    }
  });

  if (payload.outcome === 'fallback') {
    logger.warn('reranker_fallback', {
      caller: CALLER_LABEL,
      reason: payload.reason,
      errorClass: payload.errorClass,
      originalCount: payload.candidateCount,
      queryHash: createHash('sha256').update(payload.queryText).digest('hex').slice(0, 16),
    });
  }

  safeTrace('visualSimilarity.span.rerank', () => {
    const lf = getLangfuse();
    const queryHash = createHash('sha256').update(payload.queryText).digest('hex').slice(0, 16);
    lf?.trace({
      name: 'chat.rerank',
      metadata: {
        'rerank.caller': CALLER_LABEL,
        'rerank.candidate_count': payload.candidateCount,
        'rerank.top_n': payload.topN,
        'rerank.latency_ms': payload.latencyMs,
        'rerank.outcome': payload.outcome,
        'rerank.query_hash': queryHash,
        ...(payload.reason !== undefined ? { 'rerank.reason': payload.reason } : {}),
      },
    });
  });
}

/**
 * Maps a rerank failure to the `reason` label. Identical contract to the
 * KR-side helper; duplicated locally to keep each phase self-contained.
 */
function pickRerankFallbackReason(err: unknown): 'unavailable' | 'timeout' | 'error' {
  if (err instanceof RerankerUnavailableError) {
    return err.message.includes('timed out') ? 'timeout' : 'unavailable';
  }
  return 'error';
}
