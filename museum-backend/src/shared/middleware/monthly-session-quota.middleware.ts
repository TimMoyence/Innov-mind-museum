import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { NextFunction, Request, Response } from 'express';

/**
 * R1 (C6) — Per-UTC-month session-create cap on `tier='free'` (POST /api/sessions).
 * Premium + anonymous bypass. Cap-exhausted → 402 Payment Required with fixed body
 * (mobile axios interceptor R8/R24).
 *
 * Single atomic UPDATE-with-WHERE (R11/N13) — no read-then-write race between
 * concurrent multi-device POSTs (Postgres row lock serializes; second sees count
 * re-evaluated → 0 rows → 402).
 *
 * `quota_check_hit_limit` log fires ONCE per (userId, month) (R12) — subsequent
 * 402s silent. In-memory dedup keyed `${userId}:${YYYY-MM}`.
 *
 * Inject `setMonthlyQuotaRepo` at boot (`PgMonthlyQuotaRepo(AppDataSource)`).
 */

export interface MonthlyQuotaUserRow {
  id: number;
  tier: 'free' | 'premium';
  sessionsMonthCount: number;
  sessionsMonthStart: Date | null;
}

/** Atomic single `UPDATE … WHERE … RETURNING …`. Returns `null` when WHERE refused. */
export interface MonthlyQuotaRepo {
  loadUser(userId: number): Promise<MonthlyQuotaUserRow | null>;
  tryConsume(
    userId: number,
    monthStart: Date,
    limit: number,
  ): Promise<{ sessionsMonthCount: number; sessionsMonthStart: Date } | null>;
}

let repo: MonthlyQuotaRepo | null = null;

/** Pass `null` for test teardown — also clears dedup state. */
export const setMonthlyQuotaRepo = (next: MonthlyQuotaRepo | null): void => {
  repo = next;
  if (next === null) {
    loggedHits.clear();
  }
};

/** R12 dedup — bounded by users × months in prod. */
const loggedHits = new Set<string>();

const firstOfCurrentUtcMonth = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

/** N5 `resetAt`. */
const firstOfNextUtcMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
};

const utcMonthKey = (d: Date): string => {
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

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
    // Fail-OPEN — deploy ordering glitch (Risk10) must not lock out session-create.
    logger.warn('monthly_quota_repo_unwired', { userId: user.id });
    next();
    return;
  }

  const row = await repo.loadUser(user.id);
  if (!row) {
    // Fail-OPEN — auth layer is source of truth; branch should be unreachable.
    next();
    return;
  }

  if (row.tier === 'premium') {
    next();
    return;
  }

  // R13 fallback if env unset/non-numeric/≤0.
  const configured = env.freeTierMonthlySessionLimit;
  const limit = Number.isFinite(configured) && configured > 0 ? configured : 3;

  const monthStart = firstOfCurrentUtcMonth();
  const consumed = await repo.tryConsume(user.id, monthStart, limit);

  if (consumed) {
    next();
    return;
  }

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

  // N15: status MUST be 402 (NOT 429). Body shape pinned D4/mobile interceptor R24.
  res.status(402).json({
    code: 'QUOTA_EXCEEDED',
    tier: 'free',
    currentCount: row.sessionsMonthCount,
    limit,
    resetAt: firstOfNextUtcMonthIso(),
    message: 'Monthly free-tier session limit reached',
  });
};
