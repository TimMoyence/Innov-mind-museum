import type { components } from './api/generated/openapi';

type Schemas = components['schemas'];

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

export type Report = AdminReportDTO;
export type Ticket = TicketDTO;
export type TicketMessage = TicketMessageDTO;
export type TicketDetail = TicketDetailDTO;

export type User = AdminUserDTO;

export type AuditLog = AdminAuditLogDTO;

export type DashboardStats = AdminStats;

export type LoginResponse = AuthSessionResponse;

export type RefreshResponse = AuthSessionResponse;

export type AuthTokens = Pick<AuthSessionResponse, 'accessToken' | 'refreshToken'>;

export type TicketStatus = TicketDTO['status'];
export type TicketPriority = TicketDTO['priority'];
export type ReportStatus = AdminReportDTO['status'];
export type ReviewStatus = ReviewDTO['status'];
export type AnalyticsGranularity = UsageAnalytics['granularity'];
export type NpsResponse = Schemas['NpsResponse'];
export type UserRole = Schemas['UserRole'];

export const allOf = <T extends string>(members: Record<T, true>): readonly T[] =>
  Object.keys(members) as T[];

export const TICKET_STATUSES = allOf<TicketStatus>({
  open: true,
  in_progress: true,
  resolved: true,
  closed: true,
});
export const TICKET_PRIORITIES = allOf<TicketPriority>({ low: true, medium: true, high: true });
export const REPORT_STATUSES = allOf<ReportStatus>({
  pending: true,
  reviewed: true,
  dismissed: true,
});
export const REVIEW_STATUSES = allOf<ReviewStatus>({
  pending: true,
  approved: true,
  rejected: true,
});
export type ModerationStatus = Extract<ReviewStatus, 'approved' | 'rejected'>;
export const MODERATION_STATUSES: readonly ModerationStatus[] = ['approved', 'rejected'];
export const ANALYTICS_GRANULARITIES = allOf<AnalyticsGranularity>({
  daily: true,
  weekly: true,
  monthly: true,
});
export const MUSEUM_TYPES = allOf<MuseumType>({
  art: true,
  history: true,
  science: true,
  specialized: true,
  general: true,
});

export type MuseumBranding = Pick<
  NonNullable<Schemas['MuseumConfigInput']['branding']>,
  'primaryColor' | 'logoUrl'
>;

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole | '';
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}
