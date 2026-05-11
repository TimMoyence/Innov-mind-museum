/**
 * C4.1 (2026-05-11) — `KnowledgeRouterPort`.
 *
 * Domain port consumed by `ChatMessageService` to resolve verified facts for a
 * user search term. Implementation cascades `KnowledgeBase (200 ms) → LLM judge
 * (500 ms) → WebSearch (1500 ms)` using `AbortSignal.any()` per leg
 * (spec.md R6, design.md D4). This file is pure domain — no framework,
 * adapter, or env imports — so it can be safely mocked in unit tests by
 * providing a `KnowledgeRouterPort`-shaped stub.
 *
 * Hexagonal placement : `domain/ports/`. Implementation lives at
 * `useCase/knowledge/knowledge-router.service.ts` (T3.2).
 */

/** Provenance label for the leg that produced the facts. */
export type KnowledgeRouterSource = 'wikidata' | 'web' | 'none';

/**
 * Result of one router resolution. `fallback_triggered` is `true` when the
 * WebSearch leg ran (regardless of outcome), `false` otherwise. `judge_confidence`
 * is populated only when the judge leg ran. Latencies are populated per leg
 * actually exercised (kb / judge / web) so observability can render a flame
 * timeline.
 */
export interface KnowledgeRouterResult {
  /** Verified fact strings to be wrapped in the Spotlighting envelope (R3). */
  facts: string[];
  /** Which leg produced the facts. `'none'` when nothing is grounded. */
  source: KnowledgeRouterSource;
  /** True when the WebSearch leg was actually exercised. */
  fallback_triggered: boolean;
  /** Judge confidence in `[0, 1]` when the judge leg ran; undefined otherwise. */
  judge_confidence?: number;
  /** Observability bundle — kept opaque to the chat orchestrator. */
  metadata?: {
    /** The (already-sanitised) search term that produced this result. */
    searchTerm: string;
    /** Per-leg latencies in ms. Missing keys = leg not exercised. */
    latencyMs: {
      kb?: number;
      judge?: number;
      web?: number;
    };
  };
}

/**
 * Port for the knowledge router use-case. Implementations must :
 *   - never throw (fail-open per R9/R10 — return `source: 'none'`).
 *   - honor `signal` cancellation by aborting any in-flight leg.
 */
export interface KnowledgeRouterPort {
  /**
   * Resolve facts for the given search term.
   *
   * @param searchTerm sanitised lookup string (caller's responsibility).
   * @param signal optional parent abort signal — combined with the per-leg
   *               timeout via `AbortSignal.any` inside the implementation.
   */
  resolve(searchTerm: string, signal?: AbortSignal): Promise<KnowledgeRouterResult>;
}
