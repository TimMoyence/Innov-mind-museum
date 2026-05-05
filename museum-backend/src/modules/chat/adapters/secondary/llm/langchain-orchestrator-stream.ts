import { buildSectionMessages } from '@modules/chat/useCase/llm/llm-prompt-builder';
import { env } from '@src/config/env';

import { sectionRunnerHooks } from './langchain-orchestrator-support';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { buildOrchestratorMessages } from '@modules/chat/useCase/llm/llm-prompt-builder';

type Prepared = ReturnType<typeof buildOrchestratorMessages>;

/** Builds messages for the first section of a plan (used in streaming). */
export function buildFirstSectionMessages(
  section: Prepared['sectionPlan'][0],
  prepared: Prepared,
  input: OrchestratorInput,
): ReturnType<typeof buildSectionMessages> {
  return buildSectionMessages(
    prepared.systemPrompt,
    section.prompt,
    prepared.historyMessages,
    prepared.userMessage,
    {
      userMemoryBlock: input.userMemoryBlock,
      knowledgeBaseBlock: input.knowledgeBaseBlock,
      webSearchBlock: input.webSearchBlock,
      localKnowledgeBlock: input.localKnowledgeBlock,
    },
  );
}

/** Creates an AbortController + timeout pair for stream time-limiting. */
export function createStreamTimeout(timeoutMs: number): {
  controller: AbortController;
  clearStreamTimeout: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    clearStreamTimeout: () => {
      clearTimeout(timeoutId);
    },
  };
}

interface BuildRunnerOptionsParams {
  requestId: string | undefined;
  shouldRetry: (error: unknown, status: string) => boolean;
}

/** Builds runner options for section task execution. */
export function buildRunnerOptions(params: BuildRunnerOptionsParams): {
  maxConcurrent: number;
  retries: number;
  retryBaseDelayMs: number;
  totalBudgetMs: number;
  requestId: string | undefined;
  shouldRetry: (error: unknown, status: string) => boolean;
  hooks: typeof sectionRunnerHooks;
} {
  return {
    maxConcurrent: 1,
    retries: env.llm.retries,
    retryBaseDelayMs: env.llm.retryBaseDelayMs,
    totalBudgetMs: env.llm.totalBudgetMs,
    requestId: params.requestId,
    shouldRetry: params.shouldRetry,
    hooks: sectionRunnerHooks,
  };
}
