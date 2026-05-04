import { User } from '@modules/auth/domain/user.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { MessageReport } from '@modules/chat/domain/messageReport.entity';
import { AuditLog } from '@shared/audit/auditLog.entity';

import {
  queryUsageAnalytics,
  queryContentAnalytics,
  queryEngagementAnalytics,
} from './admin-analytics-queries';

import type { IAdminRepository } from '../../../domain/admin/admin.repository.interface';
import type {
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
} from '../../../domain/admin/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';
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
    // Alias `u` (not `user`) — `user` is a reserved keyword in PostgreSQL (= CURRENT_USER)
    // and breaks raw SQL fragments. See getStats() for the same pattern.
    const qb = this.userRepo.createQueryBuilder('u');

    if (filters.search) {
      const pattern = `%${filters.search}%`;
      qb.where('(u.email ILIKE :search OR u.firstname ILIKE :search OR u.lastname ILIKE :search)', {
        search: pattern,
      });
    }

    if (filters.role) {
      qb.andWhere('u.role = :role', { role: filters.role });
    }

    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const [users, total] = await qb
      .orderBy('u.createdAt', 'DESC')
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
        // Alias `u` (not `user`) — `user` is a reserved keyword in PostgreSQL
        // (= CURRENT_USER); raw SQL fragments emit `user.role` literally and fail.
        .createQueryBuilder('u')
        .select('u.role', 'role')
        .addSelect('COUNT(*)', 'total')
        .addSelect('COUNT(*) FILTER (WHERE u."createdAt" >= NOW() - INTERVAL \'7 days\')', 'recent')
        .groupBy('u.role')
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
    return await queryUsageAnalytics(
      {
        dataSource: this.dataSource,
        sessionRepo: this.sessionRepo,
        messageRepo: this.messageRepo,
        auditRepo: this.auditRepo,
      },
      filters,
    );
  }

  /** Computes content analytics including top artworks, museums, and guardrail block rate. */
  async getContentAnalytics(filters: ContentAnalyticsFilters): Promise<ContentAnalytics> {
    return await queryContentAnalytics(
      {
        dataSource: this.dataSource,
        sessionRepo: this.sessionRepo,
        messageRepo: this.messageRepo,
        auditRepo: this.auditRepo,
      },
      filters,
    );
  }

  /** Computes engagement metrics including average messages, session duration, and return rate. */
  async getEngagementAnalytics(filters: EngagementAnalyticsFilters): Promise<EngagementAnalytics> {
    return await queryEngagementAnalytics(
      {
        dataSource: this.dataSource,
        sessionRepo: this.sessionRepo,
        messageRepo: this.messageRepo,
        auditRepo: this.auditRepo,
      },
      filters,
    );
  }
}
