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
} from './admin.types';

/** Port for admin dashboard data access. */
export interface IAdminRepository {
  /** List users with optional search, role filter, and pagination. */
  listUsers(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>>;

  /** Change a user's role. Returns the updated user or null if not found. */
  changeUserRole(userId: number, newRole: string): Promise<AdminUserDTO | null>;

  /** Count the number of admin users. */
  countAdmins(): Promise<number>;

  /** List audit log entries with optional filters and pagination. */
  listAuditLogs(filters: ListAuditLogsFilters): Promise<PaginatedResult<AdminAuditLogDTO>>;

  /** Retrieve aggregated dashboard statistics. */
  getStats(): Promise<AdminStats>;

  // ─── Content Moderation (S4-03) ───

  /** List message reports with optional filters and pagination. */
  listReports(filters: ListReportsFilters): Promise<PaginatedResult<AdminReportDTO>>;

  /** Resolve (review/dismiss) a message report. Returns the updated report or null if not found. */
  resolveReport(input: ResolveReportInput): Promise<AdminReportDTO | null>;

  // ─── Analytics (S4-04) ───

  /** Retrieve usage analytics time-series data. */
  getUsageAnalytics(filters: UsageAnalyticsFilters): Promise<UsageAnalytics>;

  /** Retrieve content analytics (top artworks, museums, guardrail rate). */
  getContentAnalytics(filters: ContentAnalyticsFilters): Promise<ContentAnalytics>;

  /** Retrieve engagement analytics (avg messages, duration, return rate). */
  getEngagementAnalytics(filters: EngagementAnalyticsFilters): Promise<EngagementAnalytics>;
}
