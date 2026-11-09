import { getTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { NextFunction, Request, Response } from 'express';

export interface MonthlyQuotaUserRow {
  id: number;
  tier: 'free' | 'premium';
  sessionsMonthCount: number;
  sessionsMonthStart: Date | null;
}

export interface MonthlyQuotaRepo {
  loadUser(userId: number): Promise<MonthlyQuotaUserRow | null>;
  tryConsume(
    userId: number,
    monthStart: Date,
    limit: number,
  ): Promise<{ sessionsMonthCount: number; sessionsMonthStart: Date } | null>;
  revertConsume?(userId: number, monthStart: Date): Promise<void>;
}

let repo: MonthlyQuotaRepo | null = null;

export const setMonthlyQuotaRepo = (next: MonthlyQuotaRepo | null): void => {
  repo = next;
  if (next === null) {
    loggedHits.clear();
  }
};

const loggedHits = new Set<string>();

const firstOfCurrentUtcMonth = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

const firstOfNextUtcMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
};

const utcMonthKey = (d: Date): string => {
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const resolveLimit = (): number => {
  const configured = env.freeTierMonthlySessionLimit;
  return Number.isFinite(configured) && configured > 0 ? configured : 3;
};

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

const emitQuotaExceeded = async (limit: number): Promise<void> => {
  try {
    await getTelemetryPort().emit({
      name: 'quota_exceeded',
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
    logger.warn('monthly_quota_repo_unwired', { userId: user.id });
    next();
    return;
  }

  const row = await repo.loadUser(user.id);
  if (!row || row.tier === 'premium') {
    next();
    return;
  }

  const limit = resolveLimit();
  const monthStart = firstOfCurrentUtcMonth();
  const consumeRepo = repo;
  const consumed = await consumeRepo.tryConsume(user.id, monthStart, limit);

  if (consumed) {
    let reverted = false;
    const compensateOnServerError = (): void => {
      if (reverted) return;
      if (res.statusCode < 500) return;
      reverted = true;
      const revert = consumeRepo.revertConsume?.bind(consumeRepo);
      if (!revert) return;
      void revert(user.id, monthStart).catch((err: unknown) => {
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
