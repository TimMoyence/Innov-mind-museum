/**
 * M1 W5-C3 (UFR-022) — voice-cost pricing helpers feeding the GLOBAL in-process
 * `LlmCostCircuitBreaker` (spike/daily spend signal). Pure, no I/O.
 *
 * These estimates intentionally do NOT reuse the text `estimateCostCents` /
 * `PRICING` table (`llm-cost-pricing.ts`), which has no audio rows by design
 * (design §D3 / AC6). They are conservative LIST-price ceilings — real
 * `gpt-4o-mini-transcribe` / `gpt-4o-mini-tts` are cheaper, so the breaker
 * over-protects (safe bias, same philosophy as `FALLBACK_PRICING`).
 *
 * Coherence with the per-user HTTP cost-guard middleware ceilings
 * (`llm-cost-guard.middleware.ts`): STT $0.004, TTS $0.0015 worst-case. The
 * HTTP middleware is a DIFFERENT layer (per-user Redis blocking); feeding both
 * is defense-in-depth, not double-counting (design §R1).
 *
 * Tuning: if invoices drift >10% the constants are bumped via PR — no env flag
 * (UFR-015).
 */

/** USD list price for TTS, per 1M characters (tts-1 list $15/1M; gpt-4o-mini-tts cheaper → conservative). */
const TTS_USD_PER_1M_CHARS = 15;

/** Flat STT cost in cents per transcription ($0.004 → 0.4¢). */
const STT_FLAT_CENTS = 0.4;

/**
 * Flat STT estimate (cents). Billed per audio SECOND, but the adapter has NO
 * duration source (`durationKnown:false`, TD-20 D-Q1) — a flat ceiling is the
 * honest choice (UFR-013), coherent with the $0.004 HTTP middleware ceiling.
 */
export const estimateSttCostCents = (): number => STT_FLAT_CENTS;

/**
 * TTS estimate (cents), linear in the (truncated) character count actually sent
 * to OpenAI. `charCount / 1_000_000 * 15 USD * 100` → cents. Fractional kept
 * (the breaker accepts any positive float; it only rejects `<= 0`/non-finite),
 * so `estimateTtsCostCents(0) === 0` and the value scales exactly linearly.
 */
export const estimateTtsCostCents = (charCount: number): number =>
  (charCount / 1_000_000) * TTS_USD_PER_1M_CHARS * 100;
