import type { B2bLeadPayload } from '@modules/leads/domain/ports/b2b-lead-notifier.port';
import type { BetaSignupPayload } from '@modules/leads/domain/ports/beta-signup-notifier.port';

export type LeadType = 'b2b' | 'beta' | 'paywall' | 'brevo_erasure';

export type LeadStatus = 'pending' | 'delivered' | 'failed';

export interface BrevoErasurePayload {
  email: string;
}

export type LeadPayload = B2bLeadPayload | BetaSignupPayload | BrevoErasurePayload;

export interface InsertLeadInput {
  type: LeadType;
  payload: LeadPayload;
  dedupKey?: string | null;
}

export interface LeadDTO {
  id: string;
  type: LeadType;
  status: LeadStatus;
  payload: LeadPayload;
  dedupKey: string | null;
  attempts: number;
  lastError: string | null;
  nextEligibleAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}
