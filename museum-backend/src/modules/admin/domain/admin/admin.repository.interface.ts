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

/** Port for admin dashboard data access. */
export interface IAdminRepository {
  /** List users with optional search, role filter, and pagination. Excludes soft-deleted rows. */
  listUsers(filters: ListUsersFilters): Promise<PaginatedResult<AdminUserDTO>>;

  /** Look up a single user by id. Returns soft-deleted rows so admin can audit them. */
  getUserById(userId: number): Promise<AdminUserDTO | null>;

  /** Change a user's role. Returns the updated user or null if not found. */
  changeUserRole(userId: number, newRole: string): Promise<AdminUserDTO | null>;

  /** Flip the suspended flag to true. Idempotent. Returns updated DTO or null if not found. */
  suspendUser(userId: number): Promise<AdminUserDTO | null>;

  /** Flip the suspended flag to false. Idempotent. Returns updated DTO or null if not found. */
  unsuspendUser(userId: number): Promise<AdminUserDTO | null>;

  /** Set deleted_at = NOW(). Idempotent. Returns updated DTO or null if not found. */
  softDeleteUser(userId: number): Promise<AdminUserDTO | null>;

  /** Count the number of admin + super_admin users (used for last-admin guard). */
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
