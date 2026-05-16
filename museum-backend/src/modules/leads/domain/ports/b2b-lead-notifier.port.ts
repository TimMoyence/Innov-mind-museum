/** Allowed roles for a B2B lead submission (R4 §1 R6). */
export const B2B_LEAD_ROLES = ['director', 'curator', 'digital', 'other'] as const;
/**
 *
 */
export type B2bLeadRole = (typeof B2B_LEAD_ROLES)[number];

/** Payload delivered by the public B2B-lead form (R4 §3.4). */
export interface B2bLeadPayload {
  email: string;
  name: string;
  museum: string;
  role: B2bLeadRole;
  message: string;
  consent: true;
  /** Honeypot — must be empty for a non-spam submission (R4 §1 R10). */
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

/** Outbound port used to forward public B2B-lead submissions. */
export interface B2bLeadNotifier {
  notify(payload: B2bLeadPayload): Promise<void>;
}
