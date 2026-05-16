/**
 * R3 — Test factory for `BetaSignupPayload`.
 *
 * The production type `BetaSignupPayload` does NOT exist yet (green-code-agent
 * adds it in T2). At baseline this factory typechecks against the local shape
 * defined here and tests cast its result to whatever the use case expects. The
 * shape mirrors R3.md §3.3 + §3.4 implementation contract.
 *
 * Per CLAUDE.md §Test Discipline — DRY Factories: inline domain objects in
 * tests are forbidden. Tests for the beta-signup module MUST use this factory.
 */

/** Payload shape exchanged between FE form, route, use case and notifier. */
export interface BetaSignupPayload {
  email: string;
  consent: true;
  /** Honeypot — must be empty for a non-spam submission (R3 §1 R10). */
  website?: string;
  ip?: string;
  requestId?: string;
  userAgent?: string;
}

/**
 * Builds a valid beta-signup payload. Overrides let tests flip ONE field at a
 * time without re-declaring the whole shape (DRY discipline).
 * @param overrides - Partial payload override; merged on top of the default valid signup.
 * @returns A fully-formed valid `BetaSignupPayload` with overrides applied.
 */
export function makeBetaSignupPayload(
  overrides: Partial<BetaSignupPayload> = {},
): BetaSignupPayload {
  return {
    email: 'visitor@example.com',
    consent: true,
    website: '',
    ...overrides,
  };
}
