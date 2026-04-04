import { User } from '@modules/auth/domain/user.entity';
import { ArtworkMatch } from '@modules/chat/domain/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { MessageReport } from '@modules/chat/domain/messageReport.entity';
import { AuditLog } from '@shared/audit/auditLog.entity';

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
import type { DataSource, Repository } from 'typeorm';

/** Map a User entity to an AdminUserDTO with ISO date strings. */
function mapUser(user: User): AdminUserDTO {
  return {
    id: user.id,
    email: user.email,
    firstname: user.firstname ?? null,
    lastname: user.lastname ?? null,
    role: user.role,
    emailVerified: user.email_verified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** Map a raw report row (JOINed with chat_messages) to an AdminReportDTO. */
function mapReport(report: MessageReport, message?: ChatMessage): AdminReportDTO {
  return {
    id: report.id,
    messageId: report.messageId,
    userId: report.userId,
    reason: report.reason,
    comment: report.comment ?? null,
    status: report.status as AdminReportDTO['status'],
    reviewedBy: report.reviewedBy ?? null,
    reviewedAt: report.reviewedAt ? report.reviewedAt.toISOString() : null,
    reviewerNotes: report.reviewerNotes ?? null,
    createdAt: report.createdAt.toISOString(),
    messageText: message?.text ?? null,
    messageRole: message?.role ?? 'unknown',
    sessionId: message?.sessionId ?? '',
  };
}

/** Map an AuditLog entity to an AdminAuditLogDTO with ISO date strings. */
function mapAuditLog(log: AuditLog): AdminAuditLogDTO {
  return {
    id: log.id,
    action: log.action,
    actorType: log.actorType,
    actorId: log.actorId ?? null,
    targetType: log.targetType ?? null,
    targetId: log.targetId ?? null,
    metadata: log.metadata ?? null,
    ip: log.ip ?? null,
    createdAt: log.createdAt.toISOString(),
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

/** PostgreSQL implementation of the admin repository using TypeORM. */
export class AdminRepositoryPg implements IAdminRepository {
  private readonly userRepo: Repository<User>;
  private readonly auditRepo: Repository<AuditLog>;
  private readonly reportRepo: Repository<MessageReport>;
  private readonly sessionRepo: Repository<ChatSession>;
  private readonly messageRepo: Repository<ChatMessage>;

  constructor(private readonly dataSource: DataSource) {
    this.userRepo = dataSource.getRepository(User);
    this.auditRepo = dataSource.getRepository(AuditLog);
    this.reportRepo = dataSource.getRepository(MessageReport);
    this.sessionRepo = dataSource.getRepository(ChatSession);
    this.messageRepo = dataSource.getRepository(ChatMessage);
  }

  /** Retrieves a paginated list of users with optional search and role filters. */
  async listUsers(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>> {
    const qb = this.userRepo.createQueryBuilder('user');

    if (filters.search) {
      const pattern = `%${filters.search}%`;
      qb.where(
        '(user.email ILIKE :search OR user.firstname ILIKE :search OR user.lastname ILIKE :search)',
        { search: pattern },
      );
    }

    if (filters.role) {
      qb.andWhere('user.role = :role', { role: filters.role });
    }

    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const [users, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      data: users.map(mapUser),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Updates the role of a user and returns the updated record. */
  async changeUserRole(userId: number, newRole: string): Promise<AdminUserDTO | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;

    user.role = newRole as User['role'];
    const saved = await this.userRepo.save(user);
    return mapUser(saved);
  }

  /** Returns the total number of users with the admin role. */
  async countAdmins(): Promise<number> {
    return await this.userRepo.countBy({ role: 'admin' });
  }

  /** Retrieves a paginated list of audit log entries with optional filters. */
  async listAuditLogs(filters: ListAuditLogsFilters): Promise<PaginatedResult<AdminAuditLogDTO>> {
    const qb = this.auditRepo.createQueryBuilder('log');

    if (filters.action) {
      qb.andWhere('log.action = :action', { action: filters.action });
    }

    if (filters.actorId !== undefined) {
      qb.andWhere('log.actorId = :actorId', { actorId: filters.actorId });
    }

    if (filters.targetType) {
      qb.andWhere('log.targetType = :targetType', { targetType: filters.targetType });
    }

    if (filters.dateFrom) {
      qb.andWhere('log.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('log.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const [logs, total] = await qb
      .orderBy('log.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      data: logs.map(mapAuditLog),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Aggregates dashboard statistics including user counts, sessions, and messages. */
  async getStats(): Promise<AdminStats> {
    const [usersResult, sessionsResult, messagesResult] = await Promise.all([
      this.userRepo
        .createQueryBuilder('user')
        .select('user.role', 'role')
        .addSelect('COUNT(*)', 'total')
        .addSelect(
          'COUNT(*) FILTER (WHERE user."createdAt" >= NOW() - INTERVAL \'7 days\')',
          'recent',
        )
        .groupBy('user.role')
        .getRawMany<{ role: string; total: string; recent: string }>(),
      this.sessionRepo
        .createQueryBuilder('session')
        .select('COUNT(*)', 'total')
        .addSelect(
          'COUNT(*) FILTER (WHERE session."createdAt" >= NOW() - INTERVAL \'7 days\')',
          'recent',
        )
        .getRawOne<{ total: string; recent: string }>(),
      this.messageRepo
        .createQueryBuilder('message')
        .select('COUNT(*)', 'total')
        .getRawOne<{ total: string }>(),
    ]);

    let totalUsers = 0;
    let recentSignups = 0;
    const usersByRole: Record<string, number> = {};

    for (const row of usersResult) {
      const count = Number.parseInt(row.total, 10);
      const recent = Number.parseInt(row.recent, 10);
      totalUsers += count;
      recentSignups += recent;
      usersByRole[row.role] = count;
    }

    return {
      totalUsers,
      usersByRole,
      totalSessions: Number.parseInt(sessionsResult?.total ?? '0', 10),
      totalMessages: Number.parseInt(messagesResult?.total ?? '0', 10),
      recentSignups,
      recentSessions: Number.parseInt(sessionsResult?.recent ?? '0', 10),
    };
  }

  // ─── Content Moderation (S4-03) ───

  /** Retrieves a paginated list of message reports with optional status/reason filters. */
  async listReports(filters: ListReportsFilters): Promise<PaginatedResult<AdminReportDTO>> {
    const qb = this.reportRepo
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.message', 'message');

    if (filters.status) {
      qb.andWhere('report.status = :status', { status: filters.status });
    }

    if (filters.reason) {
      qb.andWhere('report.reason = :reason', { reason: filters.reason });
    }

    if (filters.dateFrom) {
      qb.andWhere('report.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      qb.andWhere('report.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const [reports, total] = await qb
      .orderBy('report.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    return {
      data: reports.map((r) => mapReport(r, r.message)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Updates a message report's status with reviewer information. */
  async resolveReport(input: ResolveReportInput): Promise<AdminReportDTO | null> {
    const report = await this.reportRepo.findOne({
      where: { id: input.reportId },
      relations: ['message'],
    });

    if (!report) return null;

    report.status = input.status;
    report.reviewedBy = input.reviewedBy;
    report.reviewedAt = new Date();
    report.reviewerNotes = input.reviewerNotes ?? null;

    const saved = await this.reportRepo.save(report);
    return mapReport(saved, saved.message);
  }

  // ─── Analytics (S4-04) ───

  /** Computes time-series usage analytics (sessions, messages, active users) for a date range. */
  async getUsageAnalytics(filters: UsageAnalyticsFilters): Promise<UsageAnalytics> {
    const granularity: AnalyticsGranularity = filters.granularity ?? 'daily';
    const trunc = granularityToTrunc(granularity);
    const days = filters.days ?? 30;

    // Build date filter conditions and parameters.
    // The fallback cutoff is precomputed in JS to avoid interpolating `days`
    // into an SQL INTERVAL string (prevents SQL-injection via numeric input).
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const buildDateFilter = (
      alias: string,
    ): { conditions: string[]; params: Record<string, unknown> } => {
      const conditions: string[] = [];
      const params: Record<string, unknown> = {};
      if (filters.from) {
        conditions.push(`${alias}."createdAt" >= :from`);
        params.from = filters.from;
      } else {
        conditions.push(`${alias}."createdAt" >= :cutoff`);
        params.cutoff = cutoff.toISOString();
      }
      if (filters.to) {
        conditions.push(`${alias}."createdAt" <= :to`);
        params.to = filters.to;
      }
      return { conditions, params };
    };

    const sessionFilter = buildDateFilter('session');
    const messageFilter = buildDateFilter('message');
    const activeFilter = buildDateFilter('session');

    // SAFETY: `trunc` is derived from `granularityToTrunc()` which maps the
    // TypeScript union `AnalyticsGranularity` ('daily'|'weekly'|'monthly') to
    // a fixed set of literals ('day'|'week'|'month'). It never contains user input.
    const [sessionsResult, messagesResult, activeUsersResult] = await Promise.all([
      this.sessionRepo
        .createQueryBuilder('session')
        .select(`date_trunc('${trunc}', session."createdAt")`, 'd')
        .addSelect('COUNT(*)', 'c')
        .where(sessionFilter.conditions.join(' AND '), sessionFilter.params)
        .groupBy('d')
        .orderBy('d')
        .getRawMany<{ d: Date; c: string }>(),
      this.messageRepo
        .createQueryBuilder('message')
        .select(`date_trunc('${trunc}', message."createdAt")`, 'd')
        .addSelect('COUNT(*)', 'c')
        .where(messageFilter.conditions.join(' AND '), messageFilter.params)
        .groupBy('d')
        .orderBy('d')
        .getRawMany<{ d: Date; c: string }>(),
      this.sessionRepo
        .createQueryBuilder('session')
        .select(`date_trunc('${trunc}', session."createdAt")`, 'd')
        .addSelect('COUNT(DISTINCT session."userId")', 'c')
        .where(
          activeFilter.conditions.join(' AND ') + ' AND session."userId" IS NOT NULL',
          activeFilter.params,
        )
        .groupBy('d')
        .orderBy('d')
        .getRawMany<{ d: Date; c: string }>(),
    ]);

    const mapTs = (rows: { d: Date; c: string }[]) =>
      rows.map((r) => ({
        date: new Date(r.d).toISOString().slice(0, 10),
        count: Number.parseInt(r.c, 10),
      }));

    return {
      period: {
        from: filters.from ?? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
        to: filters.to ?? new Date().toISOString().slice(0, 10),
      },
      granularity,
      sessionsCreated: mapTs(sessionsResult),
      messagesSent: mapTs(messagesResult),
      activeUsers: mapTs(activeUsersResult),
    };
  }

  /** Computes content analytics including top artworks, museums, and guardrail block rate. */
  async getContentAnalytics(filters: ContentAnalyticsFilters): Promise<ContentAnalytics> {
    const topN = filters.limit ?? 10;

    // Build date filter for artwork_matches and chat_sessions
    const artworkQb = this.dataSource
      .getRepository(ArtworkMatch)
      .createQueryBuilder('a')
      .select('a.title', 'title')
      .addSelect('a.artist', 'artist')
      .addSelect('COUNT(*)', 'c')
      .groupBy('a.title')
      .addGroupBy('a.artist')
      .orderBy('c', 'DESC')
      .limit(topN);

    if (filters.from) {
      artworkQb.andWhere('a.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      artworkQb.andWhere('a.createdAt <= :to', { to: filters.to });
    }

    const museumQb = this.sessionRepo
      .createQueryBuilder('session')
      .select('session.museumName', 'name')
      .addSelect('COUNT(*)', 'c')
      .where('session.museumName IS NOT NULL')
      .groupBy('session.museumName')
      .orderBy('c', 'DESC')
      .limit(topN);

    if (filters.from) {
      museumQb.andWhere('session.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      museumQb.andWhere('session.createdAt <= :to', { to: filters.to });
    }

    const guardrailPromise = (async () => {
      const totalQb = this.auditRepo.createQueryBuilder('log').select('COUNT(*)', 'total');
      if (filters.from) {
        totalQb.andWhere('log.createdAt >= :from', { from: filters.from });
      }
      if (filters.to) {
        totalQb.andWhere('log.createdAt <= :to', { to: filters.to });
      }

      const blockedQb = this.auditRepo
        .createQueryBuilder('log')
        .select('COUNT(*)', 'total')
        .where("log.action = 'SECURITY_GUARDRAIL_BLOCK'");
      if (filters.from) {
        blockedQb.andWhere('log.createdAt >= :from', { from: filters.from });
      }
      if (filters.to) {
        blockedQb.andWhere('log.createdAt <= :to', { to: filters.to });
      }

      const [totalRes, blockedRes] = await Promise.all([
        totalQb.getRawOne<{ total: string }>(),
        blockedQb.getRawOne<{ total: string }>(),
      ]);

      const total = Number.parseInt(totalRes?.total ?? '0', 10);
      const blocked = Number.parseInt(blockedRes?.total ?? '0', 10);
      return total > 0 ? blocked / total : 0;
    })();

    const [artworksResult, museumsResult, guardrailResult] = await Promise.all([
      artworkQb.getRawMany<{ title: string | null; artist: string | null; c: string }>(),
      museumQb.getRawMany<{ name: string; c: string }>(),
      guardrailPromise,
    ]);

    return {
      topArtworks: artworksResult.map((r) => ({
        title: r.title ?? 'Unknown',
        artist: r.artist ?? null,
        count: Number.parseInt(r.c, 10),
      })),
      topMuseums: museumsResult.map((r) => ({
        name: r.name,
        count: Number.parseInt(r.c, 10),
      })),
      guardrailBlockRate: guardrailResult,
    };
  }

  /** Computes engagement metrics including average messages, session duration, and return rate. */
  async getEngagementAnalytics(filters: EngagementAnalyticsFilters): Promise<EngagementAnalytics> {
    // Build shared date filter
    const addDateFilters = (
      qb: { andWhere: (condition: string, params: Record<string, unknown>) => unknown },
      alias: string,
    ): void => {
      if (filters.from) {
        qb.andWhere(`${alias}."createdAt" >= :from`, { from: filters.from });
      }
      if (filters.to) {
        qb.andWhere(`${alias}."createdAt" <= :to`, { to: filters.to });
      }
    };

    // Average messages per session
    const avgMsgQb = this.sessionRepo
      .createQueryBuilder('s')
      .select('COALESCE(AVG(sub.msg_count), 0)', 'avg_msg')
      .from((subQuery) => {
        const sq = subQuery
          .select('s.id', 'id')
          .addSelect('COUNT(m.id)', 'msg_count')
          .from(ChatSession, 's')
          .leftJoin(ChatMessage, 'm', 'm."sessionId" = s.id')
          .groupBy('s.id');
        if (filters.from) {
          sq.andWhere('s."createdAt" >= :from', { from: filters.from });
        }
        if (filters.to) {
          sq.andWhere('s."createdAt" <= :to', { to: filters.to });
        }
        return sq;
      }, 'sub');

    // Average session duration in minutes
    const avgDurationQb = this.sessionRepo
      .createQueryBuilder('s')
      .select(
        'COALESCE(AVG(EXTRACT(EPOCH FROM (s."updatedAt" - s."createdAt")) / 60), 0)',
        'avg_dur',
      );
    addDateFilters(avgDurationQb, 's');

    // Return rate: unique users vs returning users
    const returnRateMainQb = this.sessionRepo
      .createQueryBuilder('s')
      .select('COUNT(DISTINCT s."userId")', 'total_unique')
      .where('s."userId" IS NOT NULL');
    addDateFilters(returnRateMainQb, 's');

    // Build the returning users subquery as raw SQL to avoid complexity
    const returningParams: unknown[] = [];
    let returningWhere = '';
    if (filters.from) {
      returningParams.push(filters.from);
      returningWhere += ` AND sub."createdAt" >= $${returningParams.length}`;
    }
    if (filters.to) {
      returningParams.push(filters.to);
      returningWhere += ` AND sub."createdAt" <= $${returningParams.length}`;
    }

    const [avgMsgResult, avgDurationResult, totalUniqueResult, returningResult] = await Promise.all(
      [
        avgMsgQb.getRawOne<{ avg_msg: string }>(),
        avgDurationQb.getRawOne<{ avg_dur: string }>(),
        returnRateMainQb.getRawOne<{ total_unique: string }>(),
        this.dataSource.query(
          `SELECT COUNT(*) AS returning_users FROM (
           SELECT sub."userId"
           FROM "chat_sessions" sub
           WHERE sub."userId" IS NOT NULL${returningWhere}
           GROUP BY sub."userId"
           HAVING COUNT(*) > 1
         ) t`,
          returningParams,
        ),
      ],
    );

    const totalUniqueUsers = Number.parseInt(totalUniqueResult?.total_unique ?? '0', 10);
    const returningUsers = Number.parseInt(returningResult[0]?.returning_users ?? '0', 10);

    return {
      avgMessagesPerSession: Number.parseFloat(avgMsgResult?.avg_msg ?? '0') || 0,
      avgSessionDurationMinutes: Number.parseFloat(avgDurationResult?.avg_dur ?? '0') || 0,
      returnUserRate: totalUniqueUsers > 0 ? returningUsers / totalUniqueUsers : 0,
      totalUniqueUsers,
      returningUsers,
    };
  }
}
