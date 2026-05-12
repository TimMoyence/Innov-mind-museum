/**
 * Guardrail provider strategy port (replaces the legacy `AdvancedGuardrail`
 * port per ADR-048).
 *
 * A `GuardrailProvider` is one implementation among an evolving strategy stack
 * (currently: `LLMGuardAdapter`; future candidates: NeMo Guardrails, Llama
 * Prompt Guard 2, Lakera, Microsoft Presidio sidecar, in-house fine-tunes).
 * The chat-module composition root may instantiate multiple providers, route
 * per-tenant policy in Phase 2, and shadow-promote new providers per the
 * perennial design (Phase 1). See
 * `.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/`.
 *
 * Contract (failure policy): adapters MUST fail-CLOSED — if their check throws
 * or times out, return `{ version: 'v1', allow: false, reason: 'service_unavailable' }`
 * rather than leak unverified content. ADR-047 codifies the breaker + semaphore
 * pattern for the LLM-Guard sidecar; the same fail-CLOSED contract applies to
 * every other provider on this port.
 *
 * Contract (latency): adapters MUST honour the timeout configured via env
 * (default 1500 ms after the 2026-05-12 incident; was 300 ms historically —
 * the higher ceiling reflects CPU-only inference on the V1 VPS sidecar).
 */

/** Finite categories of reasons a guardrail provider may block input or output. */
export type GuardrailBlockReason =
  | 'prompt_injection'
  | 'pii'
  | 'toxicity'
  | 'off_topic'
  | 'schema_violation'
  | 'bias'
  | 'data_exfiltration'
  | 'jailbreak'
  | 'error'
  /**
   * Upstream guard is unreachable / saturated (timeout, non-OK response,
   * breaker open, semaphore overflow). Distinct from `error` at the mapper
   * level (ADR-047) so the user sees an honest "service unavailable" copy
   * instead of a misleading "your content was flagged" message.
   */
  | 'service_unavailable';

/** Verdict returned by a guardrail provider check. Schema versioned per ADR-048. */
export interface GuardrailVerdict {
  /** Schema version. Always 'v1' at Phase 0; bump on breaking changes only. */
  version: 'v1';
  /** True when the content is allowed to proceed downstream. */
  allow: boolean;
  /** Block category — required when `allow === false`, never present when allow. */
  reason?: GuardrailBlockReason;
  /** Optional confidence in [0,1]. Used by aggregators to tier decisions (observe vs block). */
  confidence?: number;
  /** Optional redacted text (PII scanners may return a sanitized version to pass downstream). */
  redactedText?: string;
  /** Optional provider name + version stamped on the verdict for audit log. */
  providedBy?: { name: string; version: string };
}

/** Input payload submitted to `checkInput`. */
export interface GuardrailInput {
  /** User text after the existing `sanitizePromptInput` pass. */
  text: string;
  /** User-provided locale hint, if any (may be undefined). */
  locale?: string;
  /** Session id for telemetry correlation (never passed to the remote model). */
  sessionId?: string;
}

/** Output payload submitted to `checkOutput`. */
export interface GuardrailOutput {
  /** Final assistant text (post current output keyword guardrail). */
  text: string;
  /** Optional metadata from the orchestrator (followUpQuestions, recommendations, etc.). */
  metadata?: Record<string, unknown>;
  /** Originating user input (context for relevance checks, no PII stored beyond this call). */
  userInput?: string;
  /** User-provided locale hint, if any. */
  locale?: string;
}

/**
 * Health probe outcome — distinct from a TCP-up check. See ADR-048.
 *
 *   - `up`        : provider answered a known-benign probe within budget.
 *   - `degraded`  : provider responding but slow / partial (e.g. breaker HALF_OPEN).
 *   - `down`      : provider unreachable or consistently failing (e.g. breaker OPEN).
 */
export interface ProviderHealth {
  status: 'up' | 'degraded' | 'down';
  /** Round-trip latency of the probe call, in milliseconds. */
  latencyMs: number;
  /** ISO-8601 timestamp at which the probe was performed. */
  lastCheckedAt: string;
  /** Optional free-form string (e.g. circuit breaker state, last error). */
  detail?: string;
}

