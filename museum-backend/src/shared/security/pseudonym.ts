import { createHash } from 'node:crypto';

/**
 * Pseudonymises identifier (user_id/email) for admin CSV exports
 * (R2 §3.6 / R17 / R18 / R19).
 *
 * SHA-256(`salt|value`) truncated to 16 hex (64 bits, collision-resistant at
 * our cardinality). Salt MUST be stable across requests so museum_manager can
 * correlate same pseudonym across exports without learning raw id. Rotation
 * = privacy-incident-only (Risk8). Pure/sync.
 */
export function pseudonymise(value: string | number, salt: string): string {
  return createHash('sha256')
    .update(`${salt}|${String(value)}`)
    .digest('hex')
    .slice(0, 16);
}
