/** R4 §1 R6. */
export const B2B_LEAD_ROLES = ['director', 'curator', 'digital', 'other'] as const;
export type B2bLeadRole = (typeof B2B_LEAD_ROLES)[number];

/** R4 §3.4. */
export interface B2bLeadPayload {
  email: string;
  name: string;
  museum: string;
  role: B2bLeadRole;
  message: string;
  consent: true;
  /** Honeypot — must be empty for non-spam (R4 §1 R10). */
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export interface B2bLeadNotifier {
  notify(payload: B2bLeadPayload): Promise<void>;
}