/**
 * Provider metrics snapshot for `/api/health/deep` (Phase 1) and dashboards.
 *
 * Counters are cumulative since process start. Counters are local to the
 * adapter instance and shadow the global Prometheus registry so the adapter
 * can expose its own view without coupling to `prom-client` internals.
 */
export interface ProviderMetricsSnapshot {
  /** Total `checkInput` + `checkOutput` calls reaching the adapter. */
  requests: number;
  /** Total verdicts with `allow === false`. */
  blocks: number;
  /** Total fail-CLOSED returns due to provider error (timeout, 5xx, parse failure). */
  errors: number;
  /** Blocked attempts when the circuit breaker was OPEN (subset of requests). */
  skipsBreaker?: number;
  /** Rejected attempts due to inflight-semaphore overflow (subset of requests). */
  skipsOverflow?: number;
}

/**
 * Contract for a guardrail provider adapter (replaces `AdvancedGuardrail` per
 * ADR-048).
 *
 * Implementations are wired in the chat-module composition root. Multiple
 * providers may coexist in Phase 1 (shadow mode) and Phase 2 (per-tenant
 * policy aggregation).
 */
export interface GuardrailProvider {
  /** Stable name — used for telemetry, env flag matching, and logs. */
  readonly name: string;

  /**
   * Stable identifier for this provider's *behavioural* version. Bump on any
   * change that may shift decisions (model swap, threshold change, prompt
   * template). Used by shadow-mode promotion gates + audit log + bias
   * monitoring snapshots. Conventionally semver-ish
   * (e.g. `'llm-guard-0.3.16'`, `'llama-prompt-guard-2-86m'`).
   */
  readonly version: string;

  /**
   * Evaluates the user input BEFORE the LLM call. Adapters should return
   * quickly; the advanced layer runs AFTER the deterministic keyword
   * guardrail (which remains the first defence — see docs/AI_SAFETY.md §2).
   */
  checkInput(input: GuardrailInput): Promise<GuardrailVerdict>;

  /**
   * Evaluates the assistant output AFTER the keyword output guardrail.
   * Adapters may return `redactedText` when they choose to pass a sanitized
   * variant (e.g. PII masking) rather than block outright.
   */
  checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict>;

  /**
   * Deep health probe. Exercises the provider's actual decision path with a
   * known-benign payload. Implementations SHOULD return within 2× their
   * typical timeout. Called by `/api/health/deep` (Phase 1).
   */
  health(): Promise<ProviderHealth>;

  /**
   * Lightweight metrics snapshot — cumulative-since-process-start.
   * Called by `/api/health/deep` (Phase 1) and the bias-monitoring aggregator
   * (Phase 1.5).
   */
  metrics(): ProviderMetricsSnapshot;
}

/**
 * Null-object adapter for when no provider is configured. Returned by the
 * composition root in non-llm-guard candidate modes; satisfies the interface
 * with trivial values so downstream code can branch on the optional dependency
 * exclusively at composition time rather than scattering `?.` everywhere.
 */
export const noopGuardrailProvider: GuardrailProvider = {
  name: 'noop',
  version: 'noop-v1',
  // eslint-disable-next-line @typescript-eslint/require-await -- intentional async no-op to satisfy interface
  async checkInput(): Promise<GuardrailVerdict> {
    return { version: 'v1', allow: true };
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- intentional async no-op to satisfy interface
  async checkOutput(): Promise<GuardrailVerdict> {
    return { version: 'v1', allow: true };
  },
  // eslint-disable-next-line @typescript-eslint/require-await -- intentional async no-op to satisfy interface
  async health(): Promise<ProviderHealth> {
    return { status: 'up', latencyMs: 0, lastCheckedAt: new Date().toISOString() };
  },
  metrics(): ProviderMetricsSnapshot {
    return { requests: 0, blocks: 0, errors: 0 };
  },
};
