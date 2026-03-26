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
