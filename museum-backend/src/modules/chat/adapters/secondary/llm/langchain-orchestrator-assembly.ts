import * as Sentry from '@sentry/node';

import { createSummaryFallback, type LlmSectionName } from '@modules/chat/useCase/llm/llm-sections';
import { parseAssistantResponse } from '@modules/chat/useCase/orchestration/assistant-response';
import { logger } from '@shared/logger/logger';
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

type SectionPlan = ReturnType<typeof buildOrchestratorMessages>['sectionPlan'];

/**
 *
 */
export interface AssembleResponseInput {
  input: OrchestratorInput;
  sectionPlan: SectionPlan;
  bySection: Map<LlmSectionName, SectionRunResult<string>>;
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

/** Resolves summary text + metadata from section results, applying fallback when needed. */
export function resolveSummary(
  bySection: Map<LlmSectionName, SectionRunResult<string>>,
  input: OrchestratorInput,
  recentHistory: ChatMessage[],
  normalizedText: string | undefined,
): ResolvedSummary {
  const summaryResult = bySection.get('summary');

  if (summaryResult?.status === 'success') {
    const parsed = parseAssistantResponse(summaryResult.value);
    return {
      text: parsed.answer || EMPTY_RESPONSE_FALLBACK,
      metadata: parsed.metadata,
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

/** Builds per-section diagnostics entries for observability metadata. */
export function buildDiagnosticsSections(
  sectionPlan: SectionPlan,
  bySection: Map<LlmSectionName, SectionRunResult<string>>,
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

/** Assembles diagnostics sections and logs orchestration completion. */
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

  return { text, metadata };
}

/** Parses raw streamed content into the final response, optionally attaching diagnostics. */
export function buildStreamSuccessResponse(
  rawContent: string,
  requestId?: string,
): OrchestratorOutput {
  const parsed = parseAssistantResponse(rawContent);

  logger.info('llm_stream_complete', {
    requestId,
    provider: env.llm.provider,
    model: env.llm.model,
    textLength: rawContent.length,
  });

  let metadata = parsed.metadata;
  if (env.llm.includeDiagnostics) {
    metadata = {
      ...metadata,
      diagnostics: {
        profile: 'single_section' as const,
        degraded: false,
        totalLatencyMs: 0,
        sections: [],
      },
    };
  }

  return { text: parsed.answer, metadata };
}
