/**
 * Port for an advanced guardrail layer (V2) running in addition to the keyword-based
 * art-topic-guardrail. Candidates (LLM Guard, NeMo Guardrails, Prompt Armor) adapt to
 * this interface via secondary adapters. Activation gated by
 * `env.features.guardrailsV2Candidate` (see NL-3 POC plan).
 *
 * Contract (failure policy): adapters MUST fail-CLOSED — if their check throws or
 * times out, return `{ allow: false, reason: 'error' }` rather than leaking
 * unverified content. This mirrors the existing ArtTopicClassifier policy.
 *
 * Contract (latency): adapters MUST honour the timeout configured in the env flag;
 * default 300ms target P95 (budget aligned with the +150ms maximum in the P11 Done When).
 */

/** Finite categories of reasons an advanced guardrail may block input or output. */
export type AdvancedGuardrailBlockReason =
  | 'prompt_injection'
  | 'pii'
  | 'toxicity'
  | 'off_topic'
  | 'schema_violation'
  | 'bias'
  | 'data_exfiltration'
  | 'jailbreak'
  | 'error';

/** Decision returned by an advanced guardrail check. */
export interface AdvancedGuardrailDecision {
  allow: boolean;
  reason?: AdvancedGuardrailBlockReason;
  /** Optional confidence in [0,1]. Used by the aggregator to tier decisions (observe vs block). */
  confidence?: number;
  /** Optional redacted text (PII scanners may return a sanitized version to pass downstream). */
  redactedText?: string;
}

/** Input payload submitted to `checkInput`. */
export interface AdvancedGuardrailInput {
  /** User text after the existing sanitizePromptInput pass. */
  text: string;
  /** User-provided locale hint, if any (may be undefined). */
  locale?: string;
  /** Session id for telemetry correlation (never passed to the remote model). */
  sessionId?: string;
}

/** Output payload submitted to `checkOutput`. */
export interface AdvancedGuardrailOutput {
  /** Final assistant text (post current output keyword guardrail). */
  text: string;
  /** Optional metadata from the orchestrator (followUpQuestions, recommendations, etc.). */
  metadata?: Record<string, unknown>;
  /** Originating user input (context for relevance checks, no PII stored beyond this call). */
  userInput?: string;
  /** User-provided locale hint, if any. */
  locale?: string;
}

/** Contract for an advanced guardrail adapter. */
export interface AdvancedGuardrail {
  /** Stable name — used for telemetry, env flag matching, and logs. */
  readonly name: string;

  /**
   * Evaluates the user input BEFORE the LLM call. Adapters should return quickly;
   * the advanced layer runs AFTER the deterministic keyword guardrail (which
   * remains the first defence).
   */
  checkInput(input: AdvancedGuardrailInput): Promise<AdvancedGuardrailDecision>;

  /**
   * Evaluates the assistant output AFTER the keyword output guardrail. Adapters
   * may return `redactedText` when they choose to pass a sanitized variant
   * (e.g. PII masking) rather than block outright.
   */
  checkOutput(output: AdvancedGuardrailOutput): Promise<AdvancedGuardrailDecision>;
}

/** Null-object adapter for when `env.features.guardrailsV2Candidate` is off. */
export const noopAdvancedGuardrail: AdvancedGuardrail = {
  name: 'noop',
  // eslint-disable-next-line @typescript-eslint/require-await -- intentional async no-op to satisfy interface
  async checkInput(): Promise<AdvancedGuardrailDecision> {
    return { allow: true };
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- intentional async no-op to satisfy interface
  async checkOutput(): Promise<AdvancedGuardrailDecision> {
    return { allow: true };
  },
};
