import { TEXT_LIMITS } from '@musaium/shared';
import { z } from 'zod';

import { emailField } from '@shared/validation/email-field';
import { fillMsField, honeypotField } from '@shared/validation/honeypot';
import { textField } from '@shared/validation/text-field';

export const createTicketSchema = z.object({
  subject: textField(TEXT_LIMITS.ticketSubject),
  description: textField(TEXT_LIMITS.ticketDescription),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  category: textField(TEXT_LIMITS.ticketCategory).optional(),
});

export const submitSupportContactSchema = z.object({
  name: textField(TEXT_LIMITS.contactName, { trim: true }),
  email: emailField,
  message: textField(TEXT_LIMITS.contactMessage, { trim: true }),
  website: honeypotField,
  fillMs: fillMsField,
});

export const addTicketMessageSchema = z.object({
  text: textField(TEXT_LIMITS.ticketMessage),
});

export const listTicketsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});
