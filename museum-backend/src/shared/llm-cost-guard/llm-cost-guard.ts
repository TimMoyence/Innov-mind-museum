import { logger as defaultLogger } from '@shared/logger/logger';
import { musaiumLlmCostAnonBypassTotal } from '@shared/observability/prometheus-metrics';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';

/** Stable contract — tests, ops dashboards, ADR-038 (P0-4) all key off these literals. */
export type LlmCostGuardCode =
  | 'LLM_KILL_SWITCH_ACTIVE'
  | 'LLM_USER_DAILY_CAP_EXCEEDED'
  | 'LLM_COST_GUARD_REDIS_UNAVAILABLE';

interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * Intentionally NOT an AppError subclass — guard lives in `src/shared/` and must not
 * pull HTTP concerns into the domain. HTTP layer maps in the route handler.
 * `dailySpentUsd`/`capUsd` surfaced ONLY on cap path (never kill-switch — no counter
 * touched; never Redis-unavailable — counter unreadable).
 */
export class LlmCostGuardError extends Error {
  readonly code: LlmCostGuardCode;
  readonly dailySpentUsd?: number;
  readonly capUsd?: number;

  constructor(params: {
    code: LlmCostGuardCode;
    message?: string;
    dailySpentUsd?: number;
    capUsd?: number;
  }) {
    super(params.message ?? params.code);
    this.name = 'LlmCostGuardError';
    this.code = params.code;
    this.dailySpentUsd = params.dailySpentUsd;
    this.capUsd = params.capUsd;
  }
}

export interface LlmCostGuardOptions {
  /** Operational panic button — when true, every call denied. */
  killSwitchEnabled: boolean;
  /** Per-user daily ceiling in USD. */
  dailyCapUsd: number;
  counter: LlmCostCounter;
  logger?: Logger;
  /** Clock injection for deterministic day-key in tests. */
  clock?: () => Date;
}

/**
 * UTC (not local) — multi-region instances must agree on day boundary so a user can't
 * multiply daily budget by hopping regions. Audit prescribes UTC.
 */
const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * SEC: Per-user daily USD ceiling + global kill-switch for paid LLM calls (P0-4).
 * Single chokepoint in front of every outbound LLM/audio/image call.
 *
 * Decision flow (canonical):
 *   1. kill-switch → throw LLM_KILL_SWITCH_ACTIVE BEFORE counter read (auth+anon)
 *   2. userId null → warn('llm_cost_anon_bypass') + metric, then bypass per-user
 *      cap (no stable key); HTTP rate-limit enforces volume. I-FIX3: the bypass is
 *      LOUD + observable so a future un-authed paid route surfaces immediately
 *      instead of silently skipping the cap (all live routes require auth today).
 *   3. counter.get() throws (Redis) → fail-CLOSED LLM_COST_GUARD_REDIS_UNAVAILABLE
 *      (contract restored at commit e45490c1)
 *   4. current + estimated > cap → throw LLM_USER_DAILY_CAP_EXCEEDED
 *      CRITICAL: over-cap delta MUST NOT be consumed — else tight retry loop bumps
 *      total + leaks budget signal to attackers
 *   5. otherwise increment; increment throws → fail-CLOSED
 *
 * Every deny path emits `logger.warn('llm_cost_cap_block', …)` with stable shape.
 */
export class LlmCostGuard {
  private readonly killSwitchEnabled: boolean;
  private readonly dailyCapUsd: number;
  private readonly counter: LlmCostCounter;
  private readonly logger: Logger;
  private readonly clock: () => Date;

  constructor(options: LlmCostGuardOptions) {
    this.killSwitchEnabled = options.killSwitchEnabled;
    this.dailyCapUsd = options.dailyCapUsd;
    this.counter = options.counter;
    this.logger = options.logger ?? defaultLogger;
    this.clock = options.clock ?? ((): Date => new Date());
  }

  /**
   * @throws {LlmCostGuardError} when denied. `userId=null` anon bypasses per-user
   * cap (kill-switch still applies). `estimatedCostUsd` is worst-case (safety net,
   * not metering — conservative flat $0.002/call acceptable).
   */
  async assertAllowed(userId: string | null, estimatedCostUsd: number): Promise<void> {
    if (this.killSwitchEnabled) {
      this.logBlock(userId, 'LLM_KILL_SWITCH_ACTIVE');
      throw new LlmCostGuardError({
        code: 'LLM_KILL_SWITCH_ACTIVE',
        message: 'LLM kill-switch is active — outbound LLM calls are globally disabled.',
        capUsd: this.dailyCapUsd,
      });
    }

    if (userId === null) {
      // I-FIX3 (c) — anon reaches the guard ONLY after the kill-switch check
      // above (R4 precedence preserved): a kill-switched anon caller never gets
      // here. No stable per-user key exists for anon, so we keep the early-return
      // (no hard block — KISS, no IP-budget store) BUT make it LOUD: a future
      // un-authed paid route now surfaces immediately instead of bypassing the
      // cap with zero signal. All live paid routes require `isAuthenticated`, so
      // this should be flat 0 in prod.
      this.logger.warn('llm_cost_anon_bypass', { capUsd: this.dailyCapUsd });
      try {
        musaiumLlmCostAnonBypassTotal.inc();
      } catch (err) {
        // Observability must never break the guard (prom-client throws on
        // registry-cleared / duplicate-name). Swallow + log, never deny on a
        // metric failure (the decision is "allow anon" regardless).
        this.logger.warn('llm_cost_anon_bypass_metric_failed', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const day = dayKey(this.clock());

    let current: number;
    try {
      current = await this.counter.get(userId, day);
    } catch (err) {
      this.logBlock(userId, 'LLM_COST_GUARD_REDIS_UNAVAILABLE', {
        reason: err instanceof Error ? err.message : String(err),
      });
      throw new LlmCostGuardError({
        code: 'LLM_COST_GUARD_REDIS_UNAVAILABLE',
        message: 'LLM cost counter unreachable — failing CLOSED.',
        capUsd: this.dailyCapUsd,
      });
    }

    if (current + estimatedCostUsd > this.dailyCapUsd) {
      this.logBlock(userId, 'LLM_USER_DAILY_CAP_EXCEEDED', {
        dailySpentUsd: current,
      });
      throw new LlmCostGuardError({
        code: 'LLM_USER_DAILY_CAP_EXCEEDED',
        message: 'Per-user daily LLM cost cap exceeded.',
        dailySpentUsd: current,
        capUsd: this.dailyCapUsd,
      });
    }

    try {
      await this.counter.increment(userId, day, estimatedCostUsd);
    } catch (err) {
      this.logBlock(userId, 'LLM_COST_GUARD_REDIS_UNAVAILABLE', {
        reason: err instanceof Error ? err.message : String(err),
        phase: 'increment',
      });
      throw new LlmCostGuardError({
        code: 'LLM_COST_GUARD_REDIS_UNAVAILABLE',
        message: 'LLM cost counter increment failed — failing CLOSED.',
        capUsd: this.dailyCapUsd,
      });
    }
  }

  /** Shape asserted verbatim by tests — do not rename fields. */
  private logBlock(
    userId: string | null,
    code: LlmCostGuardCode,
    extra?: Record<string, unknown>,
  ): void {
    this.logger.warn('llm_cost_cap_block', {
      userId,
      code,
      capUsd: this.dailyCapUsd,
      ...(extra ?? {}),
    });
  }
}
