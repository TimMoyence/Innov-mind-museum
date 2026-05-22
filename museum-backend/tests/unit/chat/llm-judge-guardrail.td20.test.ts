/**
 * TD-20 [T4.1] RED — judge Langfuse `generation()` instrumentation.
 *
 * Asserts `judgeWithLlm` emits ONE Langfuse `generation` named
 * `guardrail.judge.generation` with a non-empty `model` + a NON-FABRICATED
 * usage/metadata payload (A1/R1/R10, design D-Q3); on judge `null` the
 * generation is `.end()`-ed with an error/outcome marker (A6/R8); scope
 * (`museumId`/`tier`/`requestId`) present when supplied, ABSENT when omitted
 * (A7/R5); fail-open (A5/R7); PII sentinel — judged message not in spy args.
 *
 * Q3 PROBE (design D-Q3 / spec Q3): `judgeWithLlm` casts the structured-output
 * result directly to `JudgeDecision` (`llm-judge-guardrail.ts:135`) and does
 * NOT capture `usage_metadata`. The fake model's `invoke` returns ONLY
 * `{decision, confidence}` — there is no token-usage source. Therefore these
 * tests assert `model` + a non-fabricated `metadata` payload (e.g.
 * `inputLength`) and explicitly assert NO fabricated token counts
 * (`usage.input`/`usage.output`/`usage.total` absent). UFR-013: never assert a
 * fabricated token count.
 *
 * RED: `judgeWithLlm` does not yet emit any Langfuse generation, and
 * `JudgeWithLlmOptions` does not yet carry `museumId/tier/requestId` → spies
 * never called; the scope fields are passed via a forward-typed local options
 * shape so this RED file compiles before GREEN widens the type.
 */
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { z } from 'zod';

import { resetBudget } from '@modules/chat/useCase/guardrail/guardrail-budget';
import { judgeWithLlm } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import { getLangfuse } from '@shared/observability/langfuse.client';

import { makeFakeLangfuseClient } from '../../helpers/observability/fakeLangfuse';

import type { ChatModel } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';
import type { JudgeWithLlmOptions } from '@modules/chat/useCase/llm/llm-judge-guardrail';

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;

const PII_MESSAGE =
  'TOPSECRET_JUDGE_MESSAGE Could you analyse Monet brushwork should never leak in telemetry';

/**
 * Forward-typed judge options. `museumId`/`tier`/`requestId` are added to
 * `JudgeWithLlmOptions` by GREEN [T1.1]; this test references them now so the
 * RED scope assertions exist. DTO-shape (not an entity cast) — documented per
 * tasks.md DRY note (port-input DTOs constructed inline).
 */
type JudgeOptsWithScope = JudgeWithLlmOptions & {
  museumId?: number;
  tier?: 'anonymous' | 'free';
  requestId?: string;
};

interface FakeModelBehaviour {
  resolveWith?: { decision: string; confidence: number };
  shouldThrow?: boolean;
}

const buildModel = (behaviour: FakeModelBehaviour = {}): ChatModel => {
  return {
    async invoke() {
      throw new Error('plain invoke should not be reached in detached judge path');
    },
    async stream() {
      throw new Error('stream should not be reached in detached judge path');
    },
    withStructuredOutput<T>(schema: z.ZodType<T>) {
      return {
        async invoke(): Promise<T> {
          if (behaviour.shouldThrow) {
            throw new Error('llm-down');
          }
          // Q3: the structured result carries ONLY the decision shape — NO
          // usage_metadata. The judge file casts it to JudgeDecision verbatim.
          // `schema` is referenced (the real provider validates against it).
          const value = behaviour.resolveWith ?? { decision: 'allow', confidence: 0.9 };
          const parsed = schema.safeParse(value);
          return (parsed.success ? parsed.data : value) as T;
        },
      };
    },
  } as ChatModel;
};

const callJudge = (message: string, opts: JudgeOptsWithScope): Promise<unknown> =>
  judgeWithLlm(message, opts as JudgeWithLlmOptions);

