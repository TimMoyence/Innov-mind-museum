/**
 * Admin API types — re-export from generated OpenAPI spec where available.
 * Hand-rolled types kept where backend schema is absent or field-set differs.
 */

import type { components } from './api/generated/openapi';

type Schemas = components['schemas'];

// ---------------------------------------------------------------------------
// Re-exports from OpenAPI spec (single source of truth)
// ---------------------------------------------------------------------------

export type AdminUserDTO = Schemas['AdminUserDTO'];
export type AdminAuditLogDTO = Schemas['AdminAuditLogDTO'];
export type AdminStats = Schemas['AdminStats'];
export type AdminReportDTO = Schemas['AdminReportDTO'];
export type TicketDTO = Schemas['TicketDTO'];
export type TicketMessageDTO = Schemas['TicketMessageDTO'];
export type TicketDetailDTO = Schemas['TicketDetailDTO'];
export type ReviewDTO = Schemas['ReviewDTO'];
export type TimeSeriesPoint = Schemas['TimeSeriesPoint'];
export type UsageAnalytics = Schemas['UsageAnalytics'];
export type ContentAnalytics = Schemas['ContentAnalytics'];
export type EngagementAnalytics = Schemas['EngagementAnalytics'];
export type AuthUser = Schemas['AuthUser'];
export type AuthSessionResponse = Schemas['AuthSessionResponse'];

// ---------------------------------------------------------------------------
// Backward-compat aliases — consumers import by old names, keep them working.
// These names are stable; no migration of call sites needed.
// ---------------------------------------------------------------------------

/** Alias for AdminReportDTO (re-exported from OpenAPI spec). */
export type Report = AdminReportDTO;
/** Alias for TicketDTO (re-exported from OpenAPI spec). */
export type Ticket = TicketDTO;
/** Alias for TicketMessageDTO (re-exported from OpenAPI spec). */
export type TicketMessage = TicketMessageDTO;
/** Alias for TicketDetailDTO (re-exported from OpenAPI spec). */
export type TicketDetail = TicketDetailDTO;

// ---------------------------------------------------------------------------
// Path A — aliases where the hand-rolled type matches an existing OpenAPI schema
// ---------------------------------------------------------------------------

/** Alias for AdminUserDTO — replaces the old hand-rolled User interface. */
export type User = AdminUserDTO;

/** Alias for AdminAuditLogDTO — replaces the old hand-rolled AuditLog interface. */
export type AuditLog = AdminAuditLogDTO;

/** Alias for AdminStats — replaces the old hand-rolled DashboardStats interface. */
export type DashboardStats = AdminStats;

/** Login response — alias to AuthSessionResponse (the shape the backend /login endpoint returns). */
export type LoginResponse = AuthSessionResponse;

/** Refresh response — alias to AuthSessionResponse (the shape the backend /refresh endpoint returns). */
export type RefreshResponse = AuthSessionResponse;

/** Auth tokens — derived subset of AuthSessionResponse. */
export type AuthTokens = Pick<AuthSessionResponse, 'accessToken' | 'refreshToken'>;

// ---------------------------------------------------------------------------
// Derived string-literal unions — no named schema counterpart in spec
// ---------------------------------------------------------------------------

// Intentionally hand-rolled — TicketStatus is embedded in TicketDTO.status, not a named schema component
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
// Intentionally hand-rolled — TicketPriority is embedded in TicketDTO.priority, not a named schema component
export type TicketPriority = 'low' | 'medium' | 'high';
// Intentionally hand-rolled — ReportStatus is embedded in AdminReportDTO.status, not a named schema component
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
// Intentionally hand-rolled — ReviewStatus is embedded in ReviewDTO.status, not a named schema component
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
// Intentionally hand-rolled — AnalyticsGranularity is embedded in UsageAnalytics.granularity, not a named schema component
export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';
// Intentionally hand-rolled — UserRole is embedded in AuthUser.role, not a named schema component
export type UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin';

// ---------------------------------------------------------------------------
// Runtime constants (kept — tests assert on these values)
// ---------------------------------------------------------------------------

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high'];
export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];
export const MODERATION_STATUSES: Extract<ReviewStatus, 'approved' | 'rejected'>[] = [
  'approved',
  'rejected',
];

// ---------------------------------------------------------------------------
// Path B — intentionally hand-rolled: generic meta-shape or query-param helper
// that cannot be expressed in components.schemas of OpenAPI 3.0.
// ---------------------------------------------------------------------------

/**
 * Intentionally hand-rolled — meta-shape outside OpenAPI components.schemas.
 * Backend generates named paginated schemas (e.g. ReviewListResponse) rather
 * than a generic component. PaginatedResponse<T> stays as a reusable generic
 * wrapper for admin page state until OpenAPI 3.1 discriminated generics land.
 */
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Intentionally hand-rolled — meta-shape outside OpenAPI components.schemas.
 * ListUsersParams is a query-parameter shape rendered under paths, not
 * components.schemas — openapi-typescript does not surface it as a named type.
 */
export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole | '';
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

/**
 * Intentionally hand-rolled — meta-shape outside OpenAPI components.schemas.
 * ListAuditLogsParams is a query-parameter shape rendered under paths, not
 * components.schemas — openapi-typescript does not surface it as a named type.
 */
export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}
