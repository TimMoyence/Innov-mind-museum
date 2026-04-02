import { z } from 'zod';

import { UserRole } from '@modules/auth/core/domain/user-role';

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
