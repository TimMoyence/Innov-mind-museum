import { GuardrailCircuitBreaker } from '@modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker';
import {
  ScanInflightSemaphore,
  ScanSemaphoreOverflowError,
} from '@modules/chat/adapters/secondary/guardrails/scan-inflight-semaphore';
import { logger } from '@shared/logger/logger';
import {
  llmGuardChaosInjectionsTotal,
  llmGuardCircuitBreakerSkipsTotal,
  llmGuardScanDurationSeconds,
} from '@shared/observability/prometheus-metrics';

import type { GuardrailCircuitBreakerSnapshot } from '@modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker';
import type {
  GuardrailBlockReason,
  GuardrailInput,
  GuardrailOutput,
  GuardrailProvider,
  GuardrailVerdict,
  ProviderHealth,
  ProviderMetricsSnapshot,
} from '@modules/chat/domain/ports/guardrail-provider.port';

/**
 * Wire-level response expected from the LLM Guard sidecar.
 *
 * The POC sidecar (python-llm-guard FastAPI wrapper) exposes:
 *   POST {baseUrl}/scan/prompt  → ScanResponse
 *   POST {baseUrl}/scan/output  → ScanResponse
 *
 * The field names mirror LLM Guard's own naming so the adapter stays a thin
 * translator — any shape drift in the sidecar is isolated to this file.
 */
interface ScanResponse {
  is_valid: boolean;
  sanitized?: string;
  risk_score?: number;
  reason?: string;
}

interface LLMGuardAdapterOptions {
  baseUrl: string;
  timeoutMs: number;
  /** Optional fetch override — enables unit testing without an HTTP server. */
  fetchFn?: typeof fetch;
  /**
   * Optional circuit breaker — defaults to a fresh `GuardrailCircuitBreaker`
   * reading its tunables from the `LLM_GUARD_CB_*` env vars. The composition
   * root (`chat-module.ts`) injects a single shared instance per process so
   * the state survives across the input + output legs of one request.
   */
  circuitBreaker?: GuardrailCircuitBreaker;
  /**
   * Optional in-flight concurrency semaphore — caps concurrent /scan calls
   * to prevent surge-amplified latency on the sidecar (ADR-047). Defaults
   * to an unbounded sentinel (1e6, 1e6) — composition root injects the
   * env-configured instance, but tests can keep the default.
   */
  semaphore?: ScanInflightSemaphore;
  /**
   * Optional chaos injection rate in [0, 1]. Each `scan()` call samples a
   * uniform random number; if it falls below `chaosRate`, the call is
   * replaced by a simulated `AbortError` BEFORE leaving the adapter. The
   * normal timeout/error path then absorbs the failure → fail-CLOSED (R1)
   * preserved. Defaults to 0 (inactive).
   */
  chaosRate?: number;
  /**
   * Optional RNG override — defaults to `Math.random`. Injectable so unit
   * tests can pin the sampled value to 0 (always-inject) or 1 (never-inject)
   * without flakiness.
   */
  rng?: () => number;
}

/**
 * Defensive [0, 1] clamp for the constructor-injected `chaosRate`. The env
 * parser already clamps via `clampUnitInterval`; this re-clamp guards against
 * direct constructor calls (tests) that bypass env.
 */
const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

/**
 * Lookup table: substring in the sidecar reason → canonical block reason.
 * Order matters — first match wins, so narrower/higher-priority patterns
 * (jailbreak, PII) come before broader ones (inject).
 */
const REASON_PATTERNS: readonly [substring: string, mapped: GuardrailBlockReason][] = [
  ['jailbreak', 'jailbreak'],
  ['dan', 'jailbreak'],
  ['pii', 'pii'],
  ['anonymiz', 'pii'],
  ['toxic', 'toxicity'],
  ['ban', 'off_topic'],
  ['topic', 'off_topic'],
  ['bias', 'bias'],
  ['exfil', 'data_exfiltration'],
  ['secret', 'data_exfiltration'],
  ['schema', 'schema_violation'],
  ['json', 'schema_violation'],
  ['inject', 'prompt_injection'],
];

