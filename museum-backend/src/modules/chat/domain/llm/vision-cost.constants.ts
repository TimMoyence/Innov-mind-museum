/**
 * Domain home for the per-image cost-equivalent constants. Relocated from
 * `adapters/secondary/llm/llm-cost-pricing.ts` so the application prompt-builder
 * (`useCase/llm/llm-prompt-builder.ts`) and the infrastructure pricing adapter
 * share ONE home for the value rather than the application reaching up into an
 * adapter (B2 close + DRY, run 2026-06-04-hexagonal-boundaries-enforcement).
 *
 * `VISION_BYTES_EQUIVALENT = VISION_TOKEN_EQUIVALENT * BYTES_PER_TOKEN = 4000`
 * keeps the conversion symmetrical with the byte-based estimator: 1000 vision
 * tokens × 4 bytes/token = 4000 forfait bytes per image item. Conservative
 * upper bound (RUN_ID 2026-05-21-p0-c2-cost-breaker / spec §3 R4 + D1); no env
 * override (UFR-015 — no pre-launch flags); tune via PR if real-world drift
 * > 10 % vs invoice.
 */
export const BYTES_PER_TOKEN = 4;

export const VISION_TOKEN_EQUIVALENT = 1000;

export const VISION_BYTES_EQUIVALENT = VISION_TOKEN_EQUIVALENT * BYTES_PER_TOKEN;
