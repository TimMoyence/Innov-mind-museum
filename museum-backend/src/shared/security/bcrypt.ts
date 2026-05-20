/**
 * bcrypt cost factor — Musaium pinned floor (OWASP 2026: ≥ 12).
 *
 * Two layers enforce the floor :
 *   1. `withFloorAssert()` below — a module-load runtime guard that explodes
 *      at boot if a future edit lowers the constant below 12 (defense in
 *      depth ; production never gets to serve traffic with weak hashes).
 *   2. `tests/unit/auth/bcrypt-cost-factor.test.ts` — a Jest pin asserting
 *      the same floor in CI a hop earlier than boot.
 *
 * argon2id migration plan: `docs/PASSWORD_HASH_MIGRATION.md` (TD-29).
 */

/** OWASP 2026 floor — matched by the Jest pin. */
const BCRYPT_ROUNDS_FLOOR = 12;

/**
 * Returns `rounds` after asserting the OWASP floor. Wrapping the const in a
 * function call widens its TS type from the literal `12` to `number`, which
 * keeps `@typescript-eslint/no-unnecessary-condition` from optimising the
 * floor check away as a statically-known dead branch.
 *
 * Throws synchronously at module load — the chat backend refuses to boot
 * with weak hash parameters rather than serving traffic that produces
 * downgrade-able password hashes.
 */
function withFloorAssert(rounds: number): number {
  if (rounds < BCRYPT_ROUNDS_FLOOR) {
    throw new Error(
      `BCRYPT_ROUNDS (${String(rounds)}) is below the OWASP 2026 floor (${String(BCRYPT_ROUNDS_FLOOR)}). Refusing to boot.`,
    );
  }
  return rounds;
}

export const BCRYPT_ROUNDS = withFloorAssert(12);
