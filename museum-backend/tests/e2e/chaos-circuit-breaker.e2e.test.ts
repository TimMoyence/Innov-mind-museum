import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { LangChainChatOrchestratorDeps } from '@modules/chat/adapters/secondary/langchain-orchestrator-support';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

// Phase 6 chaos: tune the breaker to short windows for fast deterministic tests.
// These env vars are read by LLMCircuitBreaker constructor only when set; default
// behavior (longer windows) is preserved in real deployments.
process.env.LLM_CB_FAILURE_THRESHOLD ??= '3';
process.env.LLM_CB_WINDOW_MS ??= '1000';
process.env.LLM_CB_OPEN_DURATION_MS ??= '500';

/**
 * Build a LangChainChatOrchestrator wired with a fake model that always throws.
 * The real circuit breaker inside the orchestrator trips after LLM_CB_FAILURE_THRESHOLD
 * consecutive failures — this is what the circuit-breaker chaos tests exercise.
 * @param errorMessage
 */
async function buildFailingOrchestrator(
  errorMessage = 'LLM provider 500',
): Promise<ChatOrchestrator> {
  const { LangChainChatOrchestrator } =
    await import('@modules/chat/adapters/secondary/langchain.orchestrator');
  const { LLMCircuitBreaker } =
    await import('@modules/chat/adapters/secondary/llm-circuit-breaker');

  // Fake ChatModel: every invoke/stream call throws to simulate provider down.
  const alwaysFailModel: LangChainChatOrchestratorDeps['model'] = {
    invoke: async () => {
      const err = new Error(errorMessage);
      (err as Error & { statusCode: number }).statusCode = 500;
      throw err;
    },
    stream: async () => {
      const err = new Error(errorMessage);
      (err as Error & { statusCode: number }).statusCode = 500;
      throw err;
    },
  } as unknown as LangChainChatOrchestratorDeps['model'];

  return new LangChainChatOrchestrator({
    model: alwaysFailModel,
    circuitBreaker: new LLMCircuitBreaker(),
  });
}

describeE2E('chaos: circuit breaker CLOSED→OPEN→HALF_OPEN', () => {
  jest.setTimeout(180_000);

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
    const orchestrator = await buildFailingOrchestrator();
    const harness = await createE2EHarness({ chatOrchestratorOverride: orchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      // 3 failing calls — each one increments the breaker's failure count.
      // Per the orchestrator contract (resolveSummary fallback + unit tests),
      // a section-level LLM error degrades gracefully to a synthetic fallback
      // 201, so we accept either 200/201 (degraded fallback) or 503 (breaker
      // already OPEN at entry). Bubbling 5xx for individual failures is
      // explicitly NOT the contract — see langchain-orchestrator unit tests.
      for (let i = 0; i < 3; i += 1) {
        const r = await chatOnce(harness, token, sid, `fail-${i}`);
        expect([200, 201, 503]).toContain(r.status);
      }

      // 4th call: breaker OPEN — should return 503 with CIRCUIT_BREAKER_OPEN code
      const fourth = await chatOnce(harness, token, sid, 'after-threshold');
      expect(fourth.status).toBe(503);
      const fourthBody = JSON.stringify(fourth.body);
      expect(fourthBody).toMatch(/CIRCUIT_BREAKER_OPEN|circuit/i);
    } finally {
      await harness.stop();
    }
  });

  it.skip('after openDurationMs, breaker → HALF_OPEN; success closes it', async () => {
    // @TODO Phase 6 follow-up: harness stub-swap
    // LangChainChatOrchestrator holds the failing model by reference; we cannot swap
    // the model mid-run to a success model without a dedicated reset/inject mechanism.
    // Skipping until the orchestrator gains a setModel() or the harness gains a
    // reset-orchestrator option.
  });

  it('repeated failure cycles: breaker re-opens after each round', async () => {
    const orchestrator = await buildFailingOrchestrator();
    const harness = await createE2EHarness({ chatOrchestratorOverride: orchestrator });
    try {
      const { token } = await registerAndLogin(harness);
      const sessionRes = await harness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      // Round 1: trip breaker
      for (let i = 0; i < 3; i += 1) await chatOnce(harness, token, sid, `r1-${i}`);
      const r1Open = await chatOnce(harness, token, sid, 'r1-check');
      expect(r1Open.status).toBe(503);

      // Wait for cooldown
      const openDuration = Number(process.env.LLM_CB_OPEN_DURATION_MS ?? 500);
      await new Promise((r) => setTimeout(r, openDuration + 100));

      // Round 2: HALF_OPEN attempt fails (model still failing) → re-OPEN.
      // Either the section degrades to fallback 201 or the breaker has already
      // reopened from the HALF_OPEN single-failure rule and returns 503.
      const r2Half = await chatOnce(harness, token, sid, 'r2-half');
      expect([200, 201, 503]).toContain(r2Half.status);
      // Breaker should be OPEN again
      const r2Check = await chatOnce(harness, token, sid, 'r2-check');
      expect(r2Check.status).toBe(503);
    } finally {
      await harness.stop();
    }
  });

  it('breaker does NOT trip on a single isolated failure within window', async () => {
    let callCount = 0;
    // Model: throws once, then succeeds
    const { LangChainChatOrchestrator } =
      await import('@modules/chat/adapters/secondary/langchain.orchestrator');
    const { LLMCircuitBreaker } =
      await import('@modules/chat/adapters/secondary/llm-circuit-breaker');
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
      // Single failure degrades to fallback 201 (per the section-runner
      // contract); 503 is also acceptable if the orchestrator surfaces it.
      expect([200, 201, 503]).toContain(fail1.status);

      // Subsequent calls succeed; breaker should NOT have opened (1 < 3 failureThreshold)
      const success = await chatOnce(harness, token, sid, 'success-after-isolated-fail');
      expect([200, 201]).toContain(success.status);
    } finally {
      await harness.stop();
    }
  });

  it('CIRCUIT_BREAKER_OPEN response code is 503 (banking-grade — correct status code)', async () => {
    const orchestrator = await buildFailingOrchestrator();
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
      expect(blocked.status).toBe(503); // not 500, not 502, exactly 503
    } finally {
      await harness.stop();
    }
  });

  it('breaker open response body includes a structured error code, not a stack trace', async () => {
    const orchestrator = await buildFailingOrchestrator();
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
      expect(body).not.toMatch(/at .* \(.*:\d+:\d+\)/); // no JS stack trace
      expect(body).toMatch(/code|error/i);
    } finally {
      await harness.stop();
    }
  });
});
