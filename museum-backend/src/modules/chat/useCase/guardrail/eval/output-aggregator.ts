import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';

/**
 * Aggregates the answer text with LLM-authored caption + rationale strings
 * from `metadata.images[]` and `metadata.suggestedImages[]`.
 *
 * D3 (2026-05) — those fields flow back to the user as visible text via
 * `ImageCarousel.<Text>`; they must pass through the same keyword guardrail
 * as the answer body so injection / PII leaks in either surface are caught.
 *
 * C9.9 (2026-05-18) — extracted from `eval/output-classifier.helper.ts`
 * which is being deleted; this aggregator survives in its own module so
 * `GuardrailEvaluationService.evaluateOutput` keeps the input-aggregation
 * flow intact after OUTPUT O3 burial.
 */
export function aggregateOutputText(text: string, metadata: ChatAssistantMetadata): string {
  const parts: string[] = [text];
  for (const img of metadata.images ?? []) {
    if (img.caption) parts.push(img.caption);
    if (img.rationale) parts.push(img.rationale);
  }
  for (const sugg of metadata.suggestedImages ?? []) {
    if (sugg.caption) parts.push(sugg.caption);
    if (sugg.rationale) parts.push(sugg.rationale);
  }
  return parts.join(' ');
}
