import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(500),
  description: z.string().min(10).max(5000),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().max(100).optional(),
});

export const submitSupportContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(5000),
});

export const addTicketMessageSchema = z.object({
  text: z.string().min(1).max(5000),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});
