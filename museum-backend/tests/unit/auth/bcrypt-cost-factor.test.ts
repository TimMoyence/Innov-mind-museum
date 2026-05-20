/**
 * TD-BC / TD-29 guard — pins the bcrypt cost factor floor.
 *
 * OWASP (2025/2026) recommends a bcrypt work factor of >= 12 for interactive
 * password hashing. `BCRYPT_ROUNDS` is the single source of truth consumed by
 * every `bcrypt.hash` call site (user.repository.pg, resetPassword.useCase,
 * recoveryCodes, seed-smoke-account). This test fails loudly if anyone drops it
 * below the floor — a silent downgrade would weaken every newly-hashed password.
 *
 * The migration path off bcrypt (→ argon2id) is tracked in
 * docs/PASSWORD_HASH_MIGRATION.md (TD-29).
 */

import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

describe('bcrypt cost factor (TD-BC / TD-29)', () => {
  it('BCRYPT_ROUNDS is at least 12 (OWASP 2026 floor)', () => {
    expect(BCRYPT_ROUNDS).toBeGreaterThanOrEqual(12);
  });

  it('BCRYPT_ROUNDS stays within a sane upper bound (<= 15) to avoid login latency cliffs', () => {
    // bcrypt cost is exponential: 15 ≈ 8× the work of 12. Above ~15 the
    // per-login hash time on the prod CPU profile exceeds the auth budget.
    expect(BCRYPT_ROUNDS).toBeLessThanOrEqual(15);
  });
});
