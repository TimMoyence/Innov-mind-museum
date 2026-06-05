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
export type MuseumDTO = Schemas['MuseumDTO'];
export type MuseumType = MuseumDTO['museumType'];

// ---------------------------------------------------------------------------
// MFA login envelopes — aliases to the generated OpenAPI schemas (M1).
// The admin /login response is a discriminated union of these three shapes;
// LoginForm + auth.tsx discriminate on `mfaRequired` / `mfaEnrollmentRequired`.
// ---------------------------------------------------------------------------

/** `/login` 200 envelope when a second factor is required. */
export type MfaRequiredResponse = Schemas['MfaRequiredResponse'];
/** `/login` 403 envelope when the admin must enroll MFA before logging in. */
export type MfaEnrollmentRequiredResponse = Schemas['MfaEnrollmentRequiredResponse'];
/** `/mfa/recovery` 200 envelope — a session plus the remaining recovery-code count. */
export type MfaRecoverySessionResponse = Schemas['MfaRecoverySessionResponse'];

/**
 * Discriminated result of `auth.tsx login()` (M1, design §4). `login()` resolves
 * one of these; it THROWS only on a genuine credential/other error (bad password,
 * non-MFA 401/403, network). The caller (LoginForm) routes on `kind`.
 */
export type LoginOutcome =
  | { kind: 'success' }
  | { kind: 'mfa-required'; mfaSessionToken: string; mfaSessionExpiresIn: number }
  | { kind: 'enrollment-required' };

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

/**
 * NPS aggregate returned by `GET /api/admin/nps` (C2 / R24, R27). Hand-rolled
 * until the backend OpenAPI spec ships the `NpsResponse` schema and the
 * generated `openapi.ts` is regenerated; the field-set mirrors the backend
 * aggregate one-to-one so the dashboard never re-aggregates client-side (R27).
 *
 * - `nps`        — Net Promoter Score in `[-100, 100]` (promoters% − detractors%).
 * - `promoters`  — count of 9-10 ratings.
 * - `passives`   — count of 7-8 ratings.
 * - `detractors` — count of 0-6 ratings.
 * - `count`      — total approved responses in scope (`0` → empty placeholder).
 */
export interface NpsResponse {
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  count: number;
}
/**
 * Canonical UserRole — single source of truth (re-exported by `auth.tsx`).
 * Hand-rolled because `super_admin` is a Musaium platform-owner tier stored
 * out-of-band (not surfaced in the OpenAPI `AuthUser.role` schema); B2B
 * museum operators get `admin` per-tenant. `super_admin` SHALL implicitly
 * satisfy any `admin`-only check (see `RoleGuard` usage).
 */
export type UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin';

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

// W4 W2.x — Museum admin shapes (B2B onboarding). MuseumType enum mirrors the
// BE z.enum(['art','history','science','specialized','general']) — keep in sync.
export const MUSEUM_TYPES: MuseumType[] = ['art', 'history', 'science', 'specialized', 'general'];

/**
 * Branding sub-tree persisted under MuseumDTO.config.branding (JSONB). Schema
 * is hand-rolled here because the BE accepts config as `Record<string, unknown>`
 * with light shape validation; the FE exposes the typed slice it actually edits.
 * Color values are HEX (#RRGGBB) — validated client-side, mirrored to BE on save.
 */
export interface MuseumBranding {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  accentColor?: string;
}

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
