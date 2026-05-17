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
 * Sidecar wire (POST {baseUrl}/scan/prompt | /scan/output).
 * Field names mirror LLM Guard's — shape drift isolated to this file.
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
  fetchFn?: typeof fetch;
  /**
   * Shared per-process instance (composition root injects); state must survive
   * across input + output legs of one request. Defaults to a fresh one reading
   * `LLM_GUARD_CB_*` env vars.
   */
  circuitBreaker?: GuardrailCircuitBreaker;
  /**
   * ADR-047 — caps concurrent /scan calls; overflow → fail-CLOSED, no fan-out
   * to a saturated sidecar. Default sentinel (1e6/1e6 = unbounded) — prod
   * injects env-bounded.
   */
  semaphore?: ScanInflightSemaphore;
  /**
   * Chaos rate ∈ [0, 1]. When sample < rate, replaces the call with a
   * simulated AbortError BEFORE the fetch — exercises the SAME fail-CLOSED
   * path as real outages (not a parallel branch). Default 0 (inactive).
   */
  chaosRate?: number;
  /** RNG override (default Math.random); pin to 0/1 in tests. */
  rng?: () => number;
}

/** Defensive — env parser clamps via clampUnitInterval, this guards direct ctor. */
const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
};

/** Order matters — first match wins, narrower (jailbreak/pii) before broader (inject). */
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
 * Unknown → 'prompt_injection' (sidecar did respond — just unmapped category).
 * 'error' is reserved for fail-CLOSED where safety could NOT be determined.
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
 * GuardrailProvider port over the LLM Guard Python sidecar (ADR-048).
 * Fail-CLOSED on every error path (network, HTTP ≥ 400, malformed JSON,
 * breaker open, queue overflow) per ADR-047 — no-fail-OPEN contract.
 *
 * Activation: `env.guardrails.llmGuardUrl` set in chat-module.ts (ADR-015
 * amendment 2026-05-14 retired the master candidate flag).
 */
export class LLMGuardAdapter implements GuardrailProvider {
  readonly name = 'llm-guard';

  /**
   * Phase 0 — hardcoded pin (matches `ops/llm-guard-sidecar/requirements.txt`
   * `llm-guard>=0.3.14,<0.4`). Phase 1 → dynamic from sidecar `GET /version`.
   */
  readonly version = 'llm-guard-0.3.16';

  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly circuitBreaker: GuardrailCircuitBreaker;
  private readonly semaphore: ScanInflightSemaphore;
  /** ADR-048 + GUARDRAIL_CHAOS_RATE env. */
  private readonly chaosRate: number;
  private readonly rng: () => number;

  // Local metrics — cumulative since process start. Shadow Prometheus registry
  // so metrics() decouples from prom-client internals (ADR-048 §"Metrics").
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
    // Sentinel default (unbounded) for tests; prod injects env-bounded.
    this.semaphore = options.semaphore ?? new ScanInflightSemaphore(1_000_000, 1_000_000);
    this.chaosRate = clampUnit(options.chaosRate ?? 0);
    this.rng = options.rng ?? Math.random;
  }

  /** Breaker snapshot for `/api/health` (R8). */
  getCircuitBreakerState(): GuardrailCircuitBreakerSnapshot {
    return this.circuitBreaker.getState();
  }

  /** Fail-CLOSED on error. */
  async checkInput(input: GuardrailInput): Promise<GuardrailVerdict> {
    return await this.scan('/scan/prompt', { prompt: input.text, locale: input.locale });
  }

  /** Fail-CLOSED on error. */
  async checkOutput(output: GuardrailOutput): Promise<GuardrailVerdict> {
    return await this.scan('/scan/output', {
      prompt: output.userInput ?? '',
      output: output.text,
      locale: output.locale,
    });
  }

  /**
   * Deep probe — runs `/scan/prompt` with benign payload. Never throws.
   * Status: OPEN → down; HALF_OPEN → degraded; CLOSED + probe ok → up;
   * CLOSED + probe fail → degraded.
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
      // `service_unavailable` = scan-path failure (timeout/overflow/breaker race).
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

  /** Cumulative since process start; updated synchronously inside scan(). */
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

    // ADR-047 fail-CLOSED during breaker OPEN window.
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

    // ADR-047 — overflow → fail-CLOSED, no fan-out to saturated sidecar.
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

  /** Hot path short-circuits RNG when chaosRate=0. */
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

    // Chaos hook — abort BEFORE fetch so chaos drills exercise the SAME
    // fail-CLOSED path as real outages (observably identical timeout).
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

  /** Centralised so `version: 'v1'` + providedBy stamp stay consistent. */
  private failClosed(reason: 'error' | 'service_unavailable'): GuardrailVerdict {
    return {
      version: 'v1',
      allow: false,
      reason,
      providedBy: { name: this.name, version: this.version },
    };
  }

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
