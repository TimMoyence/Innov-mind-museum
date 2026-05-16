/**
 * R4 — Test factory for B2bLeadPayload.
 *
 * The production type `B2bLeadPayload` does NOT exist yet (green-code-agent
 * adds it in T2). At baseline this factory typechecks against `unknown` and
 * tests cast its result to whatever shape the use case expects. The shape
 * below mirrors R4.md §3.4 implementation contract.
 *
 * Per CLAUDE.md §Test Discipline — DRY Factories: inline domain objects in
 * tests are forbidden. Tests for the leads module MUST use this factory.
 */

/** Roles accepted by `submitB2bLeadSchema` (R4 §1 R6). */
export const B2B_LEAD_ROLES = ['director', 'curator', 'digital', 'other'] as const;
export type B2bLeadRole = (typeof B2B_LEAD_ROLES)[number];

export interface B2bLeadPayload {
  email: string;
  name: string;
  museum: string;
  role: B2bLeadRole;
  message: string;
  consent: true;
  /** Honeypot — must be empty for a non-spam submission. */
  website?: string;
}

/**
 * Builds a valid B2B lead payload. Overrides let tests flip ONE field at a
 * time without re-declaring the whole shape (DRY discipline).
 * @param overrides - Partial payload override; merged on top of the default valid lead.
 * @returns A fully-formed valid `B2bLeadPayload` with overrides applied.
 */
export function makeB2bLeadPayload(overrides: Partial<B2bLeadPayload> = {}): B2bLeadPayload {
  return {
    email: 'sales@museum.fr',
    name: 'Alice Curator',
    museum: 'Louvre Lens',
    role: 'director',
    message: 'We would like to discuss Musaium for our 2026 season programming.',
    consent: true,
    website: '',
    ...overrides,
  };
}
