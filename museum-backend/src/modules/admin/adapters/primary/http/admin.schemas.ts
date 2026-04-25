import { z } from 'zod';

import { UserRole } from '@modules/auth/domain/user-role';
import { REVIEW_STATUSES } from '@modules/review/domain/review.types';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@modules/support/domain/support.types';

// Re-export peer-module schema so admin route imports only from admin.schemas.
// The SSOT stays in the review module; admin module owns the HTTP binding choice.
export { moderateReviewSchema } from '@modules/review/adapters/primary/http/review.schemas';

const validRoles = Object.values(UserRole) as [string, ...string[]];

export const changeUserRoleSchema = z.object({
  role: z.enum(validRoles),
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

// ─── Analytics query schemas (M7 / H-2 — Zod runtime validation) ───
//
// Hard runtime guard on `granularity` to block template-literal injection into
// the `date_trunc()` SQL call. Any value outside the enum → 400 BAD_REQUEST.
//
// `z.coerce.date()` accepts ISO strings and produces a `Date` instance; we
// then re-serialise to ISO via `.transform()` to stay compatible with the
// repository's `filters.from / filters.to: string` contract.

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

// ─── Tickets / Reviews list schemas (M7 — Zod replaces `parseInt || default`) ───

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

/**
 *
 */
export type UsageAnalyticsQuery = z.infer<typeof usageAnalyticsQuerySchema>;
/**
 *
 */
export type ContentAnalyticsQuery = z.infer<typeof contentAnalyticsQuerySchema>;
/**
 *
 */
export type EngagementAnalyticsQuery = z.infer<typeof engagementAnalyticsQuerySchema>;
/**
 *
 */
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
/**
 *
 */
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
