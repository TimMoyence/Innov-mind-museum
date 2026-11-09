import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { LangChainChatOrchestratorDeps } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

process.env.LLM_CB_FAILURE_THRESHOLD ??= '3';
process.env.LLM_CB_WINDOW_MS ??= '1000';
process.env.LLM_CB_OPEN_DURATION_MS ??= '500';

async function buildFailingOrchestrator(errorMessage = 'LLM provider 500'): Promise<{
  orchestrator: ChatOrchestrator;
  breaker: import('@modules/chat/adapters/secondary/llm/llm-circuit-breaker').LLMCircuitBreaker;
}> {
  const { LangChainChatOrchestrator } =
    await import('@modules/chat/adapters/secondary/llm/langchain.orchestrator');
  const { LLMCircuitBreaker } =
    await import('@modules/chat/adapters/secondary/llm/llm-circuit-breaker');

  const makeError = () => {
    const err = new Error(errorMessage);
    (err as Error & { statusCode: number }).statusCode = 500;
    return err;
  };
  const alwaysFailModel: LangChainChatOrchestratorDeps['model'] = {
    invoke: async () => {
      throw makeError();
    },
    stream: async () => {
      throw makeError();
    },
    withStructuredOutput: () => ({
      invoke: async () => {
        throw makeError();
      },
    }),
  } as unknown as LangChainChatOrchestratorDeps['model'];

  const breaker = new LLMCircuitBreaker();
  return {
    orchestrator: new LangChainChatOrchestrator({
      model: alwaysFailModel,
      circuitBreaker: breaker,
    }),
    breaker,
  };
}

