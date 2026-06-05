/**
 * Guardrail provider strategy port (replaces legacy `AdvancedGuardrail` per ADR-048).
 *
 * Current: `LLMGuardAdapter`. Future candidates: NeMo Guardrails, Llama Prompt
 * Guard 2, Lakera, Presidio sidecar, in-house fine-tunes. Composition root may
 * instantiate multiple providers, route per-tenant policy (Phase 2), and
 * shadow-promote new providers (Phase 1).
 *
 * Failure policy: adapters MUST fail-CLOSED — if check throws or times out,
 * return `{ version: 'v1', allow: false, reason: 'service_unavailable' }` rather
 * than leak unverified content. ADR-047 codifies the breaker + semaphore pattern.
 *
 * Latency: adapters MUST honour env timeout (default 1500ms after the 2026-05-12
 * incident; was 300ms — higher ceiling reflects CPU-only inference on V1 VPS).
 */

import type { LlmPathTier } from '@shared/observability/derive-tier';

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
   * Upstream guard unreachable / saturated (timeout, non-OK response, breaker
   * open, semaphore overflow). Distinct from `error` (ADR-047) so the user sees
   * "service unavailable" instead of misleading "your content was flagged".
   */
  | 'service_unavailable';

/** Schema versioned per ADR-048. */
export interface GuardrailVerdict {
  /** Bump on breaking changes only. */
  version: 'v1';
  allow: boolean;
  /** Required when `allow === false`, never present otherwise. */
  reason?: GuardrailBlockReason;
  /** [0,1]. Used by aggregators to tier decisions (observe vs block). */
  confidence?: number;
  /** PII scanners may return a sanitized version to pass downstream. */
  redactedText?: string;
  /** Stamped on verdict for audit log. */
  providedBy?: { name: string; version: string };
}

export interface GuardrailInput {
  /** Already passed through `sanitizePromptInput`. */
  text: string;
  locale?: string;
  /** For telemetry correlation — never passed to the remote model. */
  sessionId?: string;
  /**
   * TD-20 (R11d) — OPTIONAL per-tenant scope from `GuardrailAuditContext` so the
   * LLM-Guard correlation `event` is attributable. `museumId` is honestly
   * ABSENT (not in `GuardrailAuditContext` — see spec §5/D5); only `tier` +
   * `requestId` are reachable on this path. Omitted (never fabricated) when
   * absent.
   */
  museumId?: number;
  tier?: LlmPathTier;
  requestId?: string;
}

export interface GuardrailOutput {
  /** Final assistant text (post current output keyword guardrail). */
  text: string;
  /** From orchestrator (suggestedFollowUp, recommendations, etc.). */
  metadata?: Record<string, unknown>;
  /** Context for relevance checks, no PII stored beyond this call. */
  userInput?: string;
  locale?: string;
  /** TD-20 (R11d) — symmetric per-tenant scope (see `GuardrailInput`). */
  museumId?: number;
  tier?: LlmPathTier;
  requestId?: string;
}

/**
 * Distinct from a TCP-up check. See ADR-048.
 *   - `up`        : answered known-benign probe within budget.
 *   - `degraded`  : responding but slow / partial (e.g. breaker HALF_OPEN).
 *   - `down`      : unreachable / consistently failing (e.g. breaker OPEN).
 */
export interface ProviderHealth {
  status: 'up' | 'degraded' | 'down';
  latencyMs: number;
  /** ISO-8601. */
  lastCheckedAt: string;
  /** Free-form (e.g. circuit breaker state, last error). */
  detail?: string;
}

/**
 * Cumulative-since-process-start. Local to the adapter instance, shadows the
 * global Prometheus registry so the adapter exposes its own view without
 * coupling to `prom-client` internals. Used by `/api/health/deep` (Phase 1).
 */
export interface ProviderMetricsSnapshot {
  requests: number;
  blocks: number;
  /** Fail-CLOSED returns due to provider error (timeout, 5xx, parse failure). */
  errors: number;
  /** Blocked when circuit breaker was OPEN (subset of requests). */
  skipsBreaker?: number;
  /** Rejected due to inflight-semaphore overflow (subset of requests). */
  skipsOverflow?: number;
}

/** Replaces `AdvancedGuardrail` per ADR-048. */
export interface GuardrailProvider {
  /** Stable — used for telemetry, env flag matching, logs. */
  readonly name: string;

  /**
   * Stable *behavioural* version. Bump on any change that may shift decisions
   * (model swap, threshold change, prompt template). Used by shadow-mode
   * promotion gates + audit log + bias monitoring. Conventionally semver-ish
   * (e.g. `'llm-guard-0.3.16'`).
   */
  readonly version: string;

  /**
   * Evaluates user input BEFORE the LLM call. Runs AFTER the deterministic
   * keyword guardrail (which remains first defence — see docs/AI_SAFETY.md §2).
   */
  checkInput(input: GuardrailInput): Promise<GuardrailVerdict>;

  /**
   * Evaluates assistant output AFTER the keyword output guardrail. Adapters may
   * return `redactedText` to pass a sanitized variant rather than block outright.
   */
  checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict>;

  /**
   * Exercises actual decision path with known-benign payload. SHOULD return
   * within 2× typical timeout. Called by `/api/health/deep` (Phase 1).
   */
  health(): Promise<ProviderHealth>;

  /** Called by `/api/health/deep` (Phase 1) + bias-monitoring aggregator (Phase 1.5). */
  metrics(): ProviderMetricsSnapshot;
}

/**
 * Null-object for when no provider is configured. Lets downstream code branch
 * on the optional dependency at composition time rather than scattering `?.`.
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
