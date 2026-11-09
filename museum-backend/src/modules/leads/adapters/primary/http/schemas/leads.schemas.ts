import { TEXT_LIMITS } from '@musaium/shared';
import { z } from 'zod';

import { B2B_LEAD_ROLES } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import { emailField } from '@shared/validation/email-field';
import { fillMsField, honeypotField } from '@shared/validation/honeypot';
import { textField } from '@shared/validation/text-field';

export const submitB2bLeadSchema = z.object({
  email: emailField,
  name: textField(TEXT_LIMITS.contactName, { trim: true }),
  museum: textField(TEXT_LIMITS.leadMuseum, { trim: true }),
  role: z.enum(B2B_LEAD_ROLES),
  message: textField(TEXT_LIMITS.contactMessage, { trim: true }),
  consent: z.literal(true),
  website: honeypotField,
  fillMs: fillMsField,
});

export type SubmitB2bLeadInput = z.infer<typeof submitB2bLeadSchema>;

export const submitBetaSignupSchema = z.object({
  email: emailField,
  consent: z.literal(true),
  website: honeypotField,
  fillMs: fillMsField,
});

export type SubmitBetaSignupInput = z.infer<typeof submitBetaSignupSchema>;

export const submitPaywallInterestSchema = z.object({
  email: emailField,
  consent: z.literal(true),
  website: honeypotField,
  fillMs: fillMsField,
});

export type SubmitPaywallInterestInput = z.infer<typeof submitPaywallInterestSchema>;
