import { TEXT_LIMITS } from '@musaium/shared';
import { z } from 'zod';

import { B2B_LEAD_ROLES } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import { emailField } from '@shared/validation/email-field';
import { fillMsField, honeypotField } from '@shared/validation/honeypot';
import { textField } from '@shared/validation/text-field';

/**
 * `POST /api/leads/b2b` (R4 §1 R6 + §3.4). `consent` MUST be literal `true`
 * (R11 defense-in-depth — rejects `false`, `'true'`, undefined). `website`
 * is honeypot; silent-drop policed in use case (R10), not schema.
 */
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

/**
 * `POST /api/leads/beta` (R3 §1 R6 + §3.4). Same consent / honeypot rules
 * as B2B. Minimal shape (email + consent + honeypot) for low friction.
 */
export const submitBetaSignupSchema = z.object({
  email: emailField,
  consent: z.literal(true),
  website: honeypotField,
  fillMs: fillMsField,
});

export type SubmitBetaSignupInput = z.infer<typeof submitBetaSignupSchema>;

/**
 * `POST /api/leads/paywall-interest` (R1 §1 R18 + R22). Same shape as
 * `submitBetaSignupSchema`. Q5/N6 — modal still requires explicit consent
 * checkbox; schema does NOT auto-derive `consent` from modal context.
 */
export const submitPaywallInterestSchema = z.object({
  email: emailField,
  consent: z.literal(true),
  website: honeypotField,
  fillMs: fillMsField,
});

export type SubmitPaywallInterestInput = z.infer<typeof submitPaywallInterestSchema>;
