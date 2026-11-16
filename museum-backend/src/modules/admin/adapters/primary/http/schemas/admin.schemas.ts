import { TEXT_LIMITS } from '@musaium/shared';
import { z } from 'zod';

import { ANALYTICS_GRANULARITIES, REPORT_STATUSES } from '@modules/admin/domain/admin/admin.types';
import { UserRole } from '@modules/auth/domain/user/user-role';
import { REVIEW_STATUSES } from '@modules/review/domain/review/review.types';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@modules/support/domain/ticket/support.types';
import { textField } from '@shared/validation/text-field';

const userRole = z.enum(Object.values(UserRole) as [UserRole, ...UserRole[]]);

export const changeUserRoleSchema = z.object({
  role: userRole,
});

export const changeUserTierSchema = z.object({
  tier: z.enum(['free', 'premium']),
});

export const resolveReportSchema = z.object({
  status: z.enum(REPORT_STATUSES),
  reviewerNotes: textField(TEXT_LIMITS.reviewerNotes).optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedTo: z.number().int().nullable().optional(),
});

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listUsersQuerySchema = paginationQuery.extend({
  search: z.string().optional(),
  role: userRole.optional(),
});

export const auditLogsQuerySchema = paginationQuery.extend({
  actorId: z.coerce.number().int().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const listReportsQuerySchema = paginationQuery.extend({
  status: z.enum(REPORT_STATUSES).optional(),
  reason: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const isoDateString = z.coerce
  .date()
  .transform((d) => d.toISOString())
  .optional();

export const usageAnalyticsQuerySchema = z.strictObject({
  granularity: z.enum(ANALYTICS_GRANULARITIES).optional(),
  from: isoDateString,
  to: isoDateString,
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const contentAnalyticsQuerySchema = z.strictObject({
  from: isoDateString,
  to: isoDateString,
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const engagementAnalyticsQuerySchema = z.strictObject({
  from: isoDateString,
  to: isoDateString,
});

export const listTicketsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});

export const listReviewsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(REVIEW_STATUSES).optional(),
});

export const statsQuerySchema = z.strictObject({
  museumId: z.coerce.number().int().positive().optional(),
});

export type UsageAnalyticsQuery = z.infer<typeof usageAnalyticsQuerySchema>;
export type ContentAnalyticsQuery = z.infer<typeof contentAnalyticsQuerySchema>;
export type EngagementAnalyticsQuery = z.infer<typeof engagementAnalyticsQuerySchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
export type StatsQuery = z.infer<typeof statsQuerySchema>;
