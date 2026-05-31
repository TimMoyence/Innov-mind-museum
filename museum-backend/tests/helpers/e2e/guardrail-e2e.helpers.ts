import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';

import { makeFakeChatModel } from 'tests/helpers/chat/fake-chat-model.fixtures';
import { createE2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import type { FakeChatModelHandle } from 'tests/helpers/chat/fake-chat-model.fixtures';
import type { E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type { AuditService } from '@shared/audit/audit.service';

/**
 * RUN_ID 2026-05-31-e2e-guardrail-blindspot — GREEN helper for the chat
 * guardrail-chain e2e suite.
 *
 * Boots the standard {@link createE2EHarness} but swaps the synthetic stub
 * orchestrator for a REAL {@link LangChainChatOrchestrator} driven by a fake
 * {@link makeFakeChatModel}. This exercises the genuine chat pipeline
 * (V1 keyword guardrail → optional V2 provider → prompt isolation →
 * structured-output section invoke → output guardrail scrub) end-to-end while
 * keeping the model deterministic and offline.
 *
 * The fake model captures the `BaseMessage[]` array passed to
 * `withStructuredOutput(...).invoke()` (prompt-isolation assertion, R4) and
 * counts invocations (R2/R3/R5/R6 reach-or-not assertions). The harness exposes
 * that handle as `fakeModel` so the frozen e2e test can read `invokeCount` +
 * `capturedMessages` directly.
 *
 * Tests-only helper — lives under `tests/helpers/` per docs/TEST_FACTORIES.md.
 */

/** Per-suite configuration of the fake model's deterministic response text. */
export interface GuardrailModelConfig {
  /** The `text` field of the parsed MainAssistantOutput the fake model returns. */
  text: string;
}

export interface CreateGuardrailE2EHarnessOptions {
  /** Deterministic fake-model response config. */
  modelConfig: GuardrailModelConfig;
  /**
   * Optional V2 `GuardrailProvider` injected into ChatService — use
   * `makeFakeGuardrailProvider({ block: true })` to exercise the provider-deny
   * path (Case D). Defaults to undefined (no provider wired).
   */
  guardrailProvider?: GuardrailProvider;
  /** Optional `AuditService` injected into ChatService. */
  auditService?: AuditService;
}

/**
 * Extends the base {@link E2EHarness} with a live view of the injected fake
 * chat model (`invokeCount` + `capturedMessages` are mutated on each invoke).
 */
export interface GuardrailE2EHarness extends E2EHarness {
  fakeModel: FakeChatModelHandle;
}

/**
 * Builds a {@link GuardrailE2EHarness}: a full Postgres-backed Express app whose
 * ChatService runs the REAL {@link LangChainChatOrchestrator} over a fake model.
 * @param options Fake-model config + optional V2 provider / audit overrides.
 */
export async function createGuardrailE2EHarness(
  options: CreateGuardrailE2EHarnessOptions,
): Promise<GuardrailE2EHarness> {
  const fakeModel = makeFakeChatModel({ text: options.modelConfig.text });

  // Real orchestrator, deterministic fake model. `model: handle.model` opts out
  // of the live provider construction in `toModel()` (deps.model !== undefined).
  const orchestrator = new LangChainChatOrchestrator({ model: fakeModel.model });

  const harness = await createE2EHarness({
    chatOrchestratorOverride: orchestrator,
    guardrailProviderOverride: options.guardrailProvider,
    auditServiceOverride: options.auditService,
  });

  return {
    ...harness,
    fakeModel,
  };
}
