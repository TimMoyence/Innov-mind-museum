/**
 * Guard test: ChatSession optimistic-lock policy.
 *
 * Asserts that commitAssistantResponse surfaces a 409 WITHOUT auto-retrying
 * when TypeORM throws OptimisticLockVersionMismatchError.
 *
 * The LLM call already ran against an old session snapshot — retrying
 * persistMessage would commit a reply that disagrees with the refreshed
 * session state. The 409 forces the client to re-prompt instead.
 */

import { commitAssistantResponse } from '@modules/chat/useCase/message-commit';
import type { OrchestratorOutput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail-evaluation.service';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeSession } from '../../helpers/chat/message.fixtures';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeGuardrail(): GuardrailEvaluationService {
  return {
    evaluateOutput: jest.fn().mockResolvedValue({
      text: 'response text',
      metadata: {},
      allowed: true,
    }),
  } as unknown as GuardrailEvaluationService;
}

function makeOptimisticLockError(): Error {
  return Object.assign(new Error('Row version mismatch'), {
    name: 'OptimisticLockVersionMismatchError',
  });
}

const baseAiResult: OrchestratorOutput = {
  text: 'The artwork is by Monet.',
  metadata: {},
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('commitAssistantResponse — version conflict policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('surfaces a 409 on OptimisticLockVersionMismatchError', async () => {
    const session = makeSession();
    const persistMessage = jest.fn().mockRejectedValue(makeOptimisticLockError());
    const repository = makeChatRepo({ persistMessage });

    await expect(
      commitAssistantResponse(
        { guardrail: makeGuardrail(), repository },
        session.id,
        session,
        baseAiResult,
        { requestedLocale: 'fr', ownerId: 1 },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/concurrently/i),
    });
  });

  it('does NOT auto-retry — persistMessage called exactly once', async () => {
    const session = makeSession();
    const persistMessage = jest.fn().mockRejectedValue(makeOptimisticLockError());
    const repository = makeChatRepo({ persistMessage });

    await expect(
      commitAssistantResponse(
        { guardrail: makeGuardrail(), repository },
        session.id,
        session,
        baseAiResult,
        { requestedLocale: 'fr', ownerId: 1 },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(persistMessage).toHaveBeenCalledTimes(1);
  });

  it('re-throws unrelated errors as-is', async () => {
    const session = makeSession();
    const dbError = new Error('Connection reset');
    const persistMessage = jest.fn().mockRejectedValue(dbError);
    const repository = makeChatRepo({ persistMessage });

    await expect(
      commitAssistantResponse(
        { guardrail: makeGuardrail(), repository },
        session.id,
        session,
        baseAiResult,
        { requestedLocale: 'fr', ownerId: 1 },
      ),
    ).rejects.toThrow('Connection reset');
  });
});