/**
 * Maps LLM Guard's free-form reason string to our finite block reason union.
 *
 * Unknown reasons collapse to 'prompt_injection' (safest default) rather than
 * 'error' — the sidecar did respond, it just flagged a category we don't track
 * explicitly. 'error' is reserved for fail-CLOSED cases where we could NOT
 * determine safety.
 */
const mapReason = (raw: string | undefined): GuardrailBlockReason => {
  if (!raw) return 'prompt_injection';
  const normalized = raw.toLowerCase();
  for (const [substring, mapped] of REASON_PATTERNS) {
    if (normalized.includes(substring)) return mapped;
  }
  return 'prompt_injection';
};

type ScanOutcome = 'success' | 'fail_closed' | 'timeout' | 'breaker_skip' | 'overflow';

/**
 * Secondary adapter: wraps the LLM Guard Python sidecar behind our hexagonal
 * `GuardrailProvider` port (ADR-048). Every network operation honours the
 * configured timeout and fails CLOSED on any error (network, HTTP ≥ 400,
 * malformed JSON, breaker open, queue overflow) — see ADR-047 for the
 * no-fail-OPEN contract.
 *
 * Activation: `env.guardrails.llmGuardUrl` set in chat-module.ts (ADR-015 amendment 2026-05-14 retired the master candidate flag).
 */
export class LLMGuardAdapter implements GuardrailProvider {
  readonly name = 'llm-guard';

  /**
   * Behavioural version stamp. Phase 0 hardcodes the upstream pip pin
   * (`llm-guard>=0.3.14,<0.4` per `ops/llm-guard-sidecar/requirements.txt`;
   * the 0.3.16 patch revision tracks the deployed wheel at the time of
   * writing). Phase 1 will read this dynamically from a sidecar
   * `GET /version` endpoint once the sidecar exposes one — ADR-048 §"Health
   * probe" + ADR-049 (TBD) on schema evolution.
   */
  readonly version = 'llm-guard-0.3.16';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly circuitBreaker: GuardrailCircuitBreaker;
  private readonly semaphore: ScanInflightSemaphore;
  /** Phase 1 chaos primitive — see ADR-048 + GUARDRAIL_CHAOS_RATE env. */
  private readonly chaosRate: number;
  /** Injectable RNG for chaos sampling (defaults to Math.random in production). */
  private readonly rng: () => number;

  // ── Local metrics counters (cumulative since process start). Shadow the
  // global Prometheus registry so `metrics()` exposes a self-contained view
  // without coupling to `prom-client` internals. See ADR-048 §"Metrics".
  private _metricsRequests = 0;
  private _metricsBlocks = 0;
  private _metricsErrors = 0;
  private _metricsSkipsBreaker = 0;
  private _metricsSkipsOverflow = 0;

  constructor(options: LLMGuardAdapterOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
    this.circuitBreaker = options.circuitBreaker ?? new GuardrailCircuitBreaker();
    // Sentinel default (effectively unbounded) so existing unit tests that
    // don't care about concurrency don't have to construct one. Production
    // composition root in chat-module.ts always injects an env-bounded one.
    this.semaphore = options.semaphore ?? new ScanInflightSemaphore(1_000_000, 1_000_000);
    // Chaos primitive — defaults inactive. Re-clamps defensively against
    // direct constructor calls that bypass the env-side `clampUnitInterval`.
    this.chaosRate = clampUnit(options.chaosRate ?? 0);
    this.rng = options.rng ?? Math.random;
  }

  /** Snapshot of the breaker state for `/api/health` (R8). */
  getCircuitBreakerState(): GuardrailCircuitBreakerSnapshot {
    return this.circuitBreaker.getState();
  }

  /** Scans user input against the sidecar's prompt endpoint. Fail-CLOSED on error. */
  async checkInput(input: GuardrailInput): Promise<GuardrailVerdict> {
    return await this.scan('/scan/prompt', { prompt: input.text, locale: input.locale });
  }

  /** Scans LLM output against the sidecar's output endpoint. Fail-CLOSED on error. */
  async checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict> {
    return await this.scan('/scan/output', {
      prompt: output.userInput ?? '',
      output: output.text,
      locale: output.locale,
    });
  }

