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
} from './admin.types';
import type { PaginatedResult } from '@shared/types/pagination';

export interface IAdminRepository {
  listUsers(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>>;

  getUserById(userId: number): Promise<AdminUserDTO | null>;

  changeUserRole(userId: number, newRole: string): Promise<AdminUserDTO | null>;

  changeUserTier(userId: number, newTier: 'free' | 'premium'): Promise<AdminUserDTO | null>;

  suspendUser(userId: number): Promise<AdminUserDTO | null>;

  unsuspendUser(userId: number): Promise<AdminUserDTO | null>;

  softDeleteUser(userId: number): Promise<AdminUserDTO | null>;

  countAdmins(): Promise<number>;

  listAuditLogs(filters: ListAuditLogsFilters): Promise<PaginatedResult<AdminAuditLogDTO>>;

  getStats(museumId?: number): Promise<AdminStats>;

  listReports(filters: ListReportsFilters): Promise<PaginatedResult<AdminReportDTO>>;
  resolveReport(input: ResolveReportInput): Promise<AdminReportDTO | null>;

  getUsageAnalytics(filters: UsageAnalyticsFilters): Promise<UsageAnalytics>;
  getContentAnalytics(filters: ContentAnalyticsFilters): Promise<ContentAnalytics>;
  getEngagementAnalytics(filters: EngagementAnalyticsFilters): Promise<EngagementAnalytics>;
}
