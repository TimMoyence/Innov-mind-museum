import { makeBetaSignupPayload } from 'tests/helpers/leads/betaSignup.fixtures';

import type { InsertLeadInput, LeadDTO, LeadPayload } from '@modules/leads/domain/lead/lead.types';

const FIXED_NOW = '2026-05-27T10:00:00.000Z';

export function makeLead(overrides: Partial<LeadDTO> = {}): LeadDTO {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'beta',
    status: 'pending',
    payload: makeBetaSignupPayload() as LeadPayload,
    dedupKey: null,
    attempts: 0,
    lastError: null,
    nextEligibleAt: null,
    deliveredAt: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

export function makeLeadInput(overrides: Partial<InsertLeadInput> = {}): InsertLeadInput {
  return {
    type: 'beta',
    payload: makeBetaSignupPayload() as LeadPayload,
    dedupKey: null,
    ...overrides,
  };
}
