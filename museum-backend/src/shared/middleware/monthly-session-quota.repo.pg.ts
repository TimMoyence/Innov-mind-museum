import { User } from '@modules/auth/domain/user/user.entity';

import type {
  MonthlyQuotaRepo,
  MonthlyQuotaUserRow,
} from '@shared/middleware/monthly-session-quota.middleware';
import type { DataSource } from 'typeorm';

/**
 * R1 (C6) — atomic single-SQL increment/reset (R1 §3.2 D2). WHERE clause refuses (0 rows)
 * when `sessions_month_count >= limit` on same month → no read-modify-write race (R11).
 * CASE handles same-month-increment AND month-rollover-reset in one round trip.
 */
export class PgMonthlyQuotaRepo implements MonthlyQuotaRepo {
  constructor(private readonly dataSource: DataSource) {}

  async loadUser(userId: number): Promise<MonthlyQuotaUserRow | null> {
    const repo = this.dataSource.getRepository(User);
    const row = await repo.findOne({
      where: { id: userId },
      select: ['id', 'tier', 'sessionsMonthCount', 'sessionsMonthStart'],
    });
    if (!row) return null;
    return {
      id: row.id,
      tier: row.tier,
      sessionsMonthCount: row.sessionsMonthCount,
      sessionsMonthStart: row.sessionsMonthStart ?? null,
    };
  }

  /** Returns post-update counters or `null` when WHERE refused (quota exhausted same month). */
  async tryConsume(
    userId: number,
    monthStart: Date,
    limit: number,
  ): Promise<{ sessionsMonthCount: number; sessionsMonthStart: Date } | null> {
    const monthStartIso = monthStart.toISOString().slice(0, 10); // YYYY-MM-DD
    const result: { sessions_month_count: number; sessions_month_start: string }[] =
      await this.dataSource.query(
        `UPDATE "users"
            SET "sessions_month_count" =
                  CASE
                    WHEN "sessions_month_start" = $2 THEN "sessions_month_count" + 1
                    ELSE 1
                  END,
                "sessions_month_start" = $2
          WHERE "id" = $1
            AND "tier" = 'free'
            AND (
              "sessions_month_start" IS NULL
              OR "sessions_month_start" <> $2
              OR "sessions_month_count" < $3
            )
          RETURNING "sessions_month_count", "sessions_month_start"`,
        [userId, monthStartIso, limit],
      );

    if (result.length === 0) return null;
    const row = result[0];
    return {
      sessionsMonthCount: row.sessions_month_count,
      sessionsMonthStart: new Date(row.sessions_month_start),
    };
  }
}
