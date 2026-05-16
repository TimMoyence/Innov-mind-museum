import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { NextFunction, Request, Response } from 'express';

/**
 * R1 (C6) — Monthly session-creation quota middleware.
 *
 * Enforces a per-UTC-month session-creation cap on `tier='free'` users hitting
 * `POST /api/sessions`. `premium` and anonymous requests pass through without
 * a DB hit. Quota-exhausted responses return `402 Payment Required` with a
 * fixed body shape the mobile axios interceptor recognises (R8 / R24).
 *
 * Single atomic UPDATE-with-WHERE-condition (R11 / N13) — no read-then-write
 * race window between concurrent multi-device requests. Two simultaneous
 * POSTs from the same user serialise on the PostgreSQL row lock during
 * UPDATE ; the second sees `sessions_month_count < $limit` re-evaluated to
 * false and gets 0 rows → 402.
 *
 * The `quota_check_hit_limit` log fires exactly ONCE per (userId, month)
 * tuple (R12) — subsequent 402s in the same month are silent to keep the
 * funnel clean. In-memory dedup ; cleared on month rollover via the same
 * key shape (`${userId}:${YYYY-MM}`).
 *
 * The repository contract is injected via `setMonthlyQuotaRepo` (setter
 * pattern) so unit tests don't need a real DataSource. Production wiring
 * happens at app boot — see `app.ts` (`setMonthlyQuotaRepo(new
 * PgMonthlyQuotaRepo(AppDataSource))`).
 */

/** Minimal projection of the user row needed to decide the quota branch. */
export interface MonthlyQuotaUserRow {
  id: number;
  tier: 'free' | 'premium';
  sessionsMonthCount: number;
  sessionsMonthStart: Date | null;
}

/**
 * Atomic-update contract for the monthly counter. `tryConsume` runs a single
 * `UPDATE … WHERE … RETURNING …` ; returns the post-update counters when the
 * row was bumped, or `null` when the WHERE clause refused (quota exhausted).
 */
export interface MonthlyQuotaRepo {
  loadUser(userId: number): Promise<MonthlyQuotaUserRow | null>;
  tryConsume(
    userId: number,
    monthStart: Date,
    limit: number,
  ): Promise<{ sessionsMonthCount: number; sessionsMonthStart: Date } | null>;
}

let repo: MonthlyQuotaRepo | null = null;

/**
 * Registers the repository implementation backing `monthlySessionQuota`. Pass
 * `null` to clear (test teardown). Mirror of `setDailyChatLimitCacheService`
 * setter pattern.
 */
export const setMonthlyQuotaRepo = (next: MonthlyQuotaRepo | null): void => {
  repo = next;
  // Clear dedup state on setter reset so unit tests starting from scratch
  // re-emit the first-hit log. The dedup Set is bounded by users × months
  // in prod ; restart is rare and the only growth vector is unique
  // (userId, month) tuples per process lifetime.
  if (next === null) {
    loggedHits.clear();
  }
};

/** In-memory dedup for the `quota_check_hit_limit` log (R12). */
const loggedHits = new Set<string>();

/** Returns the first-day-of-current-UTC-month as a Date. */
const firstOfCurrentUtcMonth = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

/** Returns the first-day-of-NEXT-UTC-month ISO string (N5 `resetAt`). */
const firstOfNextUtcMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
};

/** `YYYY-MM` for the supplied date in UTC — used as the dedup key suffix. */
const utcMonthKey = (d: Date): string => {
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Reads `req.user` ; on `tier='free'` enforces the monthly quota via an
 * atomic UPDATE. Premium users bypass (next without DB hit). Anonymous users
 * bypass (mirror `dailyChatLimit` N14).
 */
export const monthlySessionQuota = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const user = req.user;
  if (!user?.id) {
    next();
    return;
  }

  if (!repo) {
    // Defensive — middleware mounted but no repo wired. Fail-OPEN (next)
    // so a deploy ordering glitch (Risk10) does not lock out legitimate
    // session-create. Operator sees the warn-level log.
    logger.warn('monthly_quota_repo_unwired', { userId: user.id });
    next();
    return;
  }

  const row = await repo.loadUser(user.id);
  if (!row) {
    // No row — fail-OPEN ; auth layer is the source of truth, this branch
    // should be unreachable in practice.
    next();
    return;
  }

  // R5 — premium tier short-circuits.
  if (row.tier === 'premium') {
    next();
    return;
  }

  // R13 — fallback if the env is unset / non-numeric / ≤ 0.
  const configured = env.freeTierMonthlySessionLimit;
  const limit = Number.isFinite(configured) && configured > 0 ? configured : 3;

  const monthStart = firstOfCurrentUtcMonth();
  const consumed = await repo.tryConsume(user.id, monthStart, limit);

  if (consumed) {
    // R6 / R7 — atomic UPDATE bumped the counter (reset+1 on rollover, or
    // increment on same month). Request proceeds.
    next();
    return;
  }

  // R8 — quota exhausted. Emit single log per (user, month) per R12.
  const dedupKey = `${String(user.id)}:${utcMonthKey(monthStart)}`;
  if (!loggedHits.has(dedupKey)) {
    loggedHits.add(dedupKey);
    logger.info('quota_check_hit_limit', {
      userId: user.id,
      monthStart: monthStart.toISOString(),
      currentCount: row.sessionsMonthCount,
      limit,
    });
  }

  // N15 — status MUST be 402 (Payment Required), NOT 429. Body shape pinned
  // by D4 / mobile interceptor branch (R24).
  res.status(402).json({
    code: 'QUOTA_EXCEEDED',
    tier: 'free',
    currentCount: row.sessionsMonthCount,
    limit,
    resetAt: firstOfNextUtcMonthIso(),
    message: 'Monthly free-tier session limit reached',
  });
};
