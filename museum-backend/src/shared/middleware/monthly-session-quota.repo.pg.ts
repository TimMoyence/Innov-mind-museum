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
    interface QuotaRow {
      sessions_month_count: number;
      sessions_month_start: string;
    }
    const monthStartIso = monthStart.toISOString().slice(0, 10); // YYYY-MM-DD
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

    // TypeORM 0.3.28: `dataSource.query("UPDATE … RETURNING …")` returns the tuple
    // `[rows[], affectedCount]` on Postgres (e.g. `[[], 0]` / `[[{…}], 1]`), NOT a flat
    // `rows[]`. So `result.length` is always 2 — reading `result[0]` as a row is the bug.
    // Cf. lib-docs/typeorm/PATTERNS.md §4.10 + LESSONS 2026-05-08. Defensive guard tolerates a
    // future flat-shape (TypeORM v1.0 bump; 0.3.x repo archived, cf. CLAUDE.md §Dependency Monitoring):
    // tuple → `result[0]` is the rows array; flat/SELECT-like → `result` is the rows array.
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

  /**
   * UC-H12-01 (INV-1/INV-2) — compensating decrement for a slot consumed by
   * `tryConsume` whose downstream handler then failed with a 5xx.
   *
   * Idempotency / safety properties (all enforced in-SQL, single round trip):
   *  - Floor-guarded: `GREATEST(sessions_month_count - 1, 0)` never writes a
   *    negative count, so a double-arm (cannot happen — middleware latches —
   *    but defensive) or a count already at 0 is a harmless no-op clamp.
   *  - Month-scoped: `WHERE sessions_month_start = $2`. If a month rollover
   *    happened between consume and revert, the start no longer matches → 0
   *    rows updated → the freshly-reset new month is NOT decremented.
   *  - No `RETURNING` is read, so the TypeORM `[rows[], affectedCount]` tuple
   *    shape (PATTERNS.md §4.10) is irrelevant here — the result is discarded.
   *  - `tier`-agnostic by design: only free-tier rows are ever consumed (the
   *    middleware bypasses premium before `tryConsume`), and a premium row's
   *    `sessions_month_start` is never advanced by the consume path, so the
   *    month-scope guard already restricts the effect to consumed free rows.
   */
  async revertConsume(userId: number, monthStart: Date): Promise<void> {
    const monthStartIso = monthStart.toISOString().slice(0, 10); // YYYY-MM-DD
    await this.dataSource.query(
      `UPDATE "users"
            SET "sessions_month_count" = GREATEST("sessions_month_count" - 1, 0)
          WHERE "id" = $1
            AND "sessions_month_start" = $2`,
      [userId, monthStartIso],
    );
  }
}
