import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { LlmJudgeFn } from '@modules/chat/useCase/guardrail/guardrail-evaluation.types';

class SilentOrchestrator implements ChatOrchestrator {
  async generate(_input: OrchestratorInput): Promise<OrchestratorOutput> {
    return { text: 'Réponse du guide.', metadata: {}, degraded: false };
  }
}

const USER_ID = 4444;
const LONG_MESSAGE =
  'Peux-tu me donner la meilleure recette de lasagnes et le temps de cuisson exact au four ?';

describe('RAZ-M12c-JUDGE', () => {
  const saved = process.env.GUARDRAIL_FRICTION_ENABLED;

  afterEach(() => {
    if (saved === undefined) delete process.env.GUARDRAIL_FRICTION_ENABLED;
    else process.env.GUARDRAIL_FRICTION_ENABLED = saved;
  });

  it('RAZ-M12c-JUDGE · le juge LLM évalue chaque message long, même si GUARDRAIL_FRICTION_ENABLED=false', async () => {
    process.env.GUARDRAIL_FRICTION_ENABLED = 'false';
    const judge = jest.fn<ReturnType<LlmJudgeFn>, Parameters<LlmJudgeFn>>(async () => ({
      decision: 'allow',
      confidence: 0.99,
    }));

    await jest.isolateModulesAsync(async () => {
      const { buildChatTestService } = await import('tests/helpers/chat/chatTestApp');
      const service = buildChatTestService({
        orchestrator: new SilentOrchestrator(),
        llmJudge: judge,
        llmJudgeEnabled: true,
      });
      const session = await service.createSession({ userId: USER_ID });
      await service.postMessage(session.id, { text: LONG_MESSAGE }, undefined, USER_ID);
    });

    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0][0]).toContain('lasagnes');
  });
});