describeE2E('chaos: circuit breaker CLOSED→OPEN→HALF_OPEN', () => {
  async function chatOnce(harness: E2EHarness, token: string, sessionId: string, text: string) {
    return harness.request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text,
          context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
        }),
      },
      token,
    );
  }

  it('3 consecutive failures → breaker OPEN; 4th call returns 503 immediately', async () => {
    const { orchestrator } = await buildFailingOrchestrator();
    const harness = await createE2EHarness({ chatOrchestratorOverride: orchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      for (let i = 0; i < 3; i += 1) {
        const r = await chatOnce(harness, token, sid, `fail-${i}`);
        expect([200, 201, 503]).toContain(r.status);
      }

      const fourth = await chatOnce(harness, token, sid, 'after-threshold');
      expect(fourth.status).toBe(503);
      const fourthBody = JSON.stringify(fourth.body);
      expect(fourthBody).toMatch(/CIRCUIT_BREAKER_OPEN|circuit/i);
    } finally {
      await harness.stop();
    }
  });

  it('after openDurationMs, breaker → HALF_OPEN; success closes it', async () => {
    const { orchestrator: failingOrchestrator, breaker } = await buildFailingOrchestrator();
    const harness = await createE2EHarness({ chatOrchestratorOverride: failingOrchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      for (let i = 0; i < 3; i += 1) await chatOnce(harness, token, sid, `trip-${i}`);
      const blocked = await chatOnce(harness, token, sid, 'check-open');
      expect(blocked.status).toBe(503);
      expect(breaker.getState().state).toBe('OPEN');

      const { LangChainChatOrchestrator } =
        await import('@modules/chat/adapters/secondary/llm/langchain.orchestrator');
      const successModel = {
        invoke: async () => ({ content: 'recovered response' }),
        stream: async function* () {
          yield { content: 'recovered stream' };
        },
        withStructuredOutput: () => ({
          invoke: async () => ({
            text: 'recovered response',
            deeperContext: null,
            openQuestion: null,
            imageDescription: null,
            suggestedImages: null,
            detectedArtwork: null,
            recommendations: null,
            expertiseSignal: null,
            citations: null,
            sources: null,
          }),
        }),
      };
      const successOrchestrator = new LangChainChatOrchestrator({
        model: successModel as unknown as LangChainChatOrchestratorDeps['model'],
        circuitBreaker: breaker,
      });

      const openDuration = Number(process.env.LLM_CB_OPEN_DURATION_MS ?? 500);
      await new Promise((r) => setTimeout(r, openDuration + 100));

      harness.orchestratorReset(successOrchestrator);

      const recovered = await chatOnce(harness, token, sid, 'after-recovery');
      expect([200, 201]).toContain(recovered.status);
      expect(breaker.getState().state).toBe('CLOSED');

      const stillClosed = await chatOnce(harness, token, sid, 'confirm-closed');
      expect([200, 201]).toContain(stillClosed.status);
      expect(breaker.getState().state).toBe('CLOSED');
    } finally {
      await harness.stop();
    }
  });

  it('repeated failure cycles: breaker re-opens after each round', async () => {
    const { orchestrator } = await buildFailingOrchestrator();
    const harness = await createE2EHarness({ chatOrchestratorOverride: orchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      for (let i = 0; i < 3; i += 1) await chatOnce(harness, token, sid, `r1-${i}`);
      const r1Open = await chatOnce(harness, token, sid, 'r1-check');
      expect(r1Open.status).toBe(503);

      const openDuration = Number(process.env.LLM_CB_OPEN_DURATION_MS ?? 500);
      await new Promise((r) => setTimeout(r, openDuration + 100));

      const r2Half = await chatOnce(harness, token, sid, 'r2-half');
      expect([200, 201, 503]).toContain(r2Half.status);
      const r2Check = await chatOnce(harness, token, sid, 'r2-check');
      expect(r2Check.status).toBe(503);
    } finally {
      await harness.stop();
    }
  });

  it('breaker does NOT trip on a single isolated failure within window', async () => {
    let callCount = 0;
    const { LangChainChatOrchestrator } =
      await import('@modules/chat/adapters/secondary/llm/langchain.orchestrator');
    const { LLMCircuitBreaker } =
      await import('@modules/chat/adapters/secondary/llm/llm-circuit-breaker');
    const onceFailModel = {
      invoke: async () => {
        callCount += 1;
        if (callCount <= 1) {
          const err = new Error('LLM provider 500');
          (err as Error & { statusCode: number }).statusCode = 500;
          throw err;
        }
        return { content: 'recovered response after single failure' };
      },
      stream: async function* () {
        yield { content: 'recovered stream' };
      },
    };

    const orchestrator = new LangChainChatOrchestrator({
      model: onceFailModel as unknown as LangChainChatOrchestratorDeps['model'],
      circuitBreaker: new LLMCircuitBreaker(),
    });
    const harness = await createE2EHarness({ chatOrchestratorOverride: orchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      const fail1 = await chatOnce(harness, token, sid, 'fail-1');
      expect([200, 201, 503]).toContain(fail1.status);

      const success = await chatOnce(harness, token, sid, 'success-after-isolated-fail');
      expect([200, 201]).toContain(success.status);
    } finally {
      await harness.stop();
    }
  });

  it('CIRCUIT_BREAKER_OPEN response code is 503 (banking-grade — correct status code)', async () => {
    const { orchestrator } = await buildFailingOrchestrator();
    const harness = await createE2EHarness({ chatOrchestratorOverride: orchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      for (let i = 0; i < 3; i += 1) await chatOnce(harness, token, sid, `trip-${i}`);
      const blocked = await chatOnce(harness, token, sid, 'blocked');
      expect(blocked.status).toBe(503);
    } finally {
      await harness.stop();
    }
  });

  it('breaker open response body includes a structured error code, not a stack trace', async () => {
    const { orchestrator } = await buildFailingOrchestrator();
    const harness = await createE2EHarness({ chatOrchestratorOverride: orchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      for (let i = 0; i < 3; i += 1) await chatOnce(harness, token, sid, `t-${i}`);
      const blocked = await chatOnce(harness, token, sid, 'blocked');
      const body = JSON.stringify(blocked.body);
      expect(body).not.toMatch(/at .* \(.*:\d+:\d+\)/);
      expect(body).toMatch(/code|error/i);
    } finally {
      await harness.stop();
    }
  });
});
