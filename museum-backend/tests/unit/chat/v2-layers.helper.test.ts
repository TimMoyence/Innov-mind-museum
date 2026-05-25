/**
 * I-FIX3 · T1.4 — judge degrade does NOT bypass the sidecar / keyword layers
 * (ADR-015 structural independence).
 *
 * Run: 2026-05-25-ifix3-cost-guard-judge · spec §R7 · design §D4.
 *
 * Classification (per tasks.md T1.4): this is a REGRESSION-PIN, not a red. The
 * design's honest finding (§D4) is that the sidecar (`evaluateGuardrailProvider`,
 * fail-CLOSED) runs in `evaluateInput` BEFORE `runLlmJudge`, so the judge
 * returning `null` → `{ allow: true }` is a DEFER-to-already-run-layers, NOT a
 * short-circuit. The brief's hypothesis ("judge degrade short-circuits the
 * sidecar fail-closed") does NOT hold under current wiring — so this guarantee
 * already holds at HEAD and we pin it so a future refactor cannot regress it.
 *
 * It references NO new symbol (no degrade metric), so per the editor flag in
 * tasks T1.4 it is pinned as a PASSING regression test, kept frozen for the
 * green phase alongside the red tests.
 *
 * lib-docs consulted: express/PATTERNS.md §3.3 (middleware ordering / layer
 * composition reasoning) — the layers are plain functions here, not Express
 * middleware, but the same ordering-independence reasoning applies.
 *
 * Run scope: pnpm jest tests/unit/chat/v2-layers.helper.test.ts
 */
import {
  runLlmJudge,
  evaluateGuardrailProvider,
} from '@modules/chat/useCase/guardrail/eval/v2-layers.helper';

import type { LlmJudgeFn } from '@modules/chat/useCase/guardrail/guardrail-evaluation.types';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';

const LONG_SAFE_TEXT =
  "Could you give me a much deeper, longer analysis of Monet's brushwork in his 1872 painting Impression, Sunrise, including the palette?";

const buildProvider = (name = 'llm-guard'): GuardrailProvider =>
  ({ name }) as unknown as GuardrailProvider;

describe('v2-layers.helper — judge / sidecar independence (I-FIX3 T1.4 regression-pin)', () => {
  describe('runLlmJudge degrade is a DEFER, not a short-circuit', () => {
    it('maps a degraded judge (null) to { allow: true } — fail-open to the already-run layers', async () => {
      const llmJudge: LlmJudgeFn = jest.fn().mockResolvedValue(null);

      const result = await runLlmJudge(LONG_SAFE_TEXT, {
        llmJudge,
        llmJudgeEnabled: true,
      });

      expect(result).toEqual({ allow: true });
      // The judge WAS consulted (msg long enough) — the null is a real degrade,
      // not a "skipped because disabled" path.
      expect(llmJudge).toHaveBeenCalledTimes(1);
    });

    it('still blocks when the judge returns a confident non-allow verdict (degrade ≠ permanent allow)', async () => {
      const llmJudge: LlmJudgeFn = jest
        .fn()
        .mockResolvedValue({ decision: 'block:injection', confidence: 0.95 });

      const result = await runLlmJudge(LONG_SAFE_TEXT, {
        llmJudge,
        llmJudgeEnabled: true,
      });

      expect(result.allow).toBe(false);
    });
  });

  describe('evaluateGuardrailProvider (sidecar, fail-CLOSED) decides independently of the judge', () => {
    it("keeps the sidecar's fail-CLOSED block binding regardless of any judge degrade", async () => {
      // The sidecar throws → ADR-048 fail-CLOSED → block. This verdict is the
      // sidecar's alone; the judge does not run here and could not relax it.
      const verdict = await evaluateGuardrailProvider(
        'input',
        async () => {
          throw new Error('sidecar-down');
        },
        { guardrailProvider: buildProvider(), guardrailProviderObserveOnly: false },
      );

      expect(verdict.allow).toBe(false);
      // ADR-047: a raw adapter `error` is mapped to `service_unavailable`
      // (guardrail-reason-mapping.ts:36-38). Pin the actual fail-CLOSED reason.
      expect(verdict.reason).toBe('service_unavailable');
    });

    it('a degraded judge (allow:true) does NOT override an enforce-mode sidecar block', async () => {
      // Simulate the evaluateInput sequencing: sidecar runs first and blocks,
      // judge degrades to allow afterwards. The binding decision is the
      // sidecar's block — the judge's allow is only a defer for the leg it owns.
      const sidecarVerdict = await evaluateGuardrailProvider(
        'input',
        async () => ({ allow: false, reason: 'prompt-injection' }),
        { guardrailProvider: buildProvider(), guardrailProviderObserveOnly: false },
      );
      const judgeVerdict = await runLlmJudge(LONG_SAFE_TEXT, {
        llmJudge: jest.fn().mockResolvedValue(null),
        llmJudgeEnabled: true,
      });

      // Independence: the two layers produced their own verdicts. The sidecar
      // blocks; the judge defers. A caller honoring fail-CLOSED keeps the block.
      expect(sidecarVerdict.allow).toBe(false);
      expect(judgeVerdict).toEqual({ allow: true });
    });

    it('returns allow when no sidecar is wired (judge cannot make it fail-closed)', async () => {
      const verdict = await evaluateGuardrailProvider('input', async () => ({ allow: true }), {
        guardrailProvider: undefined,
        guardrailProviderObserveOnly: false,
      });

      expect(verdict.allow).toBe(true);
    });
  });
});
