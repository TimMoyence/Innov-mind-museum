import { createHash } from 'node:crypto';

/**
 * Pseudonymises identifier (user_id/email) for admin CSV exports
 * (R2 §3.6 / R17 / R18 / R19).
 *
 * SHA-256(`salt|value`) truncated to 16 hex (64 bits, collision-resistant at
 * our cardinality). Salt MUST be stable across requests so museum_manager can
 * correlate same pseudonym across exports without learning raw id. Pure/sync.
 *
 * **Rotation doctrine** (I-SEC5, 2026-05-21) — rotating `EXPORT_PSEUDONYM_SALT`
 * is reserved for privacy incident response. Post-rotation pseudonyms are
 * intentionally NON-correlatable with pre-rotation outputs — that is the
 * property we want : a leaked CSV becomes computationally useless to re-link
 * to the new identifier space without re-running the export with the new
 * salt. See `docs/SECURITY.md#export-salt-rotation`.
 *
 * Prod boot fail-fast (`env.production-validation.ts::validateExportPseudonymSalt`)
 * guarantees the salt is present and >= 32 chars before any request lands.
 */
export function pseudonymise(value: string | number, salt: string): string {
  return createHash('sha256')
    .update(`${salt}|${String(value)}`)
    .digest('hex')
    .slice(0, 16);
}
