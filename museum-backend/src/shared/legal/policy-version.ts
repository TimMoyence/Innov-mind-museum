/**
 * Single source of truth for the privacy / terms-of-service policy version
 * persisted alongside GDPR consent records. Bump this string whenever the
 * privacy policy or ToS is materially updated; existing rows keep their
 * historical version so we can re-prompt users whose consent predates the
 * change.
 *
 * Format: ISO date of the policy revision (YYYY-MM-DD).
 * Length must stay ≤ 32 chars to fit `user_consents.version` (VARCHAR(32)).
 */
export const POLICY_VERSION = '2026-06-01';
