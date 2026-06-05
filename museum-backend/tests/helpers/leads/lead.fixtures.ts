/**
 * Cycle B — Test factory for the persisted `Lead` (DTO) + insert input.
 *
 * Per CLAUDE.md §Test Discipline — DRY Factories: inline domain objects in
 * tests are forbidden. Tests for the persisted-lead path MUST use these
 * factories. Mirror sibling payload factories (`betaSignup.fixtures.ts`,
 * `b2bLead.fixtures.ts`) for the embedded payload shape.
 */
import { makeBetaSignupPayload } from 'tests/helpers/leads/betaSignup.fixtures';

import type { InsertLeadInput, LeadDTO, LeadPayload } from '@modules/leads/domain/lead/lead.types';

const FIXED_NOW = '2026-05-27T10:00:00.000Z';

/**
 * Builds a valid persisted-lead DTO (default: a `beta` lead, `pending`).
 * Overrides flip ONE field at a time without re-declaring the whole shape.
 * @param overrides - Partial DTO override; merged on top of the default lead.
 * @returns A fully-formed valid `LeadDTO` with overrides applied.
 */
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

/**
 * Builds a valid `InsertLeadInput` (default: a `beta` lead, no dedupKey).
 * Overrides flip ONE field at a time (DRY discipline).
 * @param overrides - Partial input override; merged on top of the default input.
 * @returns A fully-formed valid `InsertLeadInput` with overrides applied.
 */
export function makeLeadInput(overrides: Partial<InsertLeadInput> = {}): InsertLeadInput {
  return {
    type: 'beta',
    payload: makeBetaSignupPayload() as LeadPayload,
    dedupKey: null,
    ...overrides,
  };
}
