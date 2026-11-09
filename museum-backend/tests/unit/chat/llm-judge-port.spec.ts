import { z } from 'zod';

import { resetBudget } from '@modules/chat/useCase/guardrail/guardrail-budget';
import { LlmJudgeGuardrail, judgeWithLlm } from '@modules/chat/useCase/llm/llm-judge-guardrail';

import type { LlmJudgePort, LlmJudgeResult } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { ChatModel } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';

interface FakeModelBehaviour {
  text?: string;
  shouldThrow?: boolean;
  delayMs?: number;
}

const buildModel = (behaviour: FakeModelBehaviour): ChatModel => {
  return {
    async invoke() {
      throw new Error('plain invoke should not be reached in detached judge path');
    },
    async stream() {
      throw new Error('stream should not be reached in detached judge path');
    },
    withStructuredOutput<T>(schema: z.ZodType<T>) {
      return {
        async invoke(_messages: unknown, opts?: { signal?: AbortSignal }): Promise<T> {
          if (behaviour.shouldThrow) throw new Error('llm-down');
          if (behaviour.delayMs) {
            await new Promise<void>((resolve, reject) => {
              const t = setTimeout(resolve, behaviour.delayMs);
              opts?.signal?.addEventListener('abort', () => {
                clearTimeout(t);
                reject(new DOMException('aborted', 'TimeoutError'));
              });
            });
          }
          const raw = behaviour.text ?? '{"decision":"allow","confidence":0.9}';
          const parsed: unknown = JSON.parse(raw);
          const result = schema.safeParse(parsed);
          if (!result.success) throw new Error('structured-output schema violation');
          return result.data;
        },
      };
    },
  };
};

describe('LlmJudgePort (T3.1.5)', () => {
  beforeEach(async () => {
    await resetBudget();
  });

  it('LlmJudgeGuardrail satisfies the LlmJudgePort interface', () => {
    const model = buildModel({});
    const guardrail = new LlmJudgeGuardrail({ model });

    const port: LlmJudgePort = guardrail;

    expect(typeof port.evaluate).toBe('function');
  });

  it('evaluate(prompt) returns an LlmJudgeResult with allow on safe verdict', async () => {
    const model = buildModel({
      text: '{"decision":"allow","confidence":0.92}',
    });
    const guardrail = new LlmJudgeGuardrail({ model });

    const result: LlmJudgeResult = await guardrail.evaluate('safe message');

    expect(result.decision).toBe('allow');
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it('evaluate(prompt) maps block:* verdicts to decision=block', async () => {
    const model = buildModel({
      text: '{"decision":"block:abuse","confidence":0.88}',
    });
    const guardrail = new LlmJudgeGuardrail({ model });

    const result = await guardrail.evaluate('abusive');

    expect(result.decision).toBe('block');
    expect(result.confidence).toBeCloseTo(0.88);
    expect(result.reason).toBe('block:abuse');
  });

  it('evaluate(prompt) returns review with confidence=0 when the underlying judge fails-open', async () => {
    const model = buildModel({ shouldThrow: true });
    const guardrail = new LlmJudgeGuardrail({ model });

    const result = await guardrail.evaluate('anything');

    expect(result.decision).toBe('review');
    expect(result.confidence).toBe(0);
  });

  it('evaluate honors AbortSignal by short-circuiting to review', async () => {
    const model = buildModel({ delayMs: 200 });
    const guardrail = new LlmJudgeGuardrail({ model });
    const controller = new AbortController();
    controller.abort();

    const result = await guardrail.evaluate('msg', controller.signal);

    expect(result.decision).toBe('review');
  });

  it('evaluate returns review when no model is configured (lab fallback)', async () => {
    const guardrail = new LlmJudgeGuardrail({ model: null });

    const result = await guardrail.evaluate('msg');

    expect(result.decision).toBe('review');
    expect(result.confidence).toBe(0);
  });

  it('preserves the existing judgeWithLlm function export (backward compat)', async () => {
    const model = buildModel({
      text: '{"decision":"allow","confidence":0.8}',
    });

    const decision = await judgeWithLlm('hi', { model });

    expect(decision?.decision).toBe('allow');
    expect(decision?.confidence).toBeCloseTo(0.8);
  });
});
