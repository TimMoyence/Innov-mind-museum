import { z } from 'zod';

import { B2B_LEAD_ROLES } from '@modules/leads/domain/ports/b2b-lead-notifier.port';

/**
 * Schema for `POST /api/leads/b2b` (R4 §1 R6 + §3.4).
 *
 * - `consent` MUST literally be `true` (defense-in-depth on top of the FE
 *   checkbox, R11) — `z.literal(true)` rejects `false`, `'true'`, undefined.
 * - `website` is the honeypot field. Schema accepts it as an optional string
 *   so silent-drop policing happens in the use case (R10), not the schema.
 */
export const submitB2bLeadSchema = z.object({
  email: z.email().trim().max(254),
  name: z.string().trim().min(1).max(120),
  museum: z.string().trim().min(1).max(200),
  role: z.enum(B2B_LEAD_ROLES),
  message: z.string().trim().min(10).max(5000),
  consent: z.literal(true),
  website: z.string().max(500).optional(),
});

/**
 *
 */
export type SubmitB2bLeadInput = z.infer<typeof submitB2bLeadSchema>;
