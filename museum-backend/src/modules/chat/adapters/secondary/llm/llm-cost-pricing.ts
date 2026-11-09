import {
  BYTES_PER_TOKEN,
  VISION_BYTES_EQUIVALENT,
  VISION_TOKEN_EQUIVALENT,
} from '@modules/chat/domain/llm/vision-cost.constants';
import { logger } from '@shared/logger/logger';

export { BYTES_PER_TOKEN, VISION_BYTES_EQUIVALENT, VISION_TOKEN_EQUIVALENT };

export interface ModelPriceCents {
  inputPer1kCents: number;
  outputPer1kCents: number;
}

export const PRICING: Record<string, ModelPriceCents> = {
  'gpt-4o-mini': { inputPer1kCents: 0.015, outputPer1kCents: 0.06 },
  'gpt-4o': { inputPer1kCents: 0.25, outputPer1kCents: 1 },
  'deepseek-chat': { inputPer1kCents: 0.014, outputPer1kCents: 0.028 },
  'gemini-1.5-flash': { inputPer1kCents: 0.0075, outputPer1kCents: 0.03 },
};

export const FALLBACK_PRICING: ModelPriceCents = {
  inputPer1kCents: 0.5,
  outputPer1kCents: 2,
};

let _warnedModels = new Set<string>();

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

export function __resetCostPricingWarnings(): void {
  _warnedModels = new Set<string>();
}
