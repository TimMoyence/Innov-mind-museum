import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';

import { makeFakeChatModel } from 'tests/helpers/chat/fake-chat-model.fixtures';
import { createE2EHarness } from 'tests/helpers/e2e/e2e-app-harness';

import type { FakeChatModelHandle } from 'tests/helpers/chat/fake-chat-model.fixtures';
import type { E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import type { AuditService } from '@shared/audit/audit.service';

export interface GuardrailModelConfig {
  text: string;
}

export interface CreateGuardrailE2EHarnessOptions {
  modelConfig: GuardrailModelConfig;
  auditService?: AuditService;
}

export interface GuardrailE2EHarness extends E2EHarness {
  fakeModel: FakeChatModelHandle;
}

export async function createGuardrailE2EHarness(
  options: CreateGuardrailE2EHarnessOptions,
): Promise<GuardrailE2EHarness> {
  const fakeModel = makeFakeChatModel({ text: options.modelConfig.text });

  const orchestrator = new LangChainChatOrchestrator({ model: fakeModel.model });

  const harness = await createE2EHarness({
    chatOrchestratorOverride: orchestrator,
    auditServiceOverride: options.auditService,
  });

  return {
    ...harness,
    fakeModel,
  };
}
