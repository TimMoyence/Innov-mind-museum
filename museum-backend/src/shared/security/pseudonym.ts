import { createHash } from 'node:crypto';

/**
 * Pseudonymises an identifier (user_id / email / etc.) for inclusion in
 * admin CSV exports (R2 §3.6 / R17 / R18 / R19).
 *
 * SHA-256 over `salt|value` then truncate to 16 hex chars (64 bits ≈
 * collision-resistant at our cardinality, fits within an audit column).
 *
 * The salt MUST be stable across requests so the same museum_manager can
 * correlate `user_id_pseudonym=abc123` between successive exports without
 * learning the raw id. Rotation is documented as a privacy-incident-only
 * operation (Risk8).
 *
 * Pure / synchronous / no I/O.
 *
 * @param value - Raw identifier (integer id or email). Coerced via String().
 * @param salt - Stable secret (loaded from env upstream; defaults to a
 *   constant in non-prod tests so fixtures stay deterministic).
 * @returns 16-char lowercase hex digest.
 */
export function pseudonymise(value: string | number, salt: string): string {
  return createHash('sha256')
    .update(`${salt}|${String(value)}`)
    .digest('hex')
    .slice(0, 16);
}
