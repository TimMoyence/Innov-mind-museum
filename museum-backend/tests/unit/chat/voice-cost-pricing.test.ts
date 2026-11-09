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
    expect(estimateTtsCostCents(1_000_000)).toBeCloseTo(1500);
  });

  it('TTS estimate is 0 for an empty input', () => {
    expect(estimateTtsCostCents(0)).toBe(0);
  });
});
