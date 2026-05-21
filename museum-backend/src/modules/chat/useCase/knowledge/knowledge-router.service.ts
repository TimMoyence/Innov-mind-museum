/**
 * C4.1 — `KnowledgeRouterService` cascades KB → judge → WebSearch with per-leg
 * AbortSignal.any budgets (D4 — Node ≥ 22.3). Fail-open (ADR-035): every leg
 * wrapped in `.catch`; `resolve()` NEVER throws — errors become `source: 'none'`.
 * No feature flag (D11 — pre-launch V1); env vars are tuning-only.
 */

import { createHash } from 'node:crypto';

import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';
import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import {
  chatWebsearchFallbackTotal,
  rerankFallbackTotal,
  rerankLatencyMs,
} from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';

import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type { SearchResult, WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';
import type { LlmJudgePort } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { LlmJudgeScope } from '@shared/observability/derive-tier';

export type KnowledgeRouterSource = 'wikidata' | 'web' | 'none';

export interface KnowledgeRouterResult {
  facts: string[];
  source: KnowledgeRouterSource;
  /** True iff the WebSearch leg was exercised (regardless of outcome). */
  fallback_triggered: boolean;
  /** Populated only when judge leg ran. */
  judge_confidence?: number;
  metadata?: {
    searchTerm: string;
    /** Per-leg latencies in ms; missing keys = leg not exercised. */
    latencyMs: {
      kb?: number;
      judge?: number;
      web?: number;
    };
  };
}

/** Implementations must never throw (fail-open R9/R10) and honor `signal`. */
export interface KnowledgeRouterPort {
  /**
   * TD-20 (R13d) — optional `scope` 3rd arg forwards per-tenant attribution
   * (`museumId`/`tier`/`requestId`) to the judge leg's `generation`. Optional
   * data on an existing port method (not a new port). Optional => existing
   * callers compile unchanged.
   */
  resolve(
    searchTerm: string,
    signal?: AbortSignal,
    scope?: LlmJudgeScope,
  ): Promise<KnowledgeRouterResult>;
}

/** Tuning only — no field can disable the feature (D11). */
export interface KnowledgeRouterConfig {
  /** Confidence cutoff [0..1] above which WebSearch is skipped (default 0.7). */
  threshold: number;
  kbTimeoutMs: number;
  judgeTimeoutMs: number;
  wsTimeoutMs: number;
  /** C9.13 — hard deadline on a single rerank call before fail-open (default 2000). */
  rerankTimeoutMs: number;
}

export interface KnowledgeRouterDeps {
  kb: KnowledgeBaseProvider;
  ws: WebSearchProvider;
  judge: LlmJudgePort;
  /** C9.13 — cross-encoder reranker. Fail-open; baseline preserved on throw/timeout. */
  reranker: RerankerPort;
  config: KnowledgeRouterConfig;
}

const MAX_WEB_FACTS = 5;

/** C9.13 — telemetry caller label, kept as a constant so labels stay in sync. */
const RERANK_CALLER_LABEL = 'knowledge-router';

/**
 * D4 — uses `AbortSignal.any` (NOT `Promise.race`) to avoid the "loser leak"
 * pattern: Promise.race resolves with the winner but does not abort losers,
 * which keep consuming tokens/network.
 */
function buildLegSignal(legBudgetMs: number, parentSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(legBudgetMs);
  return parentSignal ? AbortSignal.any([timeoutSignal, parentSignal]) : timeoutSignal;
}

function pickWebsearchOutcome(errored: boolean, resultCount: number): 'hit' | 'empty' | 'error' {
  if (errored) return 'error';
  if (resultCount > 0) return 'hit';
  return 'empty';
}

/**
 * C9.13 — maps rerank failure cause to the `reason` label on
 * `musaium_rerank_fallback_total`. Distinguishes:
 *  - `'unavailable'` = adapter signalled intentional disabled state
 *    (e.g. `NullRerankerAdapter`, V1 scaffold throws).
 *  - `'timeout'` = our caller-side AbortSignal fired (message contains "timed out").
 *  - `'error'` = any other failure (unexpected throw, native module load failure).
 */
function pickRerankFallbackReason(err: unknown): 'unavailable' | 'timeout' | 'error' {
  if (err instanceof RerankerUnavailableError) {
    return err.message.includes('timed out') ? 'timeout' : 'unavailable';
  }
  return 'error';
}

/**
 * Independent of `buildKnowledgeBasePromptBlock` so T2.4 validator can match
 * quotes against individual fact lines rather than the full block.
 */
function formatKbFacts(facts: {
  qid: string;
  title: string;
  artist?: string;
  date?: string;
  technique?: string;
  collection?: string;
  movement?: string;
  genre?: string;
}): string[] {
  const out: string[] = [`${facts.title} (Wikidata ${facts.qid}).`];
  if (facts.artist) out.push(`Artist: ${facts.artist}.`);
  if (facts.date) out.push(`Date: ${facts.date}.`);
  if (facts.technique) out.push(`Technique: ${facts.technique}.`);
  if (facts.collection) out.push(`Collection: ${facts.collection}.`);
  if (facts.movement) out.push(`Movement: ${facts.movement}.`);
  if (facts.genre) out.push(`Genre: ${facts.genre}.`);
  return out;
}

export class KnowledgeRouterService implements KnowledgeRouterPort {
  constructor(private readonly deps: KnowledgeRouterDeps) {}

  /**
   * Enforce per-leg budget when the underlying port has no AbortSignal arg
   * (KB leg). REJECTS with AbortError on timeout/parent abort — caller's
   * `.catch` performs fail-open conversion (R10).
   */
  private async runWithLegBudget<T>(
    inner: Promise<T>,
    budgetMs: number,
    parentSignal?: AbortSignal,
  ): Promise<T> {
    const signal = buildLegSignal(budgetMs, parentSignal);

    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('AbortError');
    }

    return await new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        reject(signal.reason instanceof Error ? signal.reason : new Error('AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      inner.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (err: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }

  /**
   * Never throws (D8). PII safety (NFR7): raw `searchTerm` never leaves this
   * method — telemetry carries sha256[:16] hash only.
   */
  async resolve(
    searchTerm: string,
    parentSignal?: AbortSignal,
    scope?: LlmJudgeScope,
  ): Promise<KnowledgeRouterResult> {
    const result = await this.resolveCore(searchTerm, parentSignal, scope);
    this.emitTelemetry(searchTerm, result);
    return result;
  }

  private async resolveCore(
    searchTerm: string,
    parentSignal?: AbortSignal,
    scope?: LlmJudgeScope,
  ): Promise<KnowledgeRouterResult> {
    const latencyMs: { kb?: number; judge?: number; web?: number } = {};
    const searchTermNormalised = searchTerm;

    // Caller already aborted: skip every leg (fail-open).
    if (parentSignal?.aborted) {
      return {
        facts: [],
        source: 'none',
        fallback_triggered: false,
        metadata: { searchTerm: searchTermNormalised, latencyMs },
      };
    }

    // Leg 1 — KB (Wikidata). `KnowledgeBaseProvider.lookup` has no signal arg;
    // 200ms cap enforced externally via runWithLegBudget.
    const kbStart = performance.now();
    const kbLeg = this.runWithLegBudget(
      this.deps.kb.lookup({ searchTerm: searchTermNormalised }),
      this.deps.config.kbTimeoutMs,
      parentSignal,
    );
    const kbFacts = await kbLeg.catch((err: unknown) => {
      logger.warn('knowledge_router_kb_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    latencyMs.kb = performance.now() - kbStart;

    if (kbFacts) {
      return {
        facts: formatKbFacts(kbFacts),
        source: 'wikidata',
        fallback_triggered: false,
        metadata: { searchTerm: searchTermNormalised, latencyMs },
      };
    }

    // Leg 2 — LLM judge (500ms). Fail-open neutral = confidence 0 → forces WS
    // leg (safer default: more grounding, not less).
    const judgeStart = performance.now();
    const judgeSignal = buildLegSignal(this.deps.config.judgeTimeoutMs, parentSignal);
    const judge = await this.deps.judge
      .evaluate(searchTermNormalised, judgeSignal, scope)
      .catch((err: unknown) => {
        logger.warn('knowledge_router_judge_error', {
          error: err instanceof Error ? err.message : String(err),
        });
        return { confidence: 0, decision: 'review' as const };
      });
    latencyMs.judge = performance.now() - judgeStart;

    if (judge.confidence >= this.deps.config.threshold) {
      return {
        facts: [],
        source: 'none',
        fallback_triggered: false,
        judge_confidence: judge.confidence,
        metadata: { searchTerm: searchTermNormalised, latencyMs },
      };
    }

    // Leg 3 — WebSearch (Tavily → Brave fallback, 1500ms). C9.15 retired SearXNG.
    const { webFacts, webResultCount, latencyWeb } = await this.runWebSearchLeg(
      searchTermNormalised,
      parentSignal,
    );
    latencyMs.web = latencyWeb;

    return {
      facts: webFacts,
      source: webResultCount > 0 ? 'web' : 'none',
      fallback_triggered: true,
      judge_confidence: judge.confidence,
      metadata: { searchTerm: searchTermNormalised, latencyMs },
    };
  }

  /**
   * Fail-open: WS error → `wsErrored=true`, `webResults=[]`, counter outcome='error'.
   *
   * C9.13 — when `webResults.length > 1`, results are re-ordered by the
   * injected `RerankerPort` BEFORE slicing to `MAX_WEB_FACTS`. Any reranker
   * failure (throw / timeout) is caught and the baseline order is preserved
   * (counter `musaium_rerank_fallback_total{caller='knowledge-router'}`
   * incremented).
   */
  private async runWebSearchLeg(
    searchTermNormalised: string,
    parentSignal: AbortSignal | undefined,
  ): Promise<{ webFacts: string[]; webResultCount: number; latencyWeb: number }> {
    const webStart = performance.now();
    const webSignal = buildLegSignal(this.deps.config.wsTimeoutMs, parentSignal);
    let wsErrored = false;
    const webResults = await this.deps.ws
      .search({ query: searchTermNormalised, signal: webSignal })
      .catch((err: unknown) => {
        wsErrored = true;
        logger.warn('knowledge_router_ws_error', {
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      });
    const latencyWeb = performance.now() - webStart;

    chatWebsearchFallbackTotal.inc({
      outcome: pickWebsearchOutcome(wsErrored, webResults.length),
    });

    const orderedResults = await this.maybeRerankWebResults(searchTermNormalised, webResults);

    const webFacts = orderedResults.slice(0, MAX_WEB_FACTS).map((r) => `${r.title}: ${r.snippet}`);

    return { webFacts, webResultCount: webResults.length, latencyWeb };
  }

  /**
   * C9.13 — optional rerank phase. Fail-open: throw / timeout → baseline.
   *
   * Telemetry contract (design §10):
   *  - Langfuse span `chat.rerank` with metadata `{ caller, candidateCount,
   *    topN, latencyMs, outcome, queryHash }`. `queryHash` = sha256(query)[:16].
   *  - Prom histogram `musaium_rerank_latency_ms{caller='knowledge-router',
   *    outcome=...}` per call.
   *  - Prom counter `musaium_rerank_fallback_total{caller='knowledge-router',
   *    reason=...}` on fail-open.
   */
  private async maybeRerankWebResults(
    searchTerm: string,
    webResults: readonly SearchResult[],
  ): Promise<readonly SearchResult[]> {
    if (webResults.length <= 1) return webResults;

    const candidateCount = webResults.length;
    const topN = Math.min(MAX_WEB_FACTS, candidateCount);
    const docs = webResults.map((r) => `${r.title}: ${r.snippet}`);
    const rerankStart = performance.now();

    try {
      const rerankSignal = AbortSignal.timeout(this.deps.config.rerankTimeoutMs);
      const rerankResults = await this.runRerankWithSignal(searchTerm, docs, topN, rerankSignal);
      const latencyMs = performance.now() - rerankStart;

      const reordered: SearchResult[] = [];
      const usedIndices = new Set<number>();
      for (const { docIndex } of rerankResults) {
        if (docIndex < 0 || docIndex >= webResults.length) continue;
        reordered.push(webResults[docIndex]);
        usedIndices.add(docIndex);
      }
      // Append any unranked tail so total count is preserved (defensive —
      // reranker SHOULD return topN ≤ candidateCount entries, but if it
      // returns fewer the baseline tail still feeds the slice).
      if (reordered.length < candidateCount) {
        for (let i = 0; i < webResults.length; i += 1) {
          if (!usedIndices.has(i)) {
            reordered.push(webResults[i]);
          }
        }
      }

      this.emitRerankTelemetry({
        searchTerm,
        candidateCount,
        topN,
        latencyMs,
        outcome: 'success',
      });
      return reordered;
    } catch (err) {
      const latencyMs = performance.now() - rerankStart;
      const reason = pickRerankFallbackReason(err);

      this.emitRerankTelemetry({
        searchTerm,
        candidateCount,
        topN,
        latencyMs,
        outcome: 'fallback',
        reason,
        errorClass: err instanceof Error ? err.constructor.name : 'Unknown',
      });
      return webResults;
    }
  }

  /**
   * Wraps `reranker.rerank(...)` with an AbortSignal-aware timeout. The
   * underlying port has no signal arg; abort path rejects with a synthetic
   * timeout-flavoured `RerankerUnavailableError` so the caller's fallback
   * counter sees `reason='timeout'`.
   */
  private async runRerankWithSignal(
    query: string,
    docs: string[],
    topN: number,
    signal: AbortSignal,
  ): Promise<readonly { docIndex: number; score: number }[]> {
    const budgetMs = String(this.deps.config.rerankTimeoutMs);
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

      this.deps.reranker.rerank(query, docs, topN).then(
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

  /**
   * Emits Langfuse span + Prom histogram (+ fallback counter when outcome
   * `fallback`). Both wrapped in `safeTrace` — telemetry outage cannot
   * propagate to chat pipeline.
   */
  private emitRerankTelemetry(payload: {
    searchTerm: string;
    candidateCount: number;
    topN: number;
    latencyMs: number;
    outcome: 'success' | 'fallback';
    reason?: 'unavailable' | 'timeout' | 'error';
    errorClass?: string;
  }): void {
    safeTrace('chat.rerank.metric', () => {
      rerankLatencyMs.observe(
        { caller: RERANK_CALLER_LABEL, outcome: payload.outcome },
        payload.latencyMs,
      );
      if (payload.outcome === 'fallback' && payload.reason !== undefined) {
        rerankFallbackTotal.inc({
          caller: RERANK_CALLER_LABEL,
          reason: payload.reason,
        });
      }
    });

    if (payload.outcome === 'fallback') {
      logger.warn('reranker_fallback', {
        caller: RERANK_CALLER_LABEL,
        reason: payload.reason,
        errorClass: payload.errorClass,
        originalCount: payload.candidateCount,
        queryHash: createHash('sha256').update(payload.searchTerm).digest('hex').slice(0, 16),
      });
    }

    safeTrace('chat.rerank.span', () => {
      const lf = getLangfuse();
      const queryHash = createHash('sha256').update(payload.searchTerm).digest('hex').slice(0, 16);
      lf?.trace({
        name: 'chat.rerank',
        metadata: {
          'rerank.caller': RERANK_CALLER_LABEL,
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
   * Fail-open via `safeTrace` (R10). `searchTerm` hashed sha256[:16] before
   * inclusion (NFR7 PII safety). Latency keys flattened for Langfuse flat-tag UI.
   */
  private emitTelemetry(searchTerm: string, result: KnowledgeRouterResult): void {
    const lf = getLangfuse();
    safeTrace('chat.knowledge.lookup.span', () => {
      const hash = createHash('sha256').update(searchTerm).digest('hex').slice(0, 16);
      const latency = result.metadata?.latencyMs ?? {};
      const metadata: Record<string, unknown> = {
        'knowledge.source': result.source,
        'knowledge.fallback_triggered': result.fallback_triggered,
        'knowledge.search_term_hash': hash,
      };
      if (result.judge_confidence !== undefined) {
        metadata['knowledge.judge_confidence'] = result.judge_confidence;
      }
      if (latency.kb !== undefined) metadata['knowledge.latency_ms.kb'] = latency.kb;
      if (latency.judge !== undefined) metadata['knowledge.latency_ms.judge'] = latency.judge;
      if (latency.web !== undefined) metadata['knowledge.latency_ms.web'] = latency.web;
      lf?.trace({ name: 'chat.knowledge.lookup', metadata });
    });
  }
}
