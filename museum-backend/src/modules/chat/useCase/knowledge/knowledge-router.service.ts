/**
 * C4.1 — `KnowledgeRouterService` cascades KB → judge → WebSearch with per-leg
 * AbortSignal.any budgets (D4 — Node ≥ 22.3). Fail-open (ADR-035): every leg
 * wrapped in `.catch`; `resolve()` NEVER throws — errors become `source: 'none'`.
 * No feature flag (D11 — pré-launch V1); env vars are tuning-only.
 */

import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { chatWebsearchFallbackTotal } from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';

import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';
import type { LlmJudgePort } from '@modules/chat/useCase/llm/llm-judge-guardrail';

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
  resolve(searchTerm: string, signal?: AbortSignal): Promise<KnowledgeRouterResult>;
}

/** Tuning only — no field can disable the feature (D11). */
export interface KnowledgeRouterConfig {
  /** Confidence cutoff [0..1] above which WebSearch is skipped (default 0.7). */
  threshold: number;
  kbTimeoutMs: number;
  judgeTimeoutMs: number;
  wsTimeoutMs: number;
}

export interface KnowledgeRouterDeps {
  kb: KnowledgeBaseProvider;
  ws: WebSearchProvider;
  judge: LlmJudgePort;
  config: KnowledgeRouterConfig;
}

const MAX_WEB_FACTS = 5;

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
  async resolve(searchTerm: string, parentSignal?: AbortSignal): Promise<KnowledgeRouterResult> {
    const result = await this.resolveCore(searchTerm, parentSignal);
    this.emitTelemetry(searchTerm, result);
    return result;
  }

  private async resolveCore(
    searchTerm: string,
    parentSignal?: AbortSignal,
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
      .evaluate(searchTermNormalised, judgeSignal)
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

    // Leg 3 — WebSearch (Brave → Tavily → SearXNG, 1500ms).
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

    const webFacts = webResults.slice(0, MAX_WEB_FACTS).map((r) => `${r.title}: ${r.snippet}`);

    return { webFacts, webResultCount: webResults.length, latencyWeb };
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
