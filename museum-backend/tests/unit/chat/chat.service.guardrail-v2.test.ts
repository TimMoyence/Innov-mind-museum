/**
 * F4 (2026-04-30) — end-to-end LLM-judge wiring inside the chat-message
 * pipeline.
 *
 * Verifies the four contract rules:
 *   1. keyword `allow` + judge `block:abuse` >= 0.6 → blocked
 *   2. keyword `allow` + judge `block:*` < 0.6 → kept allowed
 *   3. keyword `block:*` + judge anything → kept blocked (judge cannot upgrade)
 *   4. env candidate != 'llm-judge' → judge skipped (zero orchestrator calls)
 *
 * Driven via `GuardrailEvaluationService.evaluateInput` directly — exercising the
 * full chat.service is wasteful for these branch-level invariants and the
 * guardrail evaluator is the single source of truth for input decisions
 * (chat.service / chat-message.service simply delegate to it).
 */
import { GuardrailEvaluationService } from '@modules/chat/useCase/guardrail/guardrail-evaluation.service';
import { resetBudget } from '@modules/chat/useCase/guardrail/guardrail-budget';

import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';

const repoStub = {
  persistMessage: async () => ({ id: 'x', createdAt: new Date() }),
} as unknown as ChatRepository;

const buildJudgeStub = (
  decision: JudgeDecision | null,
): { fn: jest.Mock; getCalls: () => number } => {
  const fn = jest.fn().mockResolvedValue(decision);
  return { fn, getCalls: () => fn.mock.calls.length };
};

const LONG_TEXT =
  'I would like a deep deeper detailed analysis of the brushwork in this painting from 1872 thank you very much.';

describe('GuardrailEvaluationService — LLM judge wiring (F4)', () => {
  beforeEach(() => {
    resetBudget();
  });

  it('Rule 1: keyword allow + judge block:abuse >= 0.6 → blocks with insult reason', async () => {
    const judge = buildJudgeStub({ decision: 'block:abuse', confidence: 0.85 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput(LONG_TEXT);

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('insult');
    expect(judge.getCalls()).toBe(1);
  });

  it('Rule 1b: keyword allow + judge block:injection >= 0.6 → blocks with prompt_injection', async () => {
    const judge = buildJudgeStub({ decision: 'block:injection', confidence: 0.7 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput(LONG_TEXT);

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('prompt_injection');
  });

  it('Rule 1c: keyword allow + judge block:offtopic >= 0.6 → blocks with off_topic', async () => {
    const judge = buildJudgeStub({ decision: 'block:offtopic', confidence: 0.62 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput(LONG_TEXT);

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('off_topic');
  });

  it('Rule 2: keyword allow + judge block confidence < 0.6 → kept allowed', async () => {
    const judge = buildJudgeStub({ decision: 'block:abuse', confidence: 0.55 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput(LONG_TEXT);

    expect(result.allow).toBe(true);
  });

  it('Rule 3: keyword block (insult) + judge says allow → kept blocked, judge NOT called', async () => {
    const judge = buildJudgeStub({ decision: 'allow', confidence: 0.99 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    // Existing keyword pre-filter blocks "fuck" outright
    const result = await service.evaluateInput(`${LONG_TEXT} fuck this`);

    expect(result.allow).toBe(false);
    expect(result.reason).toBe('insult');
    // judge MUST not run when keyword already blocked
    expect(judge.getCalls()).toBe(0);
  });

  it('Rule 4: judge disabled → judge stub is never called', async () => {
    const judge = buildJudgeStub({ decision: 'block:abuse', confidence: 0.99 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: false,
    });

    const result = await service.evaluateInput(LONG_TEXT);

    expect(result.allow).toBe(true);
    expect(judge.getCalls()).toBe(0);
  });

  it('judge skipped when message length <= judgeMinMessageLength threshold', async () => {
    const judge = buildJudgeStub({ decision: 'block:abuse', confidence: 0.99 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput('Short msg');

    expect(result.allow).toBe(true);
    expect(judge.getCalls()).toBe(0);
  });

  it('judge null result (timeout / parse failure / budget) → fall back to keyword decision', async () => {
    const judge = buildJudgeStub(null);
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput(LONG_TEXT);

    expect(result.allow).toBe(true);
    expect(judge.getCalls()).toBe(1);
  });

  it('judge returns allow verdict → input passes', async () => {
    const judge = buildJudgeStub({ decision: 'allow', confidence: 0.95 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput(LONG_TEXT);

    expect(result.allow).toBe(true);
    expect(judge.getCalls()).toBe(1);
  });

  it('preClassified="art" still gates judge: long text with judge block runs the judge regardless', async () => {
    const judge = buildJudgeStub({ decision: 'block:injection', confidence: 0.9 });
    const service = new GuardrailEvaluationService({
      repository: repoStub,
      llmJudge: judge.fn,
      llmJudgeEnabled: true,
    });

    const result = await service.evaluateInput(LONG_TEXT, 'art');

    // Hard-block channels (insults, injection) ALWAYS win — the preClassified hint
    // never disables the judge for long messages.
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('prompt_injection');
  });
});
