import pool from '@data/db';
import type { IAdminRepository } from '../../domain/admin.repository.interface';
import type {
  PaginatedResult,
  AdminUserDTO,
  ListUsersFilters,
  AdminAuditLogDTO,
  ListAuditLogsFilters,
  AdminStats,
  AdminReportDTO,
  ListReportsFilters,
  ResolveReportInput,
  UsageAnalytics,
  UsageAnalyticsFilters,
  ContentAnalytics,
  ContentAnalyticsFilters,
  EngagementAnalytics,
  EngagementAnalyticsFilters,
  AnalyticsGranularity,
} from '../../domain/admin.types';

const SAFE_USER_COLUMNS =
  'id, email, firstname, lastname, role, email_verified AS "emailVerified", "createdAt", "updatedAt"';

/** Map a raw user row to an AdminUserDTO with ISO date strings. */
function mapUserRow(row: Record<string, unknown>): AdminUserDTO {
  return {
    id: row.id as number,
    email: row.email as string,
    firstname: (row.firstname as string) ?? null,
    lastname: (row.lastname as string) ?? null,
    role: row.role as string,
    emailVerified: row.emailVerified as boolean,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

/** Map a raw report row (JOINed with chat_messages) to an AdminReportDTO. */
function mapReportRow(row: Record<string, unknown>): AdminReportDTO {
  return {
    id: row.id as string,
    messageId: row.messageId as string,
    userId: row.userId as number,
    reason: row.reason as string,
    comment: (row.comment as string) ?? null,
    status: row.status as AdminReportDTO['status'],
    reviewedBy: (row.reviewedBy as number) ?? null,
    reviewedAt: row.reviewedAt ? (row.reviewedAt as Date).toISOString() : null,
    reviewerNotes: (row.reviewerNotes as string) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
    messageText: (row.messageText as string) ?? null,
    messageRole: row.messageRole as string,
    sessionId: row.sessionId as string,
  };
}

/** Map a granularity string to a PostgreSQL date_trunc unit. */
function granularityToTrunc(g: AnalyticsGranularity): string {
  switch (g) {
    case 'daily':
      return 'day';
    case 'weekly':
      return 'week';
    case 'monthly':
      return 'month';
  }
}

/** Map a raw audit_logs row to an AdminAuditLogDTO with ISO date strings. */
function mapAuditRow(row: Record<string, unknown>): AdminAuditLogDTO {
  return {
    id: row.id as string,
    action: row.action as string,
    actorType: row.actor_type as string,
    actorId: (row.actor_id as number) ?? null,
    targetType: (row.target_type as string) ?? null,
    targetId: (row.target_id as string) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    ip: (row.ip as string) ?? null,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

/** PostgreSQL implementation of the admin repository. */
export class AdminRepositoryPg implements IAdminRepository {
  async listUsers(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.search) {
      const pattern = `%${filters.search}%`;
      conditions.push(
        `(email ILIKE $${idx} OR firstname ILIKE $${idx} OR lastname ILIKE $${idx})`,
      );
      values.push(pattern);
      idx++;
    }

    if (filters.role) {
      conditions.push(`role = $${idx}`);
      values.push(filters.role);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM "users" ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await pool.query(
      `SELECT ${SAFE_USER_COLUMNS} FROM "users" ${where} ORDER BY "createdAt" DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapUserRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async changeUserRole(userId: number, newRole: string): Promise<AdminUserDTO | null> {
    const result = await pool.query(
      `UPDATE "users" SET role = $1 WHERE id = $2 RETURNING ${SAFE_USER_COLUMNS}`,
      [newRole, userId],
    );

    if (result.rows.length === 0) return null;
    return mapUserRow(result.rows[0]);
  }

  async countAdmins(): Promise<number> {
    const result = await pool.query(
      `SELECT COUNT(*) AS count FROM "users" WHERE role = 'admin'`,
    );
    return parseInt(result.rows[0].count as string, 10);
  }

  async listAuditLogs(
    filters: ListAuditLogsFilters,
  ): Promise<PaginatedResult<AdminAuditLogDTO>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.action) {
      conditions.push(`action = $${idx}`);
      values.push(filters.action);
      idx++;
    }

    if (filters.actorId !== undefined) {
      conditions.push(`actor_id = $${idx}`);
      values.push(filters.actorId);
      idx++;
    }

    if (filters.targetType) {
      conditions.push(`target_type = $${idx}`);
      values.push(filters.targetType);
      idx++;
    }

    if (filters.dateFrom) {
      conditions.push(`created_at >= $${idx}`);
      values.push(filters.dateFrom);
      idx++;
    }

    if (filters.dateTo) {
      conditions.push(`created_at <= $${idx}`);
      values.push(filters.dateTo);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM "audit_logs" ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await pool.query(
      `SELECT * FROM "audit_logs" ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapAuditRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats(): Promise<AdminStats> {
    const [usersResult, sessionsResult, messagesResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          role,
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days') AS recent
        FROM "users"
        GROUP BY role
      `),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days') AS recent
        FROM "chat_sessions"
      `),
      pool.query(`SELECT COUNT(*) AS total FROM "chat_messages"`),
    ]);

    let totalUsers = 0;
    let recentSignups = 0;
    const usersByRole: Record<string, number> = {};

    for (const row of usersResult.rows) {
      const count = parseInt(row.total as string, 10);
      const recent = parseInt(row.recent as string, 10);
      totalUsers += count;
      recentSignups += recent;
      usersByRole[row.role as string] = count;
    }

    return {
      totalUsers,
      usersByRole,
      totalSessions: parseInt(sessionsResult.rows[0]?.total as string, 10) || 0,
      totalMessages: parseInt(messagesResult.rows[0]?.total as string, 10) || 0,
      recentSignups,
      recentSessions: parseInt(sessionsResult.rows[0]?.recent as string, 10) || 0,
    };
  }

  // ─── Content Moderation (S4-03) ───

  async listReports(
    filters: ListReportsFilters,
  ): Promise<PaginatedResult<AdminReportDTO>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`r."status" = $${idx}`);
      values.push(filters.status);
      idx++;
    }

    if (filters.reason) {
      conditions.push(`r."reason" = $${idx}`);
      values.push(filters.reason);
      idx++;
    }

    if (filters.dateFrom) {
      conditions.push(`r."createdAt" >= $${idx}`);
      values.push(filters.dateFrom);
      idx++;
    }

    if (filters.dateTo) {
      conditions.push(`r."createdAt" <= $${idx}`);
      values.push(filters.dateTo);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM "message_reports" r ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await pool.query(
      `SELECT
        r."id", r."messageId", r."userId", r."reason", r."comment",
        r."status", r."reviewedBy", r."reviewedAt", r."reviewerNotes",
        r."createdAt",
        m."text" AS "messageText", m."role" AS "messageRole",
        m."sessionId" AS "sessionId"
      FROM "message_reports" r
      JOIN "chat_messages" m ON m."id" = r."messageId"
      ${where}
      ORDER BY r."createdAt" DESC
      LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapReportRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async resolveReport(input: ResolveReportInput): Promise<AdminReportDTO | null> {
    const result = await pool.query(
      `UPDATE "message_reports"
       SET "status" = $1, "reviewedBy" = $2, "reviewedAt" = NOW(), "reviewerNotes" = $3
       WHERE "id" = $4
       RETURNING *`,
      [input.status, input.reviewedBy, input.reviewerNotes ?? null, input.reportId],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    // Fetch joined message data
    const msgResult = await pool.query(
      `SELECT "text", "role", "sessionId" FROM "chat_messages" WHERE "id" = $1`,
      [row.messageId],
    );

    const msg = msgResult.rows[0] ?? {};
    return mapReportRow({
      ...row,
      messageText: msg.text ?? null,
      messageRole: msg.role ?? 'unknown',
      sessionId: msg.sessionId ?? '',
    });
  }

  // ─── Analytics (S4-04) ───

  async getUsageAnalytics(filters: UsageAnalyticsFilters): Promise<UsageAnalytics> {
    const granularity: AnalyticsGranularity = filters.granularity ?? 'daily';
    const trunc = granularityToTrunc(granularity);
    const days = filters.days ?? 30;

    const dateParts: string[] = [];
    const baseValues: unknown[] = [];
    let pIdx = 1;

    if (filters.from) {
      dateParts.push(`"createdAt" >= $${pIdx}`);
      baseValues.push(filters.from);
      pIdx++;
    } else {
      dateParts.push(`"createdAt" >= NOW() - INTERVAL '${days} days'`);
    }

    if (filters.to) {
      dateParts.push(`"createdAt" <= $${pIdx}`);
      baseValues.push(filters.to);
      pIdx++;
    }

    const dateFilter = dateParts.join(' AND ');

    const [sessionsResult, messagesResult, activeUsersResult] = await Promise.all([
      pool.query(
        `SELECT date_trunc('${trunc}', "createdAt") AS d, COUNT(*) AS c
         FROM "chat_sessions" WHERE ${dateFilter}
         GROUP BY d ORDER BY d`,
        baseValues,
      ),
      pool.query(
        `SELECT date_trunc('${trunc}', "createdAt") AS d, COUNT(*) AS c
         FROM "chat_messages" WHERE ${dateFilter}
         GROUP BY d ORDER BY d`,
        baseValues,
      ),
      pool.query(
        `SELECT date_trunc('${trunc}', "createdAt") AS d, COUNT(DISTINCT "userId") AS c
         FROM "chat_sessions"
         WHERE ${dateFilter} AND "userId" IS NOT NULL
         GROUP BY d ORDER BY d`,
        baseValues,
      ),
    ]);

    const mapTs = (rows: Record<string, unknown>[]) =>
      rows.map((r) => ({
        date: (r.d as Date).toISOString().slice(0, 10),
        count: parseInt(r.c as string, 10),
      }));

    return {
      period: {
        from: filters.from ?? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
        to: filters.to ?? new Date().toISOString().slice(0, 10),
      },
      granularity,
      sessionsCreated: mapTs(sessionsResult.rows),
      messagesSent: mapTs(messagesResult.rows),
      activeUsers: mapTs(activeUsersResult.rows),
    };
  }

  async getContentAnalytics(filters: ContentAnalyticsFilters): Promise<ContentAnalytics> {
    const limit = filters.limit ?? 10;
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.from) {
      conditions.push(`"createdAt" >= $${idx}`);
      values.push(filters.from);
      idx++;
    }
    if (filters.to) {
      conditions.push(`"createdAt" <= $${idx}`);
      values.push(filters.to);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [artworksResult, museumsResult, guardrailResult] = await Promise.all([
      pool.query(
        `SELECT a."title", a."artist", COUNT(*) AS c
         FROM "artwork_matches" a
         ${where}
         GROUP BY a."title", a."artist"
         ORDER BY c DESC
         LIMIT $${idx}`,
        [...values, limit],
      ),
      pool.query(
        `SELECT "museumName" AS name, COUNT(*) AS c
         FROM "chat_sessions"
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE'} "museumName" IS NOT NULL
         GROUP BY "museumName"
         ORDER BY c DESC
         LIMIT $${idx}`,
        [...values, limit],
      ),
      (async () => {
        const guardrailWhere: string[] = [];
        const gValues: unknown[] = [];
        let gIdx = 1;

        if (filters.from) {
          guardrailWhere.push(`created_at >= $${gIdx}`);
          gValues.push(filters.from);
          gIdx++;
        }
        if (filters.to) {
          guardrailWhere.push(`created_at <= $${gIdx}`);
          gValues.push(filters.to);
          gIdx++;
        }

        const gWhere = guardrailWhere.length > 0
          ? `WHERE ${guardrailWhere.join(' AND ')}`
          : '';

        const totalRes = await pool.query(
          `SELECT COUNT(*) AS total FROM "audit_logs" ${gWhere}`,
          gValues,
        );
        const blockedRes = await pool.query(
          `SELECT COUNT(*) AS total FROM "audit_logs"
           ${gWhere ? gWhere + ` AND action = 'SECURITY_GUARDRAIL_BLOCK'` : `WHERE action = 'SECURITY_GUARDRAIL_BLOCK'`}`,
          gValues,
        );

        const total = parseInt(totalRes.rows[0].total as string, 10);
        const blocked = parseInt(blockedRes.rows[0].total as string, 10);
        return total > 0 ? blocked / total : 0;
      })(),
    ]);

    return {
      topArtworks: artworksResult.rows.map((r: Record<string, unknown>) => ({
        title: (r.title as string) ?? 'Unknown',
        artist: (r.artist as string) ?? null,
        count: parseInt(r.c as string, 10),
      })),
      topMuseums: museumsResult.rows.map((r: Record<string, unknown>) => ({
        name: r.name as string,
        count: parseInt(r.c as string, 10),
      })),
      guardrailBlockRate: guardrailResult as number,
    };
  }

  async getEngagementAnalytics(filters: EngagementAnalyticsFilters): Promise<EngagementAnalytics> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.from) {
      conditions.push(`s."createdAt" >= $${idx}`);
      values.push(filters.from);
      idx++;
    }
    if (filters.to) {
      conditions.push(`s."createdAt" <= $${idx}`);
      values.push(filters.to);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [avgMsgResult, avgDurationResult, returnRateResult] = await Promise.all([
      pool.query(
        `SELECT COALESCE(AVG(msg_count), 0) AS avg_msg
         FROM (
           SELECT s."id", COUNT(m."id") AS msg_count
           FROM "chat_sessions" s
           LEFT JOIN "chat_messages" m ON m."sessionId" = s."id"
           ${where}
           GROUP BY s."id"
         ) sub`,
        values,
      ),
      pool.query(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (s."updatedAt" - s."createdAt")) / 60), 0) AS avg_dur
         FROM "chat_sessions" s
         ${where}`,
        values,
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT s."userId") AS total_unique,
           COUNT(DISTINCT s."userId") FILTER (WHERE s."userId" IN (
             SELECT sub."userId" FROM "chat_sessions" sub
             ${conditions.length > 0 ? `WHERE ${conditions.map((c) => c.replace(/s\./g, 'sub.')).join(' AND ')}` : ''}
             GROUP BY sub."userId" HAVING COUNT(*) > 1
           )) AS returning_users
         FROM "chat_sessions" s
         ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} AND` : 'WHERE'} s."userId" IS NOT NULL`,
        values,
      ),
    ]);

    const totalUniqueUsers = parseInt(returnRateResult.rows[0]?.total_unique as string, 10) || 0;
    const returningUsers = parseInt(returnRateResult.rows[0]?.returning_users as string, 10) || 0;

    return {
      avgMessagesPerSession: parseFloat(avgMsgResult.rows[0]?.avg_msg as string) || 0,
      avgSessionDurationMinutes: parseFloat(avgDurationResult.rows[0]?.avg_dur as string) || 0,
      returnUserRate: totalUniqueUsers > 0 ? returningUsers / totalUniqueUsers : 0,
      totalUniqueUsers,
      returningUsers,
    };
  }
}
