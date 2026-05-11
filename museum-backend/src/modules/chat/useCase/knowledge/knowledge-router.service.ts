/**
 * C4.1 (2026-05-11) — `KnowledgeRouterService` use-case.
 *
 * Implements `KnowledgeRouterPort` (R6) — cascades three knowledge providers
 * with sub-budget abort signals :
 *
 *   1. `KnowledgeBaseProvider.lookup({searchTerm})`     (200 ms — R7)
 *   2. `LlmJudgePort.evaluate(searchTerm)`              (500 ms — R8)
 *   3. `WebSearchProvider.search({query, signal})`      (1500 ms — R9)
 *
 * Each leg combines its budget with the optional `parentSignal` via
 * `AbortSignal.any([AbortSignal.timeout(legBudget), parentSignal])` (D4 — Node ≥ 22.3
 * required, satisfied by `engines.node = ">=22.0.0"` in `museum-backend/package.json`).
 *
 * **Fail-open contract (R9, R10, ADR-035):** every leg's promise is wrapped in
 * `.catch(() => <neutral value>)`. The `resolve()` method NEVER throws —
 * exceptions become `source: 'none'`. This preserves the chat-pipeline
 * downstream contract (`ChatMessageService` does not surface 5xx on knowledge
 * failure).
 *
 * **No feature flag (D11 — doctrine pré-launch V1):** there is NO `*_ENABLED`
 * switch and no boolean toggle on `KnowledgeRouterDeps`. Rollback strategy =
 * `git revert <merge-sha>` (see design §8). Env vars are tuning-only
 * (`WEBSEARCH_FALLBACK_THRESHOLD`, `KB_TIMEOUT_MS`, `JUDGE_TIMEOUT_MS`,
 * `WEBSEARCH_TIMEOUT_MS`) and CANNOT disable the feature.
 *
 * Latency observability : every exercised leg writes its measured duration
 * into `metadata.latencyMs.{kb,judge,web}`. Legs not exercised remain
 * `undefined` (cheaper for Langfuse + Grafana — keys absent rather than 0).
 *
 * Hexagonal placement : `useCase/knowledge/`. Consumes domain ports only
 * (`@modules/chat/domain/ports/*`) — no adapter imports.
 */

import { createHash } from 'node:crypto';

import { logger } from '@shared/logger/logger';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { chatWebsearchFallbackTotal } from '@shared/observability/prometheus-metrics';
import { safeTrace } from '@shared/observability/safeTrace';

