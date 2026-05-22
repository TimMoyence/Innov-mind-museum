import { getTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
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

const resolveLimit = (): number => {
  // R13 fallback if env unset/non-numeric/≤0.
  const configured = env.freeTierMonthlySessionLimit;
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
};

/**
 * R12 dedup — log `quota_check_hit_limit` ONCE per (userId, month).
 * Subsequent 402s in the same window are silent.
 */
const logHitOnce = (
  userId: number,
  monthStart: Date,
  currentCount: number,
  limit: number,
): void => {
  const dedupKey = `${String(userId)}:${utcMonthKey(monthStart)}`;
  if (loggedHits.has(dedupKey)) return;
  loggedHits.add(dedupKey);
  logger.info('quota_check_hit_limit', {
    userId,
    monthStart: monthStart.toISOString(),
    currentCount,
    limit,
  });
};

/**
 * Wave C5 / T-C55 — emit `quota_exceeded` funnel event. Adapter is contractually
 * non-throwing (PATTERNS.md §5 anti-pattern #10 — analytics MUST NOT block user
 * requests). The try/catch is defense-in-depth against a stub port (tests).
 */
const emitQuotaExceeded = async (req: Request, limit: number): Promise<void> => {
  try {
    await getTelemetryPort().emit({
      name: 'quota_exceeded',
      // Synthetic URL — Plausible requires a `url` field ; `app://` scheme
      // segments BE-emitted events from web pageviews in the dashboard.
      url: 'app://musaium/api/chat/sessions',
      domain: env.plausible?.domain ?? 'musaium',
      props: {
        tier: 'free',
        limit,
      },
      userAgent: req.get('user-agent') ?? undefined,
      clientIp: req.ip ?? undefined,
    });
  } catch (err) {
    logger.warn('telemetry_emit_failed_in_quota_gate', {
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
};

/** N15: status MUST be 402 (NOT 429). Body shape pinned D4 / mobile interceptor R24. */
const respondQuotaExceeded = (res: Response, currentCount: number, limit: number): void => {
  res.status(402).json({
    code: 'QUOTA_EXCEEDED',
    tier: 'free',
    currentCount,
    limit,
    resetAt: firstOfNextUtcMonthIso(),
    message: 'Monthly free-tier session limit reached',
  });
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
  if (!row || row.tier === 'premium') {
    // Fail-OPEN for absent row (auth layer is source of truth) + premium bypass.
    next();
    return;
  }

  const limit = resolveLimit();
  const monthStart = firstOfCurrentUtcMonth();
  const consumed = await repo.tryConsume(user.id, monthStart, limit);

  if (consumed) {
    next();
    return;
  }

  logHitOnce(user.id, monthStart, row.sessionsMonthCount, limit);
  await emitQuotaExceeded(req, limit);
  respondQuotaExceeded(res, row.sessionsMonthCount, limit);
};
