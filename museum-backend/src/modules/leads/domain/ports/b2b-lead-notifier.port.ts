export const B2B_LEAD_ROLES = ['director', 'curator', 'digital', 'other'] as const;
export type B2bLeadRole = (typeof B2B_LEAD_ROLES)[number];

export interface B2bLeadPayload {
  email: string;
  name: string;
  museum: string;
  role: B2bLeadRole;
  message: string;
  consent: true;
  website?: string;
  suspect?: boolean;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

export interface B2bLeadNotifier {
  notify(payload: B2bLeadPayload): Promise<void>;
}
