/**
 * C9.7 (2026-05-18) — Detached LLM-judge tests.
 *
 * Assert that `judgeWithLlm` calls `model.withStructuredOutput(...).invoke(...)`
 * DIRECTLY without going through the full chat orchestrator. The previous F4
 * implementation (`orchestrator.generate({ history: [], text, museumMode: false })`)
 * paid ~50–100 ms of pipeline overhead per call (sections, semaphore, breaker,
 * Langfuse, Sentry, recordSectionCost). The detached path bypasses all of it.
 *
 * Invariants preserved from `llm-judge-guardrail.test.ts`:
 *  - Fail-OPEN on timeout / error / schema-violation / budget exhausted.
 *  - Budget guard called BEFORE model invocation (anti-spam).
 *  - JUDGE_SYSTEM_PROMPT not mutated.
 *  - `[END OF SYSTEM INSTRUCTIONS]` boundary marker present in system message.
 */
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { resetBudget, recordJudgeCost } from '@modules/chat/useCase/guardrail/guardrail-budget';
import { JUDGE_SYSTEM_PROMPT, judgeWithLlm } from '@modules/chat/useCase/llm/llm-judge-guardrail';

import type { ChatModel } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';

interface FakeModelBehaviour {
  /** Object the structured invoke will resolve with (must satisfy schema). */
  resolveWith?: { decision: string; confidence: number };
  /** Resolve after this delay (ms). Use w/ a short `timeoutMs` to trigger AbortSignal.timeout. */
  delayMs?: number;
  /** Throw on invoke. */
  shouldThrow?: boolean;
  /** Omit `withStructuredOutput` entirely (legacy / test fake / older provider). */
  noStructuredOutput?: boolean;
}

interface FakeModel extends ChatModel {
  invokeSpy: jest.Mock;
  withStructuredOutputSpy?: jest.Mock;
}

const SAFE_USER_TEXT = "Could you walk me through the symbolism in Boticelli's Birth of Venus?";

const buildModel = (behaviour: FakeModelBehaviour = {}): FakeModel => {
  const invokeSpy = jest.fn(
    async (_messages: unknown, opts?: { signal?: AbortSignal }): Promise<unknown> => {
      if (behaviour.shouldThrow) {
        throw new Error('structured-output validation failed');
      }
      if (behaviour.delayMs) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, behaviour.delayMs);
          opts?.signal?.addEventListener('abort', () => {
            clearTimeout(t);
            const err = new DOMException('aborted', 'TimeoutError');
            reject(err);
          });
        });
      }
      return behaviour.resolveWith ?? { decision: 'allow', confidence: 0.9 };
    },
  );

  const withStructuredOutputSpy = behaviour.noStructuredOutput
    ? undefined
    : jest.fn(() => ({ invoke: invokeSpy }));

  const model: FakeModel = {
    async invoke() {
      throw new Error('plain invoke should not be called in detached judge path');
    },
    async stream() {
      throw new Error('stream should not be called in detached judge path');
    },
    invokeSpy,
    withStructuredOutputSpy,
  };
  if (withStructuredOutputSpy) {
    model.withStructuredOutput =
      withStructuredOutputSpy as unknown as ChatModel['withStructuredOutput'];
  }
  return model;
};

