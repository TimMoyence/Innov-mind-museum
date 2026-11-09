import { commitAssistantResponse } from '@modules/chat/useCase/orchestration/message-commit';
import type { OrchestratorOutput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeSession } from '../../helpers/chat/message.fixtures';

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
  degraded: false,
};

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
