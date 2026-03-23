/** Pagination parameters for list endpoints. */
export interface PaginationParams {
  page: number;
  limit: number;
}

/** Generic paginated result wrapper. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Safe user DTO exposed by admin endpoints (no password, tokens, etc.). */
export interface AdminUserDTO {
  id: number;
  email: string;
  firstname: string | null;
  lastname: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Filters for the list-users admin endpoint. */
export interface ListUsersFilters {
  search?: string;
  role?: string;
  pagination: PaginationParams;
}

/** Audit log DTO exposed by admin endpoints. */
export interface AdminAuditLogDTO {
  id: string;
  action: string;
  actorType: string;
  actorId: number | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

/** Filters for the list-audit-logs admin endpoint. */
export interface ListAuditLogsFilters {
  action?: string;
  actorId?: number;
  targetType?: string;
  dateFrom?: string;
  dateTo?: string;
  pagination: PaginationParams;
}

/** Aggregated dashboard statistics. */
export interface AdminStats {
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalSessions: number;
  totalMessages: number;
  recentSignups: number;
  recentSessions: number;
}

// ─── Content Moderation (S4-03) ───

/** Allowed statuses for a message report. */
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

/** Full report DTO exposed by admin endpoints. */
export interface AdminReportDTO {
  id: string;
  messageId: string;
  userId: number;
  reason: string;
  comment: string | null;
  status: ReportStatus;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reviewerNotes: string | null;
  createdAt: string;
  messageText: string | null;
  messageRole: string;
  sessionId: string;
}

/** Filters for the list-reports admin endpoint. */
export interface ListReportsFilters {
  status?: ReportStatus;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  pagination: PaginationParams;
}

/** Input to resolve (review/dismiss) a report. */
export interface ResolveReportInput {
  reportId: string;
  status: ReportStatus;
  reviewerNotes?: string;
  reviewedBy: number;
}

// ─── Analytics API (S4-04) ───

/** Time-series aggregation granularity. */
export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';

/** A single time-series data point. */
export interface TimeSeriesPoint {
  date: string;
  count: number;
}

/** Usage analytics payload. */
export interface UsageAnalytics {
  period: { from: string; to: string };
  granularity: AnalyticsGranularity;
  sessionsCreated: TimeSeriesPoint[];
  messagesSent: TimeSeriesPoint[];
  activeUsers: TimeSeriesPoint[];
}

/** Filters for the usage analytics endpoint. */
export interface UsageAnalyticsFilters {
  granularity?: AnalyticsGranularity;
  from?: string;
  to?: string;
  days?: number;
}

/** Content analytics payload. */
export interface ContentAnalytics {
  topArtworks: { title: string; artist: string | null; count: number }[];
  topMuseums: { name: string; count: number }[];
  guardrailBlockRate: number;
}

/** Filters for the content analytics endpoint. */
export interface ContentAnalyticsFilters {
  from?: string;
  to?: string;
  limit?: number;
}

/** Engagement analytics payload. */
export interface EngagementAnalytics {
  avgMessagesPerSession: number;
  avgSessionDurationMinutes: number;
  returnUserRate: number;
  totalUniqueUsers: number;
  returningUsers: number;
}

/** Filters for the engagement analytics endpoint. */
export interface EngagementAnalyticsFilters {
  from?: string;
  to?: string;
}
