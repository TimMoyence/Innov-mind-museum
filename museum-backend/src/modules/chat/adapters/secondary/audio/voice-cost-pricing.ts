const TTS_USD_PER_1M_CHARS = 15;

const STT_FLAT_CENTS = 0.4;

export const estimateSttCostCents = (): number => STT_FLAT_CENTS;

export const estimateTtsCostCents = (charCount: number): number =>
  (charCount / 1_000_000) * TTS_USD_PER_1M_CHARS * 100;