  /**
   * Deep health probe — exercises `/scan/prompt` with a known-benign payload
   * and reports the observed latency + breaker state. Distinct from a TCP-up
   * check: a sidecar that accepts connections but blocks every scan as
   * "service_unavailable" registers as `degraded` here, not `up`.
   *
   * Status mapping:
   *   - Breaker OPEN                 → `down`     (regardless of probe outcome)
   *   - Breaker HALF_OPEN            → `degraded` (recovery in progress)
   *   - Breaker CLOSED + probe OK    → `up`
   *   - Breaker CLOSED + probe fail  → `degraded` (transient — breaker would
   *                                                eventually trip if it persists)
   *
   * Never throws. Caller (Phase 1 `/api/health/deep`) gets a verdict every time.
   */
  async health(): Promise<ProviderHealth> {
    const lastCheckedAt = new Date().toISOString();
    const breakerState = this.circuitBreaker.state;

    if (breakerState === 'OPEN') {
      return {
        status: 'down',
        latencyMs: 0,
        lastCheckedAt,
        detail: 'circuit_breaker_open',
      };
    }

    const start = process.hrtime.bigint();
    let probeOk: boolean;
    let probeDetail: string | undefined;
    try {
      const verdict = await this.scan('/scan/prompt', { prompt: 'health-probe' });
      // A `service_unavailable` verdict means the scan path itself failed
      // (timeout, semaphore overflow, breaker skip just before the read).
      probeOk = verdict.allow || verdict.reason !== 'service_unavailable';
      if (!probeOk) probeDetail = `probe_returned_${verdict.reason ?? 'unknown'}`;
    } catch (error) {
      probeOk = false;
      probeDetail = error instanceof Error ? error.message : String(error);
    }
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;

    if (breakerState === 'HALF_OPEN') {
      return { status: 'degraded', latencyMs, lastCheckedAt, detail: 'circuit_breaker_half_open' };
    }
    if (!probeOk) {
      return {
        status: 'degraded',
        latencyMs,
        lastCheckedAt,
        ...(probeDetail !== undefined ? { detail: probeDetail } : {}),
      };
    }
    return { status: 'up', latencyMs, lastCheckedAt };
  }

  /**
   * Local metrics snapshot. Cumulative-since-process-start. Counters are
   * updated synchronously inside `scan()` so the snapshot is always
   * consistent with the most recently completed call.
   */
  metrics(): ProviderMetricsSnapshot {
    return {
      requests: this._metricsRequests,
      blocks: this._metricsBlocks,
      errors: this._metricsErrors,
      skipsBreaker: this._metricsSkipsBreaker,
      skipsOverflow: this._metricsSkipsOverflow,
    };
  }

  private async scan(path: string, body: Record<string, unknown>): Promise<GuardrailVerdict> {
    this._metricsRequests += 1;

    // Fail-CLOSED contract preserved during breaker OPEN window — see ADR-047.
    if (!this.circuitBreaker.canAttempt()) {
      logger.warn('llm_guard_circuit_breaker_skip', {
        state: this.circuitBreaker.state,
        path,
      });
      llmGuardCircuitBreakerSkipsTotal.inc({ path, reason: 'breaker' });
      llmGuardScanDurationSeconds.observe({ path, outcome: 'breaker_skip' }, 0);
      this._metricsSkipsBreaker += 1;
      this._metricsBlocks += 1;
      return this.failClosed('service_unavailable');
    }

    // Concurrency cap. Overflow → fail-CLOSED (ADR-047), no fan-out to a
    // saturated sidecar.
    try {
      await this.semaphore.acquire();
    } catch (e) {
      if (e instanceof ScanSemaphoreOverflowError) {
        logger.warn('llm_guard_semaphore_overflow', {
          path,
          stats: this.semaphore.getStats(),
        });
        llmGuardCircuitBreakerSkipsTotal.inc({ path, reason: 'overflow' });
        llmGuardScanDurationSeconds.observe({ path, outcome: 'overflow' }, 0);
        this._metricsSkipsOverflow += 1;
        this._metricsBlocks += 1;
        return this.failClosed('service_unavailable');
      }
      throw e;
    }

    const start = process.hrtime.bigint();
    let outcome: ScanOutcome = 'fail_closed';
    try {
      const result = await this.scanOverHttp(path, body);
      outcome = result.outcome;
      if (!result.verdict.allow) this._metricsBlocks += 1;
      if (result.outcome === 'fail_closed' || result.outcome === 'timeout') {
        this._metricsErrors += 1;
      }
      return result.verdict;
    } finally {
      const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      llmGuardScanDurationSeconds.observe({ path, outcome }, elapsedSeconds);
      this.semaphore.release();
    }
  }

