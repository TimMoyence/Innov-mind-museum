/**
 * TD-20 (T0.2 / R12 / A11) — single source for the V1 plan-tier derivation used
 * by the four non-LangChain LLM paths (judge, TTS, STT, LLM-Guard).
 *
 * The rule is verbatim-equal to the chat orchestrator's inline derivation
 * (`langchain.orchestrator.ts:325-326`: `const tier = input.userId == null
 * ? 'anonymous' : 'free'`). Keeping it in ONE helper avoids four divergent
 * copies (DRY) and a wrong dependency direction (importing a chat-adapter
 * internal). `== null` matches both `null` and `undefined` while leaving a real
 * id of `0` classified as `'free'` (`0 == null` is `false`).
 */

/** V1 plan tier — derived enum, not PII. */
export type LlmPathTier = 'anonymous' | 'free';

/**
 * Optional tenant scope threaded onto the judge invocation context + ports so
 * each Langfuse observation can carry real per-tenant attribution. Every field
 * is optional; an absent field is OMITTED from the observation (never `null`,
 * never fabricated — UFR-013).
 */
export interface LlmJudgeScope {
  museumId?: number;
  tier?: LlmPathTier;
  requestId?: string;
}

/**
 * `userId == null ? 'anonymous' : 'free'` — verbatim parity with
 * `langchain.orchestrator.ts:325-326`.
 */
export const deriveTier = (userId?: number | null): LlmPathTier =>
  userId == null ? 'anonymous' : 'free';
