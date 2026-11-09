import { User } from '@modules/auth/domain/user/user.entity';

import type {
  MonthlyQuotaRepo,
  MonthlyQuotaUserRow,
} from '@shared/middleware/monthly-session-quota.middleware';
import type { DataSource } from 'typeorm';

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

  async tryConsume(
    userId: number,
    monthStart: Date,
    limit: number,
  ): Promise<{ sessionsMonthCount: number; sessionsMonthStart: Date } | null> {
    interface QuotaRow {
      sessions_month_count: number;
      sessions_month_start: string;
    }
    const monthStartIso = monthStart.toISOString().slice(0, 10);
    const result: unknown = await this.dataSource.query(
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

    const rows: QuotaRow[] =
      Array.isArray(result) && Array.isArray(result[0])
        ? (result[0] as QuotaRow[])
        : ((result as QuotaRow[] | undefined) ?? []);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    return {
      sessionsMonthCount: row.sessions_month_count,
      sessionsMonthStart: new Date(row.sessions_month_start),
    };
  }

  async revertConsume(userId: number, monthStart: Date): Promise<void> {
    const monthStartIso = monthStart.toISOString().slice(0, 10);
    await this.dataSource.query(
      `UPDATE "users"
            SET "sessions_month_count" = GREATEST("sessions_month_count" - 1, 0)
          WHERE "id" = $1
            AND "sessions_month_start" = $2`,
      [userId, monthStartIso],
    );
  }
}
