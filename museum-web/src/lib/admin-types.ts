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

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';

export interface NpsResponse {
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  count: number;
}
export type UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin' | 'super_admin';

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high'];
export const REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];
export const MODERATION_STATUSES: Extract<ReviewStatus, 'approved' | 'rejected'>[] = [
  'approved',
  'rejected',
];

export const MUSEUM_TYPES: MuseumType[] = ['art', 'history', 'science', 'specialized', 'general'];

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
