/**
 * C9.4 — LLM cost estimator (USD cents). Conservative, payload-bytes-based
 * approximation (4 bytes per token) + model price table. Real
 * token-usage extraction comes in C9.5 (cache-hit telemetry).
 *
 * Rounding: `Math.ceil` everywhere — safety bias for the circuit breaker.
 */

import { logger } from '@shared/logger/logger';

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

const BYTES_PER_TOKEN = 4;

/**
 * Image-aware cost override — RUN_ID 2026-05-21-p0-c2-cost-breaker / spec §3 R4 + D1.
 *
 * Per-image forfait substituted by `estimatePayloadBytes()` in
 * `llm-prompt-builder.ts` for any content item of shape
 * `{type:'image_url', image_url:{url:<base64 data-URL | https URL>}}`. The
 * literal base64 byte length of an inline image (often ~1 MB+) is NOT a
 * realistic proxy for the provider's billed input tokens — OpenAI bills
 * 85–1105 tokens per image at `detail:high` (`https://platform.openai.com/
 * docs/guides/vision`, NOT WebFetch-verified at this commit per spec §8 Q3).
 *
 * D1 lock: 1000 tokens is the conservative upper bound. Lower would
 * under-protect; higher would inflate false-positive breaker trips on
 * legitimate single-image requests. No env override — UFR-015 (no pre-launch
 * flags) ; tune via PR if real-world drift > 10 % vs invoice (Q1 V2 deferred
 * to real-tokenizer adoption).
 *
 * `VISION_BYTES_EQUIVALENT = VISION_TOKEN_EQUIVALENT * BYTES_PER_TOKEN = 4000`
 * keeps the conversion symmetrical with the byte-based estimator: 1000 vision
 * tokens × 4 bytes/token = 4000 forfait bytes per image item.
 */
export const VISION_TOKEN_EQUIVALENT = 1000;
export const VISION_BYTES_EQUIVALENT = VISION_TOKEN_EQUIVALENT * BYTES_PER_TOKEN;

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
