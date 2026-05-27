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
  /** Excludes soft-deleted rows. */
  listUsers(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>>;

  /** Returns soft-deleted rows so admin can audit them. */
  getUserById(userId: number): Promise<AdminUserDTO | null>;

  changeUserRole(userId: number, newRole: string): Promise<AdminUserDTO | null>;

  /**
   * R1 (C6) — MUST NOT touch `sessionsMonthCount` or `sessionsMonthStart`
   * (R17 — counter preserved across flips).
   */
  changeUserTier(userId: number, newTier: 'free' | 'premium'): Promise<AdminUserDTO | null>;

  /** Idempotent. */
  suspendUser(userId: number): Promise<AdminUserDTO | null>;

  /** Idempotent. */
  unsuspendUser(userId: number): Promise<AdminUserDTO | null>;

  /** Sets deleted_at = NOW(). Idempotent. */
  softDeleteUser(userId: number): Promise<AdminUserDTO | null>;

  /** Counts admin + super_admin (used for last-admin guard). */
  countAdmins(): Promise<number>;

  listAuditLogs(filters: ListAuditLogsFilters): Promise<PaginatedResult<AdminAuditLogDTO>>;

  /**
   * Global aggregate when `museumId` is omitted (full `AdminStats`).
   * When `museumId` is provided, sessions/messages are filtered to that tenant
   * and the platform-census fields are omitted (reduced manager shape, C1A D1/D2).
   */
  getStats(museumId?: number): Promise<AdminStats>;

  // S4-03 Content Moderation
  listReports(filters: ListReportsFilters): Promise<PaginatedResult<AdminReportDTO>>;
  resolveReport(input: ResolveReportInput): Promise<AdminReportDTO | null>;

  // S4-04 Analytics
  getUsageAnalytics(filters: UsageAnalyticsFilters): Promise<UsageAnalytics>;
  getContentAnalytics(filters: ContentAnalyticsFilters): Promise<ContentAnalytics>;
  getEngagementAnalytics(filters: EngagementAnalyticsFilters): Promise<EngagementAnalytics>;
}
