import { createE2EHarness, type E2EHarness } from 'tests/helpers/e2e/e2e-app-harness';
import { registerAndLogin } from 'tests/helpers/e2e/e2e-auth.helpers';
import { StubLLMOrchestrator } from 'tests/helpers/chaos/stub-llm-orchestrator';

const shouldRunE2E = process.env.RUN_E2E === 'true';
const describeE2E = shouldRunE2E ? describe : describe.skip;

describeE2E('chaos: LLM provider failures', () => {
  jest.setTimeout(180_000);

  let harness: E2EHarness;
  let stub: StubLLMOrchestrator;

  beforeEach(async () => {
    // Stub config: throw on next 3 calls (below default failureThreshold=5).
    stub = new StubLLMOrchestrator({ failuresBeforeFallback: 3, errorKind: 'llm-provider-error' });
    harness = await createE2EHarness({ chatOrchestratorOverride: stub });
  });

  afterEach(async () => {
    await harness?.stop();
  });

  async function startChatSession(token: string): Promise<string> {
    const session = await harness.request(
      '/api/chat/sessions',
      { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
      token,
    );
    expect(session.status).toBe(201);
    return (session.body as { session: { id: string } }).session.id;
  }

  it('chat-message returns 200 with fallback OR 503 when LLM throws (each per single failure)', async () => {
    const { token } = await registerAndLogin(harness);
    const sessionId = await startChatSession(token);

    const res = await harness.request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'tell me about Cézanne',
          context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
        }),
      },
      token,
    );

    // Production behavior: either 200 (fallback) OR 503 (LLM error). Both are valid contracts;
    // assert one of them, not 5xx beyond 503.
    expect([200, 201, 503]).toContain(res.status);
    expect(res.status).not.toBe(500);

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/openai|deepseek|anthropic/i); // no provider name leak
    expect(body).not.toMatch(/api[_-]?key/i);
  });

  it('after threshold (failuresBeforeFallback=3), 4th call returns fallback', async () => {
    // Reset stub for this scenario: only 3 failures, then success
    stub.reset();
    const { token } = await registerAndLogin(harness);
    const sessionId = await startChatSession(token);

    // 3 failing calls
    for (let i = 0; i < 3; i += 1) {
      const r = await harness.request(
        `/api/chat/sessions/${sessionId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: `attempt ${i + 1}`,
            context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
          }),
        },
        token,
      );
      // each may be 503 OR 200-with-fallback depending on production path
      expect([200, 201, 503]).toContain(r.status);
    }
    // 4th call: stub returns fallback text (since failuresBeforeFallback=3)
    const fourth = await harness.request(
      `/api/chat/sessions/${sessionId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          text: 'fourth attempt',
          context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
        }),
      },
      token,
    );
    expect([200, 201]).toContain(fourth.status);
  });

  it('quota-exceeded errors do not crash the server', async () => {
    stub.reset();
    const quotaStub = new StubLLMOrchestrator({
      failuresBeforeFallback: 1,
      errorKind: 'quota-exceeded',
    });
    const quotaHarness = await createE2EHarness({ chatOrchestratorOverride: quotaStub });
    try {
      const { token } = await registerAndLogin(quotaHarness);
      const sessionRes = await quotaHarness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      expect(sessionRes.status).toBe(201);
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      const res = await quotaHarness.request(
        `/api/chat/sessions/${sid}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'quota test',
            context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
          }),
        },
        token,
      );
      expect([200, 201, 429, 503]).toContain(res.status);
      expect(res.status).not.toBe(500);
    } finally {
      await quotaHarness.stop();
    }
  });

  it('timeout errors do not crash the server', async () => {
    const timeoutStub = new StubLLMOrchestrator({
      failuresBeforeFallback: 1,
      errorKind: 'timeout',
    });
    const timeoutHarness = await createE2EHarness({ chatOrchestratorOverride: timeoutStub });
    try {
      const { token } = await registerAndLogin(timeoutHarness);
      const sessionRes = await timeoutHarness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      const res = await timeoutHarness.request(
        `/api/chat/sessions/${sid}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'timeout test',
            context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
          }),
        },
        token,
      );
      expect([200, 201, 503, 504]).toContain(res.status);
      expect(res.status).not.toBe(500);
    } finally {
      await timeoutHarness.stop();
    }
  });

  it('forced fallback text appears in the response when configured', async () => {
    const customText = 'PHASE-6-CHAOS-FALLBACK-MARKER';
    const fbStub = new StubLLMOrchestrator({ forceFallbackText: customText });
    const fbHarness = await createE2EHarness({ chatOrchestratorOverride: fbStub });
    try {
      const { token } = await registerAndLogin(fbHarness);
      const sessionRes = await fbHarness.request(
        '/api/chat/sessions',
        { method: 'POST', body: JSON.stringify({ locale: 'en-US', museumMode: false }) },
        token,
      );
      const sid = (sessionRes.body as { session: { id: string } }).session.id;

      const res = await fbHarness.request(
        `/api/chat/sessions/${sid}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text: 'force fallback',
            context: { museumMode: false, locale: 'en-US', guideLevel: 'beginner' },
          }),
        },
        token,
      );
      expect([200, 201]).toContain(res.status);
      const body = JSON.stringify(res.body);
      expect(body).toContain(customText);
    } finally {
      await fbHarness.stop();
    }
  });
});
