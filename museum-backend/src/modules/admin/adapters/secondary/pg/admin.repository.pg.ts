import { User } from '@modules/auth/domain/user/user.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { MessageReport } from '@modules/chat/domain/message/messageReport.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { AuditLog } from '@shared/audit/auditLog.entity';
import { paginate } from '@shared/pagination/offset-paginate';

import {
  queryUsageAnalytics,
  queryContentAnalytics,
  queryEngagementAnalytics,
} from './admin-analytics-queries';

import type { IAdminRepository } from '@modules/admin/domain/admin/admin.repository.interface';
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
} from '@modules/admin/domain/admin/admin.types';
import type { PaginatedResult } from '@shared/types/pagination';
import type { DataSource, Repository } from 'typeorm';

function mapUser(user: User): AdminUserDTO {
  return {
    id: user.id,
    email: user.email,
    firstname: user.firstname ?? null,
    lastname: user.lastname ?? null,
    role: user.role,
    museumId: user.museumId ?? null,
    emailVerified: user.email_verified,
    suspended: user.suspended,
    deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    tier: user.tier,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

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

  async listUsers(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>> {
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

    qb.andWhere('u.deleted_at IS NULL');

    qb.orderBy('u.createdAt', 'DESC');

    return await paginate(qb, filters.pagination, mapUser);
  }

  async getUserById(userId: number): Promise<AdminUserDTO | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    return user ? mapUser(user) : null;
  }

  async changeUserRole(userId: number, newRole: string): Promise<AdminUserDTO | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;

    user.role = newRole as User['role'];
    const saved = await this.userRepo.save(user);
    return mapUser(saved);
  }

  async changeUserTier(userId: number, newTier: 'free' | 'premium'): Promise<AdminUserDTO | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;
    user.tier = newTier;
    const saved = await this.userRepo.save(user);
    return mapUser(saved);
  }

  async suspendUser(userId: number): Promise<AdminUserDTO | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;
    user.suspended = true;
    const saved = await this.userRepo.save(user);
    return mapUser(saved);
  }

  async unsuspendUser(userId: number): Promise<AdminUserDTO | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;
    user.suspended = false;
    const saved = await this.userRepo.save(user);
    return mapUser(saved);
  }

  async softDeleteUser(userId: number): Promise<AdminUserDTO | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;
    user.deletedAt = new Date();
    const saved = await this.userRepo.save(user);
    return mapUser(saved);
  }

  async countAdmins(): Promise<number> {
    return (
      (await this.userRepo.countBy({ role: 'admin' })) +
      (await this.userRepo.countBy({ role: 'super_admin' }))
    );
  }

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

    qb.orderBy('log.createdAt', 'DESC');

    return await paginate(qb, filters.pagination, mapAuditLog);
  }

  async getStats(museumId?: number): Promise<AdminStats> {
    const sessionsQb = this.sessionRepo
      .createQueryBuilder('session')
      .select('COUNT(*)', 'total')
      .addSelect(
        'COUNT(*) FILTER (WHERE session."createdAt" >= NOW() - INTERVAL \'7 days\')',
        'recent',
      );

    const messagesQb = this.messageRepo.createQueryBuilder('message').select('COUNT(*)', 'total');

    if (museumId !== undefined) {
      sessionsQb.andWhere('session.museum_id = :scope', { scope: museumId });
      messagesQb
        .innerJoin('message.session', 'ms')
        .andWhere('ms.museum_id = :scope', { scope: museumId });

      const [sessionsResult, messagesResult] = await Promise.all([
        sessionsQb.getRawOne<{ total: string; recent: string }>(),
        messagesQb.getRawOne<{ total: string }>(),
      ]);

      return {
        totalSessions: Number.parseInt(sessionsResult?.total ?? '0', 10),
        totalMessages: Number.parseInt(messagesResult?.total ?? '0', 10),
        recentSessions: Number.parseInt(sessionsResult?.recent ?? '0', 10),
      };
    }

    const [usersResult, sessionsResult, messagesResult] = await Promise.all([
      this.userRepo
        .createQueryBuilder('u')
        .select('u.role', 'role')
        .addSelect('COUNT(*)', 'total')
        .addSelect('COUNT(*) FILTER (WHERE u."createdAt" >= NOW() - INTERVAL \'7 days\')', 'recent')
        .groupBy('u.role')
        .getRawMany<{ role: string; total: string; recent: string }>(),
      sessionsQb.getRawOne<{ total: string; recent: string }>(),
      messagesQb.getRawOne<{ total: string }>(),
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

    qb.orderBy('report.createdAt', 'DESC');

    return await paginate(qb, filters.pagination, (r) => mapReport(r, r.message));
  }

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
