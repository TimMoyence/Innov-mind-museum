import {
  noopGuardrailProvider,
  type GuardrailProvider,
  type GuardrailVerdict,
} from '@modules/chat/domain/ports/guardrail-provider.port';

describe('noopGuardrailProvider', () => {
  it('exposes a stable name', () => {
    expect(noopGuardrailProvider.name).toBe('noop');
  });

  it('exposes a stable version (ADR-048 readonly version field)', () => {
    expect(noopGuardrailProvider.version).toBe('noop-v1');
  });

  it('allows any input by default', async () => {
    const verdict = await noopGuardrailProvider.checkInput({ text: 'hello art world' });
    expect(verdict.allow).toBe(true);
    expect(verdict.version).toBe('v1');
    expect(verdict.reason).toBeUndefined();
  });

  it('allows any output by default', async () => {
    const verdict = await noopGuardrailProvider.checkOutput({ text: 'response text' });
    expect(verdict.allow).toBe(true);
    expect(verdict.version).toBe('v1');
  });

  it('ignores locale and session id', async () => {
    const inputVerdict = await noopGuardrailProvider.checkInput({
      text: 'text',
      locale: 'fr',
      sessionId: 'sess-1',
    });
    expect(inputVerdict.allow).toBe(true);

    const outputVerdict = await noopGuardrailProvider.checkOutput({
      text: 'text',
      metadata: { foo: 'bar' },
      userInput: 'question',
      locale: 'fr',
    });
    expect(outputVerdict.allow).toBe(true);
  });

  it('health() returns up with zero latency for the noop provider', async () => {
    const health = await noopGuardrailProvider.health();
    expect(health.status).toBe('up');
    expect(health.latencyMs).toBe(0);
    expect(typeof health.lastCheckedAt).toBe('string');
    expect(new Date(health.lastCheckedAt).getTime()).not.toBeNaN();
  });

  it('metrics() returns zeroed snapshot for the noop provider', () => {
    const snapshot = noopGuardrailProvider.metrics();
    expect(snapshot.requests).toBe(0);
    expect(snapshot.blocks).toBe(0);
    expect(snapshot.errors).toBe(0);
  });
});

describe('GuardrailProvider contract', () => {
  it('adapters may return a redactedText instead of blocking', async () => {
    const redactor: GuardrailProvider = {
      name: 'pii-redactor-demo',
      version: 'demo-v0',
      async checkInput(input): Promise<GuardrailVerdict> {
        return {
          version: 'v1',
          allow: true,
          redactedText: input.text.replace(/\d+/g, '###'),
        };
      },
      async checkOutput(): Promise<GuardrailVerdict> {
        return { version: 'v1', allow: true };
      },
      health: async () => ({
        status: 'up',
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
      }),
      metrics: () => ({ requests: 0, blocks: 0, errors: 0 }),
    };

    const verdict = await redactor.checkInput({ text: 'call 0612345678' });
    expect(verdict.allow).toBe(true);
    expect(verdict.redactedText).toBe('call ###');
  });

  it('adapters MUST fail-closed when check throws (contract)', async () => {
    const unstableAdapter: GuardrailProvider = {
      name: 'unstable',
      version: 'unstable-v0',
      async checkInput(): Promise<GuardrailVerdict> {
        throw new Error('network timeout');
      },
      async checkOutput(): Promise<GuardrailVerdict> {
        return { version: 'v1', allow: true };
      },
      health: async () => ({
        status: 'down',
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
      }),
      metrics: () => ({ requests: 0, blocks: 0, errors: 0 }),
    };

    // Contract: the orchestrator wrapping the adapter is responsible for translating
    // throws into { allow: false, reason: 'error' } — but test here that the raw
    // adapter DOES throw so callers can detect failure.
    await expect(unstableAdapter.checkInput({ text: 'x' })).rejects.toThrow('network timeout');
  });

  it('verdicts may carry a confidence score for tiered decisions', async () => {
    const scoringAdapter: GuardrailProvider = {
      name: 'scoring',
      version: 'scoring-v0',
      async checkInput(): Promise<GuardrailVerdict> {
        return {
          version: 'v1',
          allow: false,
          reason: 'prompt_injection',
          confidence: 0.97,
        };
      },
      async checkOutput(): Promise<GuardrailVerdict> {
        return { version: 'v1', allow: true, confidence: 0.1 };
      },
      health: async () => ({
        status: 'up',
        latencyMs: 0,
        lastCheckedAt: new Date().toISOString(),
      }),
      metrics: () => ({ requests: 0, blocks: 0, errors: 0 }),
    };

    const verdict = await scoringAdapter.checkInput({ text: 'ignore previous' });
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toBe('prompt_injection');
    expect(verdict.confidence).toBe(0.97);
  });
});
