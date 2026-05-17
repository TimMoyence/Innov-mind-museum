import { buildBlockedOutputPayload } from '../guardrail-refusal-builder';

import type { GuardrailBlockReason } from '../art-topic-guardrail';
import type { GuardrailAuditContext } from '../guardrail-audit-payload';
import type { ArtTopicClassifierPort } from '../guardrail-evaluation.types';
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';

/** Result of the output classifier helper — `undefined` means allow. */
export type ClassifierBlockResult =
  | { text: string; metadata: ChatAssistantMetadata; allowed: boolean }
  | undefined;

/** Dependencies for {@link runArtTopicClassifier}. */
export interface RunArtTopicClassifierDeps {
  classifier?: ArtTopicClassifierPort;
  /**
   * Callback the service injects so the helper can route audit rows through
   * the existing `logBlock` infrastructure without owning the audit dep
   * itself. The classifier helper stays pure — only the service decides what
   * happens on a block.
   */
  logBlock: (params: {
    phase: 'input' | 'output';
    reason: GuardrailBlockReason | undefined;
    fullText: string;
    classifierRan: boolean;
    providerRan: boolean;
    context?: GuardrailAuditContext;
  }) => Promise<void>;
}

/**
 * Runs the optional art-topic classifier as the last layer of the output
 * guardrail. Fail-CLOSED on error: if the classifier throws, suppress the
 * LLM output and return a generic `unsafe_output` refusal (OWASP LLM 2026
 * guidance — never pass unverified model output when a safety check fails
 * to execute). Returns `undefined` when allowed, the refusal payload when
 * blocked. Audit rows are emitted on every block branch.
 */
export async function runArtTopicClassifier(
  args: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
    providerRan: boolean;
    context?: GuardrailAuditContext;
  },
  deps: RunArtTopicClassifierDeps,
): Promise<ClassifierBlockResult> {
  const { text, metadata, requestedLocale, providerRan, context } = args;
  if (!deps.classifier) return undefined;

  let isArt: boolean;
  try {
    isArt = await deps.classifier.isArtRelated(text);
  } catch {
    await deps.logBlock({
      phase: 'output',
      reason: 'unsafe_output',
      fullText: text,
      classifierRan: true,
      providerRan,
      context,
    });
    return buildBlockedOutputPayload({
      reason: 'unsafe_output',
      requestedLocale,
      metadata,
    });
  }
  if (!isArt) {
    await deps.logBlock({
      phase: 'output',
      reason: 'off_topic',
      fullText: text,
      classifierRan: true,
      providerRan,
      context,
    });
    return buildBlockedOutputPayload({
      reason: 'off_topic',
      requestedLocale,
      metadata,
    });
  }
  return undefined;
}

/**
 * Aggregates the answer text with LLM-authored caption + rationale strings
 * from `metadata.images[]` and `metadata.suggestedImages[]`.
 *
 * D3 (2026-05) — those fields flow back to the user as visible text via
 * `ImageCarousel.<Text>`; they must pass through the same keyword guardrail
 * as the answer body so injection / PII leaks in either surface are caught.
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
