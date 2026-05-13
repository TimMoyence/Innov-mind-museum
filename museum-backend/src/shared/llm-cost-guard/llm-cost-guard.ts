import { logger as defaultLogger } from '@shared/logger/logger';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';

/**
 * Canonical error codes emitted by {@link LlmCostGuard}. Stable contract —
 * tests (`tests/unit/shared/llm-cost-guard/llm-cost-guard.test.ts`),
 * ops dashboards, and ADR-038 (P0-4) all key off these literals.
 */
export type LlmCostGuardCode =
  | 'LLM_KILL_SWITCH_ACTIVE'
  | 'LLM_USER_DAILY_CAP_EXCEEDED'
  | 'LLM_COST_GUARD_REDIS_UNAVAILABLE';

/**
 * Minimal logger surface needed by the cost guard. Matches the project
 * logger at `@shared/logger/logger`; tests can inject a no-op spy.
 */
interface Logger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * Error thrown by {@link LlmCostGuard.assertAllowed} to deny an outbound
 * LLM call. Carries a machine-readable {@link LlmCostGuardCode} so callers
 * can branch (HTTP error middleware maps to 429 / 503 etc.). The optional
 * `dailySpentUsd` / `capUsd` fields are surfaced ONLY for the per-user
 * cap path — never for the kill-switch path (no per-user counter is
 * touched there) and never for the Redis-unavailable path (the counter
 * was unreadable).
 *
 * Intentionally NOT a subclass of `AppError`: the cost guard lives in
 * `src/shared/` and must not pull HTTP-status concerns into the domain.
 * The HTTP layer maps this error in the route handler.
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

/**
 * Constructor input for {@link LlmCostGuard}. `clock` is optional and
 * exists so tests can pin the UTC day key — production code never
 * supplies it.
 */
export interface LlmCostGuardOptions {
  /** Operational panic button — when `true`, every call is denied. */
  killSwitchEnabled: boolean;
  /** Per-user daily ceiling in USD. Calls breaching it are denied. */
  dailyCapUsd: number;
  /** Counter backing store (Redis in prod, in-memory double in tests). */
  counter: LlmCostCounter;
  /** Optional logger override; defaults to the project structured logger. */
  logger?: Logger;
  /** Clock injection for deterministic day-key resolution in tests. */
  clock?: () => Date;
}

/**
 * Returns today's date as `YYYY-MM-DD` in UTC.
 *
 * UTC (not local) because:
 *   1. Multi-region instances must agree on the day boundary so a single
 *      user can't multiply their daily budget by hopping regions.
 *   2. The audit prescribes UTC (`docs/audit-2026-05-12/details/04-kiss.md`).
 *   3. The RED tests freeze the clock to `2026-05-12T12:00:00Z` and assert
 *      the resulting key is `2026-05-12` regardless of host TZ.
 */
const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Per-user daily USD ceiling + global kill-switch for paid LLM calls.
 *
 * Single chokepoint in front of every outbound LLM/audio/image API call.
 * P0-4 in `docs/audit-2026-05-12/details/04-kiss.md` §P0-U-2 — Musaium
 * pre-launch had NO per-user cost ceiling and NO global kill-switch, so
 * a single abusive loop could produce an unbounded OpenAI bill.
 *
 * ## Decision flow (canonical)
 *
 * 1. `killSwitchEnabled === true` → log + throw `LLM_KILL_SWITCH_ACTIVE`,
 *    BEFORE any counter read. Applies to authenticated AND anonymous calls.
 * 2. `userId === null` (anonymous) → bypass per-user cap (no stable key)
 *    and return. HTTP-layer rate-limit middleware enforces volume control
 *    for anon traffic.
 * 3. Read current daily spend from the counter. Counter throws (Redis
 *    outage) → log + throw `LLM_COST_GUARD_REDIS_UNAVAILABLE`
 *    (**fail-CLOSED**, like the llm-guard sidecar contract restored at
 *    commit `e45490c1`).
 * 4. `current + estimatedCostUsd > dailyCapUsd` → log + throw
 *    `LLM_USER_DAILY_CAP_EXCEEDED` with `dailySpentUsd: current,
 *    capUsd: dailyCapUsd`. CRITICAL: the over-cap delta MUST NOT be
 *    consumed — otherwise a tight retry loop bumps the running total on
 *    every iteration above the cap and leaks budget signal to attackers.
 * 5. Otherwise, increment the counter. Increment throws → fail-CLOSED
 *    with `LLM_COST_GUARD_REDIS_UNAVAILABLE`.
 *
 * Every deny path emits a `logger.warn('llm_cost_cap_block', { … })`
 * with a stable shape so ops can flag hot users via the existing
 * structured-log pipeline.
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
   * Assert that the caller is allowed to make a paid LLM call estimated
   * at `estimatedCostUsd` USD. Resolves silently when the call is
   * allowed; throws {@link LlmCostGuardError} otherwise.
   *
   * @param userId - Authenticated user ID, or `null` for anonymous callers.
   *   Anonymous callers BYPASS the per-user cap (no stable key) — the
   *   HTTP-layer per-IP rate-limit middleware enforces volume control
   *   for them. The kill-switch still applies.
   * @param estimatedCostUsd - Worst-case dollar cost estimate for the
   *   call. The cap is the safety net, not a metering system — a
   *   conservative flat rate per call (e.g. `0.002` USD) is acceptable
   *   pending a token-rate table.
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
      // Anonymous bypass — no stable per-user key. Documented policy
      // codified by the `anonymous user` tests in the P0-4 suite.
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

  /**
   * Emit the canonical structured warn log for a deny path.
   *
   * Shape is asserted verbatim by the tests; do not rename fields.
   */
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
