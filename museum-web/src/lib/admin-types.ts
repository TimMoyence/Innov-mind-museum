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
// Derived string-literal unions — no named schema counterpart in spec
// ---------------------------------------------------------------------------

// TODO(openapi): TicketStatus is embedded in TicketDTO.status, not a named schema component
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
// TODO(openapi): TicketPriority is embedded in TicketDTO.priority, not a named schema component
export type TicketPriority = 'low' | 'medium' | 'high';
// TODO(openapi): ReportStatus is embedded in AdminReportDTO.status, not a named schema component
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
// TODO(openapi): ReviewStatus is embedded in ReviewDTO.status, not a named schema component
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
// TODO(openapi): AnalyticsGranularity is embedded in UsageAnalytics.granularity, not a named schema component
export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';
// TODO(openapi): UserRole is embedded in AuthUser.role, not a named schema component
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
// Hand-rolled types — field set differs from any available schema, or no
// counterpart exists in the backend OpenAPI spec.
// ---------------------------------------------------------------------------

/**
 * TODO(openapi): Hand-rolled admin user shape used by /admin/users — differs from
 * AdminUserDTO (uses name/isActive/lastLoginAt, not firstname/lastname/emailVerified)
 * and AuthUser (id is string here, number in spec). Align backend DTO to expose
 * a unified AdminUserView schema then re-export.
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/**
 * TODO(openapi): AuthTokens is inlined in AuthSessionResponse — no standalone
 * component in the spec. Extract as a named component if needed.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * TODO(openapi): LoginResponse wraps User + AuthTokens — shape differs from
 * AuthSessionResponse (which uses AuthUser and includes expiresIn/refreshExpiresIn).
 * Keep hand-rolled until admin auth is aligned with the OpenAPI spec shape.
 */
export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

/**
 * TODO(openapi): RefreshResponse is a subset of AuthSessionResponse.
 * Consider replacing with Schemas['AuthSessionResponse'] once refresh endpoint
 * is documented to return the full session shape.
 */
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** Paginated result — flat structure matching backend PaginatedResult<T>.
 * TODO(openapi): Backend generates named paginated schemas (e.g. ReviewListResponse)
 * rather than a generic component. Keep hand-rolled generic for now.
 */
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * TODO(openapi): ListUsersParams is a query-parameter shape rendered under paths,
 * not components.schemas — openapi-typescript does not surface it as a named type.
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
 * TODO(openapi): AuditLog hand-rolled shape uses userId/userEmail/resource/resourceId/
 * details/ipAddress — differs from AdminAuditLogDTO (actorType/actorId/targetType/
 * targetId/metadata/ip). Keep until admin UI is migrated to AdminAuditLogDTO field names.
 */
export interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/**
 * TODO(openapi): ListAuditLogsParams is a query-parameter shape — not in
 * components.schemas.
 */
export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * TODO(openapi): DashboardStats fields (activeUsers/totalConversations/newUsersToday/
 * messagesThisWeek) differ from AdminStats (usersByRole/totalSessions/recentSignups/
 * recentSessions). Keep until backend exposes a matching DashboardStats schema.
 */
export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalConversations: number;
  totalMessages: number;
  newUsersToday: number;
  messagesThisWeek: number;
}
