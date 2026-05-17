import type { PaginationParams } from '@shared/types/pagination';

/** Safe user DTO exposed by admin endpoints (no password, tokens, etc.). */
export interface AdminUserDTO {
  id: number;
  email: string;
  firstname: string | null;
  lastname: string | null;
  role: string;
  museumId: number | null;
  emailVerified: boolean;
  /** Operator-driven account freeze (blocks login + refresh; reversible). */
  suspended: boolean;
  /** Soft-delete timestamp (ISO 8601) or null when active. See ADR-052. */
  deletedAt: string | null;
  /**
   * Soft-paywall tier (R1 / C6). `'free'` is subject to the monthly session
   * quota ; `'premium'` bypasses. Flipped via `PATCH /api/admin/users/:id/tier`
   * (super_admin only).
   */
  tier: 'free' | 'premium';
  createdAt: string;
  updatedAt: string;
}

export interface ListUsersFilters {
  search?: string;
  role?: string;
  pagination: PaginationParams;
}

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

export interface ListAuditLogsFilters {
  action?: string;
  actorId?: number;
  targetType?: string;
  dateFrom?: string;
  dateTo?: string;
  pagination: PaginationParams;
}

export interface AdminStats {
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalSessions: number;
  totalMessages: number;
  recentSignups: number;
  recentSessions: number;
}

// S4-03 Content Moderation
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

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

export interface ListReportsFilters {
  status?: ReportStatus;
  reason?: string;
  dateFrom?: string;
  dateTo?: string;
  pagination: PaginationParams;
}

export interface ResolveReportInput {
  reportId: string;
  status: ReportStatus;
  reviewerNotes?: string;
  reviewedBy: number;
}

// S4-04 Analytics
export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';

interface TimeSeriesPoint {
  date: string;
  count: number;
}

export interface UsageAnalytics {
  period: { from: string; to: string };
  granularity: AnalyticsGranularity;
  sessionsCreated: TimeSeriesPoint[];
  messagesSent: TimeSeriesPoint[];
  activeUsers: TimeSeriesPoint[];
}

export interface UsageAnalyticsFilters {
  granularity?: AnalyticsGranularity;
  from?: string;
  to?: string;
  days?: number;
}

export interface ContentAnalytics {
  topArtworks: { title: string; artist: string | null; count: number }[];
  topMuseums: { name: string; count: number }[];
  guardrailBlockRate: number;
}

export interface ContentAnalyticsFilters {
  from?: string;
  to?: string;
  limit?: number;
}

export interface EngagementAnalytics {
  avgMessagesPerSession: number;
  avgSessionDurationMinutes: number;
  returnUserRate: number;
  totalUniqueUsers: number;
  returningUsers: number;
}

export interface EngagementAnalyticsFilters {
  from?: string;
  to?: string;
}
