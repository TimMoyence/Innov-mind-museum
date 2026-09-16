/**
 * Shared factories for the LLM section runner + response assembly (UFR-002 —
 * never build these shapes inline in a test).
 *
 * Run `2026-07-14-otel-openai-instrumentation-kills-structured-llm`
 * (test-contract §Notes 6 · UC-33, UC-34, UC-36..UC-39, UC-45).
 */
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { SectionRunResult, SectionTask } from '@modules/chat/useCase/llm/llm-section-runner';
import type {
  LlmSectionDefinition,
  LlmSectionName,
  MainAssistantOutput,
} from '@modules/chat/useCase/llm/llm-sections';
import type { AssembleResponseInput } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-assembly';

/**
 * A structurally valid `MainAssistantOutput` (every field of the strict schema).
 * @param overrides
 */
export function makeMainAssistantOutput(
  overrides: Partial<MainAssistantOutput> = {},
): MainAssistantOutput {
  return {
    text: 'La Vénus de Milo est une statue grecque conservée au Louvre.',
    detectedArtwork: null,
    suggestions: null,
    nearbySuggestions: null,
    sources: null,
    ...overrides,
  } as MainAssistantOutput;
}

export function makeSectionTask<TValue>(
  overrides: Partial<SectionTask<TValue>> = {},
): SectionTask<TValue> {
  return {
    name: 'summary',
    timeoutMs: 8_000,
    payloadBytes: 10_436,
    run: () => Promise.reject(new Error('section-task fixture: no run() provided')),
    ...overrides,
  } as SectionTask<TValue>;
}

interface SectionFailureOverrides {
  name?: string;
  status?: 'timeout' | 'error';
  error?: string;
  attempts?: number;
  latencyMs?: number;
  timeoutMs?: number;
  payloadBytes?: number;
}

/**
 * The failure branch of `SectionRunResult` — the shape `resolveSummary` reads
 *  to decide `degraded: true` (and, after this run, the metric's `reason`).
 * @param overrides
 */
export function makeSectionRunFailure(
  overrides: SectionFailureOverrides = {},
): SectionRunResult<MainAssistantOutput> {
  return {
    name: 'summary',
    status: 'error',
    error: 'Body is unusable: Body has already been read',
    attempts: 1,
    latencyMs: 2_392,
    timeoutMs: 8_000,
    payloadBytes: 10_436,
    ...overrides,
  };
}

export function makeSectionRunSuccess(
  value: MainAssistantOutput = makeMainAssistantOutput(),
): SectionRunResult<MainAssistantOutput> {
  return {
    name: 'summary',
    status: 'success',
    value,
    attempts: 1,
    latencyMs: 1_204,
    timeoutMs: 8_000,
    payloadBytes: 10_436,
  };
}

/**
 * The single-section V1 plan (`summary`), minus the prompt bulk.
 * @param overrides
 */
export function makeSectionPlan(
  overrides: Partial<LlmSectionDefinition> = {},
): LlmSectionDefinition[] {
  return [
    {
      name: 'summary',
      timeoutMs: 8_000,
      required: true,
      prompt: 'You are a museum guide.',
      ...overrides,
    } as LlmSectionDefinition,
  ];
}

export function makeOrchestratorInput(
  overrides: Partial<OrchestratorInput> = {},
): OrchestratorInput {
  return {
    history: [],
    text: 'Parle-moi de la Vénus de Milo.',
    locale: 'fr',
    museumMode: false,
    requestId: 'req-otel-probe-001',
    ...overrides,
  } as OrchestratorInput;
}

interface AssembleOverrides {
  bySection?: Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>;
  input?: OrchestratorInput;
  recentHistory?: ChatMessage[];
  normalizedText?: string;
  startedAt?: number;
}

/**
 * A ready-to-call `assembleResponse` input. Default = the section FAILED (the
 * production symptom: `degraded: true` + canned fallback). Pass
 * `bySection: new Map([['summary', makeSectionRunSuccess()]])` for the healthy
 * path, or an EMPTY map for the `missing_result` branch.
 * @param overrides
 */
export function makeAssembleResponseInput(
  overrides: AssembleOverrides = {},
): AssembleResponseInput {
  return {
    input: overrides.input ?? makeOrchestratorInput(),
    sectionPlan: makeSectionPlan(),
    bySection:
      overrides.bySection ??
      new Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>([
        ['summary', makeSectionRunFailure()],
      ]),
    recentHistory: overrides.recentHistory ?? [],
    normalizedText: overrides.normalizedText ?? 'Parle-moi de la Vénus de Milo.',
    startedAt: overrides.startedAt ?? Date.now() - 2_392,
  };
}