describe('judgeWithLlm — detached path (C9.7)', () => {
  beforeEach(async () => {
    await resetBudget();
  });

  describe('R1 — calls withStructuredOutput directly', () => {
    it('invokes model.withStructuredOutput exactly once per judge call', async () => {
      const model = buildModel({ resolveWith: { decision: 'allow', confidence: 0.91 } });

      const decision = await judgeWithLlm(SAFE_USER_TEXT, { model });

      expect(decision).not.toBeNull();
      expect(decision?.decision).toBe('allow');
      expect(model.withStructuredOutputSpy).toHaveBeenCalledTimes(1);
      expect(model.invokeSpy).toHaveBeenCalledTimes(1);
    });

    it('passes a Zod schema and the JudgeDecision name to withStructuredOutput', async () => {
      const model = buildModel();

      await judgeWithLlm(SAFE_USER_TEXT, { model });

      const [schemaArg, optsArg] = model.withStructuredOutputSpy!.mock.calls[0];
      // Zod schema is identified by `_def` (Zod v3) / `_zod` (Zod v4 internals).
      // We accept either: the schema must have a `parse` callable AND a `safeParse` callable.
      expect(schemaArg).toBeDefined();
      expect(typeof (schemaArg as z.ZodTypeAny).parse).toBe('function');
      expect(typeof (schemaArg as z.ZodTypeAny).safeParse).toBe('function');
      expect(optsArg).toEqual({ name: 'JudgeDecision' });
    });

    it('passes [SystemMessage(JUDGE_SYSTEM_PROMPT), HumanMessage(user)] to invoke', async () => {
      const model = buildModel();

      await judgeWithLlm(SAFE_USER_TEXT, { model });

      const [messagesArg] = model.invokeSpy.mock.calls[0];
      const messages = messagesArg as unknown[];
      expect(messages).toHaveLength(2);
      expect(messages[0]).toBeInstanceOf(SystemMessage);
      expect(messages[1]).toBeInstanceOf(HumanMessage);
      const system = messages[0] as SystemMessage;
      const human = messages[1] as HumanMessage;
      expect(String(system.content)).toBe(JUDGE_SYSTEM_PROMPT);
      // SEC — boundary marker preserved.
      expect(String(system.content)).toContain('[END OF SYSTEM INSTRUCTIONS]');
      expect(String(human.content)).toBe(SAFE_USER_TEXT);
    });
  });

  describe('R3 — fail-OPEN when structured output unsupported', () => {
    it('returns null and does not call invoke when withStructuredOutput is undefined', async () => {
      const model = buildModel({ noStructuredOutput: true });

      const decision = await judgeWithLlm(SAFE_USER_TEXT, { model });

      expect(decision).toBeNull();
      expect(model.invokeSpy).not.toHaveBeenCalled();
    });

    it('returns null when no model is injected at all', async () => {
      const decision = await judgeWithLlm(SAFE_USER_TEXT, {});

      expect(decision).toBeNull();
    });
  });

  describe('R4 — timeout via AbortSignal.timeout', () => {
    it('returns null and aborts the invocation when timeoutMs is exceeded', async () => {
      const model = buildModel({
        delayMs: 200,
        resolveWith: { decision: 'allow', confidence: 0.5 },
      });

      const decision = await judgeWithLlm(SAFE_USER_TEXT, { model, timeoutMs: 30 });

      expect(decision).toBeNull();
      expect(model.invokeSpy).toHaveBeenCalledTimes(1);
      const opts = model.invokeSpy.mock.calls[0][1] as { signal?: AbortSignal };
      // SEC — invocation MUST be cancellable via the signal.
      expect(opts?.signal).toBeDefined();
      // After timeout fires the signal is aborted.
      expect(opts?.signal?.aborted).toBe(true);
    });
  });

  describe('R5 — fail-OPEN on invoke error', () => {
    it('returns null when invoke throws (schema-validation / network)', async () => {
      const model = buildModel({ shouldThrow: true });

      const decision = await judgeWithLlm(SAFE_USER_TEXT, { model });

      expect(decision).toBeNull();
      expect(model.invokeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('R5/R7 — budget guard preserved', () => {
    it('returns null and does not call the model when budget already exhausted', async () => {
      await recordJudgeCost(10_000); // far above default 500-cent cap
      const model = buildModel();

      const decision = await judgeWithLlm(SAFE_USER_TEXT, { model });

      expect(decision).toBeNull();
      expect(model.withStructuredOutputSpy).not.toHaveBeenCalled();
      expect(model.invokeSpy).not.toHaveBeenCalled();
    });

    it('charges budget on every non-exhausted call (anti-spam)', async () => {
      const model = buildModel({ resolveWith: { decision: 'allow', confidence: 0.9 } });
      // 1 cent / call, 500-cent default cap → ≥ 500 calls exhaust budget.
      for (let i = 0; i < 600; i++) {
        await judgeWithLlm(SAFE_USER_TEXT, { model });
      }
      const decision = await judgeWithLlm(SAFE_USER_TEXT, { model });
      expect(decision).toBeNull();
    });
  });
});
