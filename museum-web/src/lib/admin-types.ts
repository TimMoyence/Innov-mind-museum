/** Admin API types — mirrors the backend DTOs exactly. */

export type UserRole = 'visitor' | 'moderator' | 'museum_manager' | 'admin';

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

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/** Paginated result — flat structure matching backend PaginatedResult<T>. */
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

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalConversations: number;
  totalMessages: number;
  newUsersToday: number;
  messagesThisWeek: number;
}

// --- Reports ---

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface Report {
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

// --- Tickets ---

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed'];
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high'];

export interface Ticket {
  id: string;
  userId: number;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string | null;
  assignedTo: number | null;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: number;
  senderRole: string;
  text: string;
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  messages: TicketMessage[];
}

// --- Analytics ---

export type AnalyticsGranularity = 'daily' | 'weekly' | 'monthly';

export interface TimeSeriesPoint {
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

export interface ContentAnalytics {
  topArtworks: { title: string; artist: string | null; count: number }[];
  topMuseums: { name: string; count: number }[];
  guardrailBlockRate: number;
}

export interface EngagementAnalytics {
  avgMessagesPerSession: number;
  avgSessionDurationMinutes: number;
  returnUserRate: number;
  totalUniqueUsers: number;
  returningUsers: number;
}