describe('TD-20 — judge Langfuse generation', () => {
  beforeEach(async () => {
    getLangfuseMock.mockReset();
    await resetBudget();
  });

  it('emits one generation named guardrail.judge.generation with non-empty model + non-fabricated metadata (A1/R1/R10, D-Q3)', async () => {
    const { fakeClient, clientTrace, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const model = buildModel({ resolveWith: { decision: 'allow', confidence: 0.9 } });

    await callJudge('Tell me about the Mona Lisa composition', { model, requestId: 'req-judge-1' });

    expect(clientTrace).toHaveBeenCalledTimes(1);
    expect(traceGeneration).toHaveBeenCalledTimes(1);
    const genBody = traceGeneration.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(genBody?.name).toBe('guardrail.judge.generation');
    expect(typeof genBody?.model).toBe('string');
    expect((genBody?.model as string).length).toBeGreaterThan(0);

    // UFR-013 / D-Q3 — NO fabricated token counts. usage_metadata is not
    // captured by the judge, so any `usage`/`usageDetails` present must NOT
    // carry invented input/output/total token numbers.
    const usage = (genBody?.usage ?? {}) as Record<string, unknown>;
    const usageDetails = (genBody?.usageDetails ?? {}) as Record<string, unknown>;
    expect(usage.input).toBeUndefined();
    expect(usage.output).toBeUndefined();
    expect(usage.total).toBeUndefined();
    expect(usageDetails.output).toBeUndefined();
    expect(usageDetails.total).toBeUndefined();

    // A non-fabricated count IS expected (e.g. metadata.inputLength) so the
    // generation is informative without inventing token usage.
    const metadata = (genBody?.metadata ?? {}) as Record<string, unknown>;
    expect(metadata.inputLength).toBe('Tell me about the Mona Lisa composition'.length);
  });

  it('closes the generation with an error/outcome marker when the judge returns null (A6/R8)', async () => {
    const { fakeClient, generationEnd } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const model = buildModel({ shouldThrow: true });

    const decision = await callJudge('analyse this artwork please', {
      model,
      requestId: 'req-judge-err',
    });

    expect(decision).toBeNull();
    expect(generationEnd).toHaveBeenCalled();
    const endBody = generationEnd.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;
    const metadata = (endBody?.metadata ?? {}) as Record<string, unknown>;
    const marker = endBody?.level ?? metadata.outcome;
    expect(marker).toBeDefined();
  });

  it('carries museumId/tier/requestId when supplied (A7/R5)', async () => {
    const { fakeClient, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const model = buildModel();

    await callJudge('discuss the artwork', {
      model,
      museumId: 7,
      tier: 'free',
      requestId: 'req-judge-2',
    });

    const genBody = traceGeneration.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const metadata = (genBody?.metadata ?? {}) as Record<string, unknown>;
    const merged = { ...genBody, ...metadata };
    expect(merged.museumId).toBe(7);
    expect(merged.tier).toBe('free');
    expect(merged.requestId).toBe('req-judge-2');
  });

  it('OMITS museumId/tier keys (not null) when scope omitted (A7/R5/UFR-013)', async () => {
    const { fakeClient, clientTrace, traceGeneration } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const model = buildModel();

    await callJudge('discuss the artwork', { model });

    const serialized = JSON.stringify([...clientTrace.mock.calls, ...traceGeneration.mock.calls]);
    expect(serialized).not.toContain('"museumId":null');
    expect(serialized).not.toContain('"tier":null');
    expect(serialized).not.toContain('"museumId"');
    expect(serialized).not.toContain('"tier"');
  });

  it('fail-open: judge result identical when getLangfuse() returns null (A5/R7)', async () => {
    getLangfuseMock.mockReturnValue(null);
    const model = buildModel({ resolveWith: { decision: 'allow', confidence: 0.88 } });

    const decision = await callJudge('discuss the artwork', { model, requestId: 'req-judge-3' });
    expect(decision).toMatchObject({ decision: 'allow', confidence: 0.88 });
  });

  it('fail-open: a throwing Langfuse client never breaks the judge verdict (A5/R7)', async () => {
    const throwingClient = {
      trace: jest.fn(() => {
        throw new Error('langfuse boom');
      }),
    };
    getLangfuseMock.mockReturnValue(throwingClient as unknown as ReturnType<typeof getLangfuse>);
    const model = buildModel({ resolveWith: { decision: 'allow', confidence: 0.77 } });

    const decision = await callJudge('discuss the artwork', { model, requestId: 'req-judge-4' });
    expect(decision).toMatchObject({ decision: 'allow', confidence: 0.77 });
  });

  it('PII discipline: judged message text never appears in Langfuse spy args (NFR Privacy)', async () => {
    const { fakeClient, clientTrace, traceGeneration, generationEnd } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);
    const model = buildModel();

    await callJudge(PII_MESSAGE, { model, requestId: 'req-judge-5' });

    const serialized = JSON.stringify([
      ...clientTrace.mock.calls,
      ...traceGeneration.mock.calls,
      ...generationEnd.mock.calls,
    ]);
    expect(serialized).not.toContain(PII_MESSAGE);
  });
});
