import * as Sentry from '@sentry/node';

import { createSummaryFallback } from '@modules/chat/useCase/llm/llm-sections';
import { extractMetadata } from '@modules/chat/useCase/orchestration/assistant-response';
import { logger } from '@shared/logger/logger';
import { chatResponseDegradedTotal } from '@shared/observability/prometheus-metrics';
import { env } from '@src/config/env';

import { EMPTY_RESPONSE_FALLBACK } from './langchain-orchestrator-support';

import type {
  ChatAssistantDiagnostics,
  ChatAssistantMetadata,
} from '@modules/chat/domain/chat.types';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type {
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { buildOrchestratorMessages } from '@modules/chat/useCase/llm/llm-prompt-builder';
import type { SectionRunResult } from '@modules/chat/useCase/llm/llm-section-runner';
import type { LlmSectionName, MainAssistantOutput } from '@modules/chat/useCase/llm/llm-sections';

type SectionPlan = ReturnType<typeof buildOrchestratorMessages>['sectionPlan'];

export interface AssembleResponseInput {
  input: OrchestratorInput;
  sectionPlan: SectionPlan;
  bySection: Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>;
  recentHistory: ChatMessage[];
  normalizedText: string | undefined;
  startedAt: number;
}

interface ResolvedSummary {
  text: string;
  metadata: ChatAssistantMetadata;
  degraded: boolean;
  fallbackApplied: boolean;
}

export function resolveSummary(
  bySection: Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>,
  input: OrchestratorInput,
  recentHistory: ChatMessage[],
  normalizedText: string | undefined,
): ResolvedSummary {
  const summaryResult = bySection.get('summary');

  if (summaryResult?.status === 'success') {
    const { text, ...rest } = summaryResult.value;
    const metadata = extractMetadata(rest as Record<string, unknown>);
    return {
      text: text || EMPTY_RESPONSE_FALLBACK,
      metadata,
      degraded: false,
      fallbackApplied: false,
    };
  }

  logger.warn('llm_section_fallback', {
    requestId: input.requestId,
    section: 'summary',
    reason:
      summaryResult?.status === 'timeout' ? 'timeout' : (summaryResult?.status ?? 'missing-result'),
  });

  const text = createSummaryFallback({
    history: recentHistory,
    question: normalizedText,
    location: input.context?.location,
    locale: input.locale,
    museumMode: input.museumMode,
  });

  return {
    text: text || EMPTY_RESPONSE_FALLBACK,
    metadata: {},
    degraded: true,
    fallbackApplied: true,
  };
}

export function buildDiagnosticsSections(
  sectionPlan: SectionPlan,
  bySection: Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>,
  fallbackApplied: boolean,
): ChatAssistantDiagnostics['sections'] {
  return sectionPlan.map((section) => {
    const result = bySection.get(section.name);

    if (!result) {
      return {
        name: section.name,
        status: fallbackApplied ? 'fallback' : 'error',
        attempts: 0,
        latencyMs: 0,
        timeoutMs: section.timeoutMs,
        payloadBytes: 0,
        error: 'No section result',
      };
    }

    return {
      name: section.name,
      status: fallbackApplied ? 'fallback' : result.status,
      attempts: result.attempts,
      latencyMs: result.latencyMs,
      timeoutMs: result.timeoutMs,
      payloadBytes: result.payloadBytes,
      ...(result.status !== 'success' ? { error: result.error } : {}),
    };
  });
}

/**
 * Metric label. Deliberately `missing_result` (underscore) while the LOG keeps its
 * historical `missing-result` (hyphen) — a log consumer may depend on that spelling,
 * and neither is "corrected" into the other in passing.
 */
type DegradedReason = 'timeout' | 'error' | 'missing_result';

const degradedReason = (
  bySection: Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>,
): DegradedReason => {
  const summaryResult = bySection.get('summary');
  if (summaryResult === undefined) return 'missing_result';
  return summaryResult.status === 'timeout' ? 'timeout' : 'error';
};

/**
 * R8 — the machine signal. Emitted ONLY on a degraded response, right next to the
 * Sentry attribute that used to be the only trace of it. `.inc()` is wrapped: a
 * metrics failure must never take the chat path down with it.
 *
 * @param bySection - the section results this response was assembled from
 */
const recordDegradedResponse = (
  bySection: Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>,
): void => {
  try {
    chatResponseDegradedTotal.inc({ section: 'summary', reason: degradedReason(bySection) });
  } catch (err) {
    logger.warn('chat_response_degraded_counter_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }
};

export function assembleResponse(params: AssembleResponseInput): OrchestratorOutput {
  const { input, sectionPlan, bySection, recentHistory, normalizedText, startedAt } = params;
  const {
    text,
    metadata: baseMeta,
    degraded,
    fallbackApplied,
  } = resolveSummary(bySection, input, recentHistory, normalizedText);

  const totalLatencyMs = Date.now() - startedAt;
  const profile: ChatAssistantDiagnostics['profile'] = 'single_section';
  const diagnosticsSections = buildDiagnosticsSections(sectionPlan, bySection, fallbackApplied);

  logger.info('llm_orchestration_complete', {
    requestId: input.requestId,
    profile,
    provider: env.llm.provider,
    model: env.llm.model,
    degraded,
    totalLatencyMs,
    sections: diagnosticsSections.map((section) => ({
      name: section.name,
      status: section.status,
      attempts: section.attempts,
      latencyMs: section.latencyMs,
    })),
  });

  let metadata = baseMeta;
  if (env.llm.includeDiagnostics) {
    metadata = {
      ...metadata,
      diagnostics: { profile, degraded, totalLatencyMs, sections: diagnosticsSections },
    };
  }

  Sentry.getActiveSpan()?.setAttribute('llm.latency_ms', totalLatencyMs);
  Sentry.getActiveSpan()?.setAttribute('llm.degraded', degraded);

  if (degraded) {
    recordDegradedResponse(bySection);
  }

  // INC-2026-07-14 — `degraded` rides on the OUTPUT, not on `metadata.diagnostics`.
  // `diagnostics` is attached above ONLY when `env.llm.includeDiagnostics` is true,
  // and that flag is hard-disabled outside development (`env.ts:194-195`). A consumer
  // reading the flag from `metadata.diagnostics` would therefore be correct in tests
  // and blind in production. The LLM response cache depends on this signal to avoid
  // memoising the canned fallback for up to 7 days (`TTL_GENERIC_S`).
  return { text, metadata, degraded };
}
