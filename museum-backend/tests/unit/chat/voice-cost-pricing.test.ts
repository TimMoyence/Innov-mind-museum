/**
 * M1 W5-C3 (RED, UFR-022) — pure voice-cost pricing functions.
 *
 * STT is a flat ceiling (no duration source — TD-20 D-Q1) coherent with the
 * HTTP middleware $0.004 ceiling. TTS scales linearly in `text.length` at the
 * conservative tts-1 list price ($15 / 1M chars). These are NOT derived from
 * the text `estimateCostCents`/PRICING table (which has no audio rows by
 * design — design §D3/AC6).
 *
 * FAILS today: the module `voice-cost-pricing.ts` does not exist yet.
 */
import {
  estimateSttCostCents,
  estimateTtsCostCents,
} from '@modules/chat/adapters/secondary/audio/voice-cost-pricing';

describe('voice-cost-pricing — STT flat estimate', () => {
  it('STT flat estimate is 0.4 cents (coherent with HTTP ceiling $0.004)', () => {
    expect(estimateSttCostCents()).toBe(0.4);
  });
});

describe('voice-cost-pricing — TTS linear estimate', () => {
  it('TTS estimate scales linearly with chars at $15/1M', () => {
    expect(estimateTtsCostCents(1_000_000)).toBeCloseTo(1500); // $15 = 1500 cents
  });

  it('TTS estimate is 0 for an empty input', () => {
    expect(estimateTtsCostCents(0)).toBe(0);
  });
});