import type {
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type {
  KnowledgeRouterPort,
  KnowledgeRouterResult,
} from '@modules/chat/domain/ports/knowledge-router.port';
import type { LlmJudgePort } from '@modules/chat/domain/ports/llm-judge.port';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

/**
 * Tuning configuration for the cascade. All fields are TUNING ONLY — none
 * can disable the feature (D11). Defaults are mirrored from `env.ts` and
 * surfaced here so unit tests can override without touching env.
 */
export interface KnowledgeRouterConfig {
  /** Confidence cutoff `[0..1]` above which WebSearch is skipped (default 0.7). */
  threshold: number;
  /** KB leg timeout in ms (default 200). */
  kbTimeoutMs: number;
  /** Judge leg timeout in ms (default 500). */
  judgeTimeoutMs: number;
  /** WebSearch leg timeout in ms (default 1500). */
  wsTimeoutMs: number;
}

/** Constructor dependencies — pure ports + tuning config. No `*_ENABLED` flag. */
export interface KnowledgeRouterDeps {
  kb: KnowledgeBaseProvider;
  ws: WebSearchProvider;
  judge: LlmJudgePort;
  config: KnowledgeRouterConfig;
}

/**
 * Cap the WebSearch result list before fact-formatting. Picked at 5 because :
 * (a) the Spotlighting envelope budget (R3) is conservative,
 * (b) the LLM section runner truncates further at MAX_BLOCK_LENGTH,
 * (c) Brave returns up to 10 — 5 is a good precision/recall trade-off.
 */
const MAX_WEB_FACTS = 5;

/**
 * Compose a parent + timeout signal for one cascade leg. Returns a fresh
 * `AbortSignal` that aborts when EITHER the leg's `AbortSignal.timeout` fires
 * OR the parent signal aborts. `parentSignal === undefined` is supported.
 *
 * Required (D4) : the implementation uses `AbortSignal.any`, NOT
 * `Promise.race`, to avoid the "loser leak" pattern (Promise.race resolves
 * with the winner but does not abort the losers, which keep consuming tokens
 * / network).
 */
function buildLegSignal(legBudgetMs: number, parentSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(legBudgetMs);
  return parentSignal ? AbortSignal.any([timeoutSignal, parentSignal]) : timeoutSignal;
}

/**
 * Map the WS leg's exit state into the bounded `chat_websearch_fallback_total`
 * outcome taxonomy. Pulled out of `resolveCore` so the call site stays
 * single-statement and the ESLint `no-unnecessary-condition` + sonar
 * `no-nested-conditional` rules don't trip on the `wsErrored` flag (whose
 * mutation lives inside an async `.catch` closure that the flow analyser
 * conservatively treats as never-firing).
 */
function pickWebsearchOutcome(errored: boolean, resultCount: number): 'hit' | 'empty' | 'error' {
  if (errored) return 'error';
  if (resultCount > 0) return 'hit';
  return 'empty';
}

/**
 * Convert `ArtworkFacts` into a list of LLM-injectable fact strings. Kept
 * deliberately short and prefixed — the downstream `llm-sections.ts`
 * Spotlighting envelope (R3) wraps these in `<untrusted_content>` markers
 * and the LLM is instructed to verify quotes against them.
 *
 * Note : the existing `buildKnowledgeBasePromptBlock` returns one large string
 * — we keep things independent here so the validator (T2.4) can match quotes
 * against any individual fact line rather than the full block.
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

/**
 * Concrete implementation of `KnowledgeRouterPort`. See file-level comment for
 * the cascade contract, fail-open guarantees, and AbortSignal.any wiring.
 */
export class KnowledgeRouterService implements KnowledgeRouterPort {
  constructor(private readonly deps: KnowledgeRouterDeps) {}

  /**
   * Enforce a per-leg budget on a provider promise whose underlying port does
   * not accept an `AbortSignal`. Used by leg 1 (KB) where the
   * `KnowledgeBaseProvider.lookup` signature is `{searchTerm, language?}` only
   * — the per-leg budget is enforced externally here.
   *
   * Builds the combined signal via `AbortSignal.any` (D4 — required) and races
   * the inner promise against an abort-listener promise. On timeout / parent
   * abort, this method REJECTS with `AbortError` ; the caller's `.catch` is
   * responsible for fail-open conversion (R10).
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
   * Resolve facts for the given search term — cascades KB → judge → WebSearch
   * with bounded latency per leg. Never throws (D8).
   *
   * C4 T7.1 / T7.3 — emits one Langfuse `chat.knowledge.lookup` trace and one
   * `chat_websearch_fallback_total{outcome}` increment per resolve() call when
   * the WS leg is exercised. PII safety (NFR7) : the raw `searchTerm` NEVER
   * leaves this method ; the trace metadata carries only a sha256[:16] hash.
   */
  async resolve(searchTerm: string, parentSignal?: AbortSignal): Promise<KnowledgeRouterResult> {
    const result = await this.resolveCore(searchTerm, parentSignal);
    this.emitTelemetry(searchTerm, result);
    return result;
  }

  /**
   * Pure cascade implementation. Pulled out of `resolve()` so the telemetry
   * wrapper stays small and the cascade logic stays the same shape it was at
   * landing (audit-friendly). Never throws.
   */
  private async resolveCore(
    searchTerm: string,
    parentSignal?: AbortSignal,
  ): Promise<KnowledgeRouterResult> {
    const latencyMs: { kb?: number; judge?: number; web?: number } = {};
    const searchTermNormalised = searchTerm;

    // Case 6 short-circuit : if the caller already aborted before invocation,
    // skip every leg and return `source: 'none'` immediately. This avoids
    // wasted provider calls and matches the fail-open contract.
    if (parentSignal?.aborted) {
      return {
        facts: [],
        source: 'none',
        fallback_triggered: false,
        metadata: { searchTerm: searchTermNormalised, latencyMs },
      };
    }

    // -----------------------------------------------------------------------
    // Leg 1 — KnowledgeBase (Wikidata) lookup with 200 ms budget.
    //
    // Note on AbortSignal plumbing : the current `KnowledgeBaseProvider.lookup`
    // interface does not take a signal — the inner `KnowledgeBaseService` wraps
    // the provider with its own `AbortController` keyed on `KB_TIMEOUT_MS`. We
    // therefore rely on the wrapped service's timeout AND `Promise.race` with
    // our own `AbortSignal.any` budget below to guarantee the 200 ms cap. The
    // fail-open `.catch` swallows the rejection on timeout or parent abort.
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Leg 2 — LLM judge confidence query with 500 ms budget.
    // -----------------------------------------------------------------------
    const judgeStart = performance.now();
    const judgeSignal = buildLegSignal(this.deps.config.judgeTimeoutMs, parentSignal);
    const judge = await this.deps.judge
      .evaluate(searchTermNormalised, judgeSignal)
      .catch((err: unknown) => {
        logger.warn('knowledge_router_judge_error', {
          error: err instanceof Error ? err.message : String(err),
        });
        // Fail-open neutral : confidence 0 forces the WS leg to run, which is
        // the safer default (more grounding, not less).
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

    // -----------------------------------------------------------------------
    // Leg 3 — WebSearch (Brave → Tavily → SearXNG) with 1500 ms budget.
    // -----------------------------------------------------------------------
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
   * WebSearch leg — runs the WS provider with the 1500 ms budget + parent
   * signal, increments `chat_websearch_fallback_total{outcome}` (T7.3 — hit /
   * empty / error), and returns the formatted facts + the timing + the raw
   * result count for the caller's `source` decision (web vs none).
   *
   * Extracted from `resolveCore` to satisfy the file's 80-line-per-function
   * cap. Fail-open semantics preserved : WS error → `wsErrored=true`,
   * `webResults=[]`, counter outcome='error'.
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

    const webFacts = webResults
      .slice(0, MAX_WEB_FACTS)
      .map((r) => `${r.title}: ${r.snippet}`);

    return { webFacts, webResultCount: webResults.length, latencyWeb };
  }

  /**
   * Emit the `chat.knowledge.lookup` Langfuse trace summarising the resolve
   * outcome. Fail-open via `safeTrace` — a Langfuse-SDK throw never propagates
   * into the chat path (R10).
   *
   * The `searchTerm` is hashed before inclusion (sha256[:16]) so PII / user
   * intent never round-trips into telemetry (NFR7 — spec §10 PII safety).
   * Latency keys are flattened (`knowledge.latency_ms.kb` etc.) so Langfuse'
   * flat-tag UI surfaces them as filterable attributes rather than nested
   * objects.
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
