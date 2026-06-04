/**
 * C9.4 — LLM cost estimator (USD cents). Conservative, payload-bytes-based
 * approximation (4 bytes per token) + model price table. Real
 * token-usage extraction comes in C9.5 (cache-hit telemetry).
 *
 * Rounding: `Math.ceil` everywhere — safety bias for the circuit breaker.
 */

import {
  BYTES_PER_TOKEN,
  VISION_BYTES_EQUIVALENT,
  VISION_TOKEN_EQUIVALENT,
} from '@modules/chat/domain/llm/vision-cost.constants';
import { logger } from '@shared/logger/logger';

// Re-exported (identity-preserving, spec R5) — these constants moved to
// `domain/llm/vision-cost.constants.ts` (B2 close, run
// 2026-06-04-hexagonal-boundaries-enforcement) so the application prompt-builder
// no longer imports them from this adapter. Existing importers of this module
// compile unchanged.
export { BYTES_PER_TOKEN, VISION_BYTES_EQUIVALENT, VISION_TOKEN_EQUIVALENT };

export interface ModelPriceCents {
  /** USD cents per 1000 input tokens. */
  inputPer1kCents: number;
  /** USD cents per 1000 output tokens. */
  outputPer1kCents: number;
}

/**
 * V1 pricing table (USD). Updated when provider catalog changes — committed,
 * not env-driven. Values reflect public list prices as of 2026-05.
 */
export const PRICING: Record<string, ModelPriceCents> = {
  'gpt-4o-mini': { inputPer1kCents: 0.015, outputPer1kCents: 0.06 },
  'gpt-4o': { inputPer1kCents: 0.25, outputPer1kCents: 1 },
  'deepseek-chat': { inputPer1kCents: 0.014, outputPer1kCents: 0.028 },
  'gemini-1.5-flash': { inputPer1kCents: 0.0075, outputPer1kCents: 0.03 },
};

/**
 * Fallback for unknown models. Set HIGHER than any priced model so the
 * breaker over-protects rather than under-protects.
 */
export const FALLBACK_PRICING: ModelPriceCents = {
  inputPer1kCents: 0.5,
  outputPer1kCents: 2,
};

let _warnedModels = new Set<string>();

/**
 * Estimate cost of one LLM section call in USD cents.
 *
 * @param payloadBytes - Input message-array serialized byte size. Used to
 *                      approximate input tokens (`bytes / 4`, ceil).
 * @param model - Model id (env.llm.model). Unknown → FALLBACK_PRICING + warn.
 * @param maxOutputTokens - Upper bound for output tokens (env.llm.maxOutputTokens).
 *                         Used as worst-case output estimate.
 * @returns Integer cents, ≥ 0. Returns 0 for non-positive payloadBytes.
 */
export function estimateCostCents(
  payloadBytes: number,
  model: string,
  maxOutputTokens: number,
): number {
  if (!Number.isFinite(payloadBytes) || payloadBytes <= 0) return 0;

  const price = PRICING[model] ?? FALLBACK_PRICING;
  if (price === FALLBACK_PRICING && !_warnedModels.has(model)) {
    _warnedModels.add(model);
    logger.warn('llm_cost_estimate_unknown_model', { model });
  }

  const inputTokens = Math.ceil(payloadBytes / BYTES_PER_TOKEN);
  const outputTokens =
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 0;

  const inputCents = (inputTokens * price.inputPer1kCents) / 1000;
  const outputCents = (outputTokens * price.outputPer1kCents) / 1000;

  return Math.ceil(inputCents + outputCents);
}

/** Test-only: clears the warn-once memoization. */
export function __resetCostPricingWarnings(): void {
  _warnedModels = new Set<string>();
}
