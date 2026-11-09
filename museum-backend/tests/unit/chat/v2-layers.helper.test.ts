import { runLlmJudge } from '@modules/chat/useCase/guardrail/eval/v2-layers.helper';

import type { LlmJudgeFn } from '@modules/chat/useCase/guardrail/guardrail-evaluation.types';

const LONG_SAFE_TEXT =
  "Could you give me a much deeper, longer analysis of Monet's brushwork in his 1872 painting Impression, Sunrise, including the palette?";

describe('v2-layers.helper — judge / sidecar independence (I-FIX3 T1.4 regression-pin)', () => {
  describe('runLlmJudge degrade is a DEFER, not a short-circuit', () => {
    it('maps a degraded judge (null) to { allow: true } — fail-open to the already-run layers', async () => {
      const llmJudge: LlmJudgeFn = jest.fn().mockResolvedValue(null);

      const result = await runLlmJudge(LONG_SAFE_TEXT, {
        llmJudge,
        llmJudgeEnabled: true,
      });

      expect(result).toEqual({ allow: true });
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
});
