/**
 * C4.1 (2026-05-11) — `LlmJudgePort`.
 *
 * Port extracted from the existing `useCase/llm/llm-judge-guardrail.ts`
 * function `judgeWithLlm` so the `KnowledgeRouter` cascade (R6 / D4) can
 * consume the judge through a hexagonal seam — and so the ML calibration team
 * can later swap the implementation (ADR-038 §Phase D, isotonic regression on
 * real-signal logs) without touching the router.
 *
 * Shape rationale :
 *   - The router only needs a coarse `allow | block | review` triage and a
 *     `confidence ∈ [0, 1]` to compare against `WEBSEARCH_FALLBACK_THRESHOLD`.
 *     The internal `JudgeDecision` shape (with `block:abuse`, `block:injection`,
 *     `block:offtopic`) stays internal to the guardrail concern.
 *   - `decision: 'review'` is the fail-open verdict : when the underlying
 *     judge returns `null` (timeout / parse / budget) the wrapper surfaces
 *     `{ confidence: 0, decision: 'review' }` so the router falls through to
 *     the WebSearch leg by default (low-confidence path).
 *   - `reason?` carries the original internal verdict label (string) for
 *     observability / debugging only — never user-facing.
 */

/** Coarse triage label suitable for a downstream cascade. */
export type LlmJudgeDecision = 'allow' | 'block' | 'review';

/** Validated, port-shaped result returned by the LLM judge. */
export interface LlmJudgeResult {
  /** Model self-reported confidence clamped to `[0, 1]`. */
  confidence: number;
  /** Triage decision. `'review'` = the judge could not produce a verdict. */
  decision: LlmJudgeDecision;
  /** Optional pass-through of the internal verdict label for telemetry only. */
  reason?: string;
}

/**
 * Port for the LLM judge. Implementations must :
 *   - never throw (fail-open : on any failure, return
 *     `{ confidence: 0, decision: 'review' }`).
 *   - honor `signal` cancellation by short-circuiting to `'review'`.
 */
export interface LlmJudgePort {
  /**
   * Evaluate a prompt and return a triage result. Backward-compat note : the
   * concrete adapter (`LlmJudgeGuardrail`) wraps the legacy `judgeWithLlm`
   * function which all five existing call-sites continue to consume directly.
   */
  evaluate(prompt: string, signal?: AbortSignal): Promise<LlmJudgeResult>;
}
