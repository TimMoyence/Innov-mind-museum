import {
  noopAdvancedGuardrail,
  type AdvancedGuardrail,
  type AdvancedGuardrailDecision,
} from '@modules/chat/domain/ports/advanced-guardrail.port';

describe('noopAdvancedGuardrail', () => {
  it('exposes a stable name', () => {
    expect(noopAdvancedGuardrail.name).toBe('noop');
  });

  it('allows any input by default', async () => {
    const decision = await noopAdvancedGuardrail.checkInput({ text: 'hello art world' });
    expect(decision.allow).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  it('allows any output by default', async () => {
    const decision = await noopAdvancedGuardrail.checkOutput({ text: 'response text' });
    expect(decision.allow).toBe(true);
  });

  it('ignores locale and session id', async () => {
    const inputDecision = await noopAdvancedGuardrail.checkInput({
      text: 'text',
      locale: 'fr',
      sessionId: 'sess-1',
    });
    expect(inputDecision.allow).toBe(true);

    const outputDecision = await noopAdvancedGuardrail.checkOutput({
      text: 'text',
      metadata: { foo: 'bar' },
      userInput: 'question',
      locale: 'fr',
    });
    expect(outputDecision.allow).toBe(true);
  });
});

describe('AdvancedGuardrail contract', () => {
  it('adapters may return a redactedText instead of blocking', async () => {
    const redactor: AdvancedGuardrail = {
      name: 'pii-redactor-demo',
      async checkInput(input): Promise<AdvancedGuardrailDecision> {
        return { allow: true, redactedText: input.text.replace(/\d+/g, '###') };
      },

      async checkOutput(): Promise<AdvancedGuardrailDecision> {
        return { allow: true };
      },
    };

    const decision = await redactor.checkInput({ text: 'call 0612345678' });
    expect(decision.allow).toBe(true);
    expect(decision.redactedText).toBe('call ###');
  });

  it('adapters MUST fail-closed when check throws (contract)', async () => {
    const unstableAdapter: AdvancedGuardrail = {
      name: 'unstable',
      async checkInput(): Promise<AdvancedGuardrailDecision> {
        throw new Error('network timeout');
      },

      async checkOutput(): Promise<AdvancedGuardrailDecision> {
        return { allow: true };
      },
    };

    // Contract: the orchestrator wrapping the adapter is responsible for translating
    // throws into { allow: false, reason: 'error' } — but test here that the raw
    // adapter DOES throw so callers can detect failure.
    await expect(unstableAdapter.checkInput({ text: 'x' })).rejects.toThrow('network timeout');
  });

  it('decisions may carry a confidence score for tiered decisions', async () => {
    const scoringAdapter: AdvancedGuardrail = {
      name: 'scoring',

      async checkInput(): Promise<AdvancedGuardrailDecision> {
        return { allow: false, reason: 'prompt_injection', confidence: 0.97 };
      },

      async checkOutput(): Promise<AdvancedGuardrailDecision> {
        return { allow: true, confidence: 0.1 };
      },
    };

    const decision = await scoringAdapter.checkInput({ text: 'ignore previous' });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe('prompt_injection');
    expect(decision.confidence).toBe(0.97);
  });
});