  /**
   * Returns `true` exactly when the chaos sampler fires for this attempt.
   * `chaosRate === 0` short-circuits the RNG so the production hot path
   * stays a single comparison.
   */
  private shouldChaosInject(): boolean {
    if (this.chaosRate <= 0) return false;
    return this.rng() < this.chaosRate;
  }

  private async scanOverHttp(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ verdict: GuardrailVerdict; outcome: ScanOutcome }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    // Phase 1 chaos hook — simulate upstream failure BEFORE the fetch so the
    // existing timeout/error path is exercised end-to-end. The abort is
    // observably identical to a real timeout, which is the point: chaos
    // drills validate the fail-CLOSED contract using the same code that
    // absorbs real outages, not a parallel branch.
    if (this.shouldChaosInject()) {
      llmGuardChaosInjectionsTotal.inc();
      logger.warn('llm_guard_chaos_injected', { path, chaosRate: this.chaosRate });
      controller.abort(new DOMException('Simulated chaos abort', 'AbortError'));
    }

    try {
      const response = await this.fetchFn(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.circuitBreaker.recordFailure();
        logger.warn('llm_guard_non_ok_fail_closed', { status: response.status, path });
        return { verdict: this.failClosed('error'), outcome: 'fail_closed' };
      }

      const raw = (await response.json()) as Partial<ScanResponse>;
      if (typeof raw.is_valid !== 'boolean') {
        this.circuitBreaker.recordFailure();
        logger.warn('llm_guard_malformed_fail_closed', { path });
        return { verdict: this.failClosed('error'), outcome: 'fail_closed' };
      }

      this.circuitBreaker.recordSuccess();
      return { verdict: this.verdictFromSidecar(raw), outcome: 'success' };
    } catch (error) {
      this.circuitBreaker.recordFailure();
      const message = error instanceof Error ? error.message : String(error);
      const kind = message.toLowerCase().includes('abort') ? 'timeout' : 'network';
      logger.warn('llm_guard_fail_closed', { kind, path, error: message });
      return {
        verdict: this.failClosed('error'),
        outcome: kind === 'timeout' ? 'timeout' : 'fail_closed',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Builds a fail-CLOSED verdict stamped with this adapter's identity so the
   * audit log + downstream aggregator can attribute the decision. Centralised
   * so the `version: 'v1'` literal and `providedBy` stamp stay consistent
   * across every return site.
   */
  private failClosed(reason: 'error' | 'service_unavailable'): GuardrailVerdict {
    return {
      version: 'v1',
      allow: false,
      reason,
      providedBy: { name: this.name, version: this.version },
    };
  }

  /** Build the `GuardrailVerdict` from a well-formed sidecar payload. */
  private verdictFromSidecar(raw: Partial<ScanResponse>): GuardrailVerdict {
    const stamp = { name: this.name, version: this.version };
    if (raw.is_valid) {
      return {
        version: 'v1',
        allow: true,
        ...(typeof raw.risk_score === 'number' ? { confidence: 1 - raw.risk_score } : {}),
        ...(raw.sanitized !== undefined ? { redactedText: raw.sanitized } : {}),
        providedBy: stamp,
      };
    }
    return {
      version: 'v1',
      allow: false,
      reason: mapReason(raw.reason),
      ...(typeof raw.risk_score === 'number' ? { confidence: raw.risk_score } : {}),
      ...(raw.sanitized !== undefined ? { redactedText: raw.sanitized } : {}),
      providedBy: stamp,
    };
  }
}
