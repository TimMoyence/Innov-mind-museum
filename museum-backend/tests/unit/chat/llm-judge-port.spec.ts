/**
 * T3.1.5 — LlmJudgePort extraction test.
 *
 * The KnowledgeRouter cascade (C4.1 design D4) needs a port-shaped judge it
 * can call between the KB and WebSearch legs. The existing
 * `judgeWithLlm()` function and its `JudgeDecision` shape are an internal
 * guardrail concern with verdict labels (`allow|block:abuse|...`); the router
 * only needs `{confidence, decision: allow|block|review}`.
 *
 * Contract :
 *   - `useCase/llm/llm-judge-guardrail.ts` exposes `LlmJudgePort.evaluate`
 *     + `LlmJudgeResult` (inlined alongside the sole impl — TD-8 cull 2026-05-15).
 *   - a wrapper class `LlmJudgeGuardrail` in `useCase/llm/llm-judge-guardrail.ts`
 *     implements `LlmJudgePort`, mapping the internal `JudgeDecision` shape to
 *     `LlmJudgeResult`. Fail-open of the underlying function (`null` →
 *     `{confidence: 0, decision: 'review'}`) is preserved.
 *   - the function `judgeWithLlm` MUST remain exported untouched (backward
 *     compat — 5 call-sites in production code still consume it).
 */
import { LlmJudgeGuardrail, judgeWithLlm } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import { resetBudget } from '@modules/chat/useCase/guardrail/guardrail-budget';

import type { LlmJudgePort, LlmJudgeResult } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';

interface FakeOrchestratorBehaviour {
  text?: string;
  shouldThrow?: boolean;
  delayMs?: number;
}

const buildOrchestrator = (behaviour: FakeOrchestratorBehaviour): ChatOrchestrator => {
  return {
    async generate() {
      if (behaviour.shouldThrow) throw new Error('llm-down');
      if (behaviour.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, behaviour.delayMs));
      }
      return {
        text: behaviour.text ?? '{"decision":"allow","confidence":0.9}',
        metadata: {},
      };
    },
    async generateStream() {
      throw new Error('not used');
    },
  };
};

describe('LlmJudgePort (T3.1.5)', () => {
  beforeEach(async () => {
    await resetBudget();
  });

  it('LlmJudgeGuardrail satisfies the LlmJudgePort interface', () => {
    const orchestrator = buildOrchestrator({});
    const guardrail = new LlmJudgeGuardrail({ orchestrator });

    // Compile-time : assignable to the port type.
    const port: LlmJudgePort = guardrail;

    expect(typeof port.evaluate).toBe('function');
  });

  it('evaluate(prompt) returns an LlmJudgeResult with allow on safe verdict', async () => {
    const orchestrator = buildOrchestrator({
      text: '{"decision":"allow","confidence":0.92}',
    });
    const guardrail = new LlmJudgeGuardrail({ orchestrator });

    const result: LlmJudgeResult = await guardrail.evaluate('safe message');

    expect(result.decision).toBe('allow');
    expect(result.confidence).toBeCloseTo(0.92);
  });

  it('evaluate(prompt) maps block:* verdicts to decision=block', async () => {
    const orchestrator = buildOrchestrator({
      text: '{"decision":"block:abuse","confidence":0.88}',
    });
    const guardrail = new LlmJudgeGuardrail({ orchestrator });

    const result = await guardrail.evaluate('abusive');

    expect(result.decision).toBe('block');
    expect(result.confidence).toBeCloseTo(0.88);
    expect(result.reason).toBe('block:abuse');
  });

  it('evaluate(prompt) returns review with confidence=0 when the underlying judge fails-open', async () => {
    const orchestrator = buildOrchestrator({ shouldThrow: true });
    const guardrail = new LlmJudgeGuardrail({ orchestrator });

    const result = await guardrail.evaluate('anything');

    expect(result.decision).toBe('review');
    expect(result.confidence).toBe(0);
  });

  it('evaluate honors AbortSignal by short-circuiting to review', async () => {
    const orchestrator = buildOrchestrator({ delayMs: 200 });
    const guardrail = new LlmJudgeGuardrail({ orchestrator });
    const controller = new AbortController();
    controller.abort();

    const result = await guardrail.evaluate('msg', controller.signal);

    expect(result.decision).toBe('review');
  });

  it('preserves the existing judgeWithLlm function export (backward compat)', async () => {
    const orchestrator = buildOrchestrator({
      text: '{"decision":"allow","confidence":0.8}',
    });

    const decision = await judgeWithLlm('hi', { orchestrator });

    expect(decision?.decision).toBe('allow');
    expect(decision?.confidence).toBeCloseTo(0.8);
  });
});
