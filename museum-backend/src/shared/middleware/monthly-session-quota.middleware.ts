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
  /**
   * UC-H12-01 (INV-1/INV-2) — compensating decrement for a slot consumed by
   * `tryConsume` whose downstream handler then failed with a 5xx. Idempotent +
   * floor-guarded (`GREATEST(count-1, 0)` — never below 0) and month-scoped
   * (only decrements while `sessions_month_start = monthStart`, so a month
   * rollover between consume and revert is a no-op and never underflows the new
   * month). Called at most once per request (latched `res.on('finish')`).
   *
   * OPTIONAL by design: the prod `PgMonthlyQuotaRepo` always provides it, but
   * older stub repos (which only ever drove the 402-on-`null`-consume or the
   * consume-call-count paths, never reaching the 5xx-revert branch) omit it. The
   * middleware guards the call (`consumeRepo.revertConsume?.(...)`), so a stub
   * that never reaches a 5xx after a successful consume is unaffected.
   */
  revertConsume?(userId: number, monthStart: Date): Promise<void>;
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
 *
 * C3.1 (RGPD) — `userAgent`/`clientIp` are deliberately OMITTED. This event is
 * emitted server-side without any analytics-consent signal (consent state lives
 * client-side), and the visitor IP / User-Agent are personal data (RGPD Art.
 * 4(1), CJUE C-582/14 Breyer). The telemetry port declares both fields optional
 * (`telemetry.port.ts`) and the Plausible adapter only sets the matching headers
 * under an `if (event.userAgent)` / `if (event.clientIp)` guard, so omitting them
 * at the source removes the PII transmission entirely (recital 26 — anonymous
 * data, no legal basis required).
 */
const emitQuotaExceeded = async (limit: number): Promise<void> => {
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
  // Capture a stable repo reference for the deferred revert closure — the
  // module-level `repo` is reassignable (`setMonthlyQuotaRepo`), and the
  // response may finish after a swap (e.g. test teardown).
  const consumeRepo = repo;
  const consumed = await consumeRepo.tryConsume(user.id, monthStart, limit);

  if (consumed) {
    // UC-H12-01 (INV-1/INV-2) — a slot was just burned in the persisted row,
    // BEFORE the handler ran. If the handler ultimately fails with a 5xx, the
    // user got no session, so the consume MUST be compensated. Arm a latched
    // `res.on('finish')` (mirrors upload-admission.middleware.ts:31) that
    // decrements EXACTLY ONCE and ONLY on a 5xx. 2xx/4xx (incl. the 402 path,
    // which never reaches here) leave the counter untouched.
    let reverted = false;
    const compensateOnServerError = (): void => {
      if (reverted) return;
      if (res.statusCode < 500) return;
      reverted = true;
      // Guarded: `revertConsume` is optional on the port (older stubs omit it).
      // Prod `PgMonthlyQuotaRepo` always provides it. Bind to preserve `this`.
      const revert = consumeRepo.revertConsume?.bind(consumeRepo);
      if (!revert) return;
      void revert(user.id, monthStart).catch((err: unknown) => {
        // Fail-OPEN: a failed revert must not crash the (already-failed)
        // response. Worst case the counter stays inflated by one — logged for
        // ops follow-up, never thrown.
        logger.warn('monthly_quota_revert_failed', {
          userId: user.id,
          monthStart: monthStart.toISOString(),
          error: err instanceof Error ? err.message : 'unknown',
        });
      });
    };
    res.on('finish', compensateOnServerError);
    next();
    return;
  }

  logHitOnce(user.id, monthStart, row.sessionsMonthCount, limit);
  await emitQuotaExceeded(limit);
  respondQuotaExceeded(res, row.sessionsMonthCount, limit);
};
