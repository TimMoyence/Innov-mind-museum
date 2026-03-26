import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3).max(500),
  description: z.string().min(10).max(5000),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: z.string().max(100).optional(),
});

export const addTicketMessageSchema = z.object({
  text: z.string().min(1).max(5000),
});
