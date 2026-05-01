/**
 * F4 (2026-04-30) — daily cost budget for the LLM-judge guardrail.
 *
 * Tracks cumulative per-day cost (in cents) of judge invocations in-memory.
 * Daily reset is triggered lazily on the first call after the UTC-midnight
 * boundary, so no background timer is needed.
 *
 * MULTI-INSTANCE NOTE: this counter is per-process. In a horizontally scaled
 * deployment with N replicas, cumulative spend across the fleet can be up to
 * N× the configured `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY`. Acceptable v1
 * trade-off documented in
 * `docs/security/2026-04-30-banking-grade-hardening-design.md` §6 F4.
 * Phase 2 plan: move counter to Redis (SET with ~25h TTL).
 */
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

interface BudgetState {
  /** UTC day boundary (`YYYY-MM-DD`) the counter is bound to. */
  day: string;
  /** Cumulative spend recorded today (in cents). */
  cumulativeCents: number;
}

let state: BudgetState = { day: '', cumulativeCents: 0 };

// Test seam — overrideable clock so the daily-reset path can be exercised
// without mocking Date globally. Untouched in production.
let nowProvider: () => Date = () => new Date();

const utcDayKey = (date: Date): string => {
  // YYYY-MM-DD in UTC. ISO substring keeps it deterministic across platforms.
  return date.toISOString().slice(0, 10);
};

/**
 * Auto-resets the counter when the UTC day rolled over since the last write.
 * Called from every public read/write so a process that idled across midnight
 * does not return stale exhaustion.
 */
const ensureCurrentDay = (): void => {
  const today = utcDayKey(nowProvider());
  if (state.day !== today) {
    state = { day: today, cumulativeCents: 0 };
  }
};

/**
 * Records a judge cost (in cents) against today's budget.
 *
 * Negative or zero costs are no-ops (defensive — callers should not pass
 * them but a misbehaving estimator should not corrupt the counter).
 *
 * @param cents Positive integer cost (cents). Fractional cents accepted.
 */
export const recordJudgeCost = (cents: number): void => {
  if (cents <= 0 || !Number.isFinite(cents)) return;
  ensureCurrentDay();
  state.cumulativeCents += cents;
};

/**
 * Returns true once today's cumulative cost has exceeded the configured cap.
 * Always inspect this BEFORE invoking the judge so we never go over budget.
 */
export const getBudgetExhausted = (): boolean => {
  ensureCurrentDay();
  const cap = env.guardrails.budgetCentsPerDay;
  if (cap <= 0) return true; // operator disabled the judge entirely
  return state.cumulativeCents >= cap;
};

/**
 * Force-clears today's counter. Used by tests + the optional nightly cron
 * (defensive — daily reset is otherwise lazy).
 */
export const resetBudget = (): void => {
  state = { day: utcDayKey(nowProvider()), cumulativeCents: 0 };
  logger.info('guardrail_judge_budget_reset', { day: state.day });
};

/**
 * Test-only seam: override the internal clock used for the day boundary check.
 * Pass `undefined` to restore the real clock. Never call from production code.
 */
export const __setNowForTest = (date: Date | undefined): void => {
  nowProvider = date ? () => date : () => new Date();
};
