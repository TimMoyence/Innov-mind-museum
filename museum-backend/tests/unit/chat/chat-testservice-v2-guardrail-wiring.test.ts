/**
 * RUN_ID 2026-06-01-v2-guardrail-testservice-wiring — RED (UFR-022 fresh-context).
 *
 * Proves the shared test helper `buildChatTestService`
 * (tests/helpers/chat/chatTestApp.ts) SILENTLY DROPS the four V2-guardrail
 * dependencies that `ChatServiceDeps` already accepts:
 *   `guardrailProvider`, `guardrailProviderObserveOnly`, `llmJudge`, `llmJudgeEnabled`.
 *
 * Today the helper's options branch (chatTestApp.ts:491-503) threads through a
 * subset of deps and NONE of the V2 four. Because they are dropped, a test going
 * through the helper can never reach enforce-mode sidecar blocking nor the
 * LLM-judge layer (the provider stays observe-only via the downstream
 * `?? true` default, guardrail-evaluation.service.ts:54; the judge stays
 * disabled via `?? false`, guardrail-evaluation.service.ts:56).
 *
 * Scope: pure in-memory UNIT test — no DB, no Docker, no Redis, no network, no
 * real LLM. The fake `GuardrailProvider` (DRY factory) and the `jest.fn()` judge
 * are LEGITIMATE here: this test exercises the helper WIRING (does the helper
 * thread the dep into `ChatService`?), NOT LLM decision quality. The no-mock
 * invariant (NFR-NOMOCK-1) applies to the Tech-Lead-owned LIVE ai-tests that
 * inject a real sidecar adapter / real judge — out of scope for this run.
 *
 * Expected state today: BOTH cases FAIL (deps dropped → FakeOrchestrator answers
 * normally → no `policy:prompt_injection` citation; judge never invoked).
 * After GREEN (helper threads the four deps verbatim), both PASS.
 */
import { buildChatTestService } from '../../helpers/chat/chatTestApp';
import { makeFakeGuardrailProvider } from '../../helpers/chat/guardrail-provider.fixtures';

import type { LlmJudgeFn } from '@modules/chat/useCase/guardrail/guardrail-evaluation.types';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';

describe('buildChatTestService — V2-guardrail dependency wiring (RUN_ID 2026-06-01)', () => {
  it('RED-1: provider enforce mode (guardrailProviderObserveOnly:false) blocks a benign message via the sidecar', async () => {
    // `{ block: true }` ⇒ checkInput denies with reason 'prompt_injection'
    // (guardrail-provider.fixtures.ts:39-50). Enforce mode (observeOnly:false)
    // means the deny is NOT downgraded to allow (v2-layers.helper.ts:93-106).
    const provider = makeFakeGuardrailProvider({ block: true });
    const service = buildChatTestService({
      guardrailProvider: provider,
      guardrailProviderObserveOnly: false,
    });

    const session = await service.createSession({ userId: 42 });
    const result = await service.postMessage(
      session.id,
      // benign text — the V1 keyword guardrail allows it, so the V2 provider
      // layer is the only thing that can block. Proves the provider is wired.
      { text: 'Tell me about the Mona Lisa.' },
      undefined,
      42,
    );

    // The load-bearing assertion: the refusal carries the policy citation
    // `policy:prompt_injection` (withPolicyCitation → buildGuardrailCitation,
    // art-topic-guardrail.ts:254-256). A normal FakeOrchestrator answer would
    // NOT contain it — so this proves enforce-mode blocking fired.
    expect(result.metadata?.citations).toContain('policy:prompt_injection');
  });

  it('RED-2: LLM judge (llmJudgeEnabled:true) is invoked on a >50-char benign message and blocks', async () => {
    // jest.fn judge typed as LlmJudgeFn, returns a JudgeDecision that blocks:
    // decision != 'allow' AND confidence >= 0.6 floor (v2-layers.helper.ts:45-57).
    const judgeDecision: JudgeDecision = { decision: 'block:injection', confidence: 1 };
    const judge: LlmJudgeFn = jest.fn().mockResolvedValue(judgeDecision);

    const service = buildChatTestService({
      llmJudge: judge,
      llmJudgeEnabled: true,
      // guardrailProvider intentionally OMITTED — layer independence
      // (AC-6 / NFR-SEC-4): enabling the judge must work without a provider.
    });

    const session = await service.createSession({ userId: 42 });
    // length > judgeMinMessageLength (default 50, env.ts:408; gate is `<=`,
    // v2-layers.helper.ts:39). benignLong.length === 80.
    const benignLong =
      'Could you please tell me in detail about the Mona Lisa painting and its history?';
    const result = await service.postMessage(session.id, { text: benignLong }, undefined, 42);

    // The load-bearing pair: judge wired+invoked, and its block surfaced as the
    // policy citation (judgeVerdictToReason('block:injection') === 'prompt_injection',
    // guardrail-reason-mapping.ts:12).
    expect(judge).toHaveBeenCalled();
    expect(result.metadata?.citations).toContain('policy:prompt_injection');
  });
});
