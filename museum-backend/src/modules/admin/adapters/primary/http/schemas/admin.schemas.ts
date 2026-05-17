import { z } from 'zod';

import { UserRole } from '@modules/auth/domain/user/user-role';
import { REVIEW_STATUSES } from '@modules/review/domain/review/review.types';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@modules/support/domain/ticket/support.types';

const validRoles = Object.values(UserRole) as [string, ...string[]];

export const changeUserRoleSchema = z.object({
  role: z.enum(validRoles),
});

/** R1 (C6) — 400 on `{tier:'enterprise'}` (R16) and empty body. */
export const changeUserTierSchema = z.object({
  tier: z.enum(['free', 'premium']),
});

export const resolveReportSchema = z.object({
  status: z.enum(['pending', 'reviewed', 'dismissed']),
  reviewerNotes: z.string().max(2000).optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignedTo: z.number().int().nullable().optional(),
});

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listUsersQuerySchema = paginationQuery.extend({
  search: z.string().optional(),
  role: z.string().optional(),
});

export const auditLogsQuerySchema = paginationQuery.extend({
  actorId: z.coerce.number().int().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const listReportsQuerySchema = paginationQuery.extend({
  status: z.enum(['pending', 'reviewed', 'dismissed']).optional(),
  reason: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// M7/H-2 — granularity enum blocks template-literal injection into the
// date_trunc() SQL call. Outside enum → 400.
// z.coerce.date() → Date → re-serialise to ISO so the repo's filters.from/to:
// string contract holds.
const isoDateString = z.coerce
  .date()
  .transform((d) => d.toISOString())
  .optional();

export const usageAnalyticsQuerySchema = z.strictObject({
  granularity: z.enum(['daily', 'weekly', 'monthly']).optional(),
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

// M7 — Zod replaces `parseInt || default`.
export const listTicketsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(TICKET_STATUSES as [string, ...string[]]).optional(),
  priority: z.enum(TICKET_PRIORITIES as [string, ...string[]]).optional(),
});

export const listReviewsQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(REVIEW_STATUSES as [string, ...string[]]).optional(),
});

export type UsageAnalyticsQuery = z.infer<typeof usageAnalyticsQuerySchema>;
export type ContentAnalyticsQuery = z.infer<typeof contentAnalyticsQuerySchema>;
export type EngagementAnalyticsQuery = z.infer<typeof engagementAnalyticsQuerySchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
