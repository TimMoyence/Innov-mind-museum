/**
 * Domain port — access-token revocation by `jti` (RFC 7519 §4.1.7).
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R7-R9 (I-SEC7b).
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.1 D1/D5/D9.
 *
 * Two adapters exist :
 *   - `RedisAccessTokenDenylist` — Redis-backed, fail-OPEN on connection error
 *     (R9 — denylist is defense-in-depth, NOT primary identity layer ; a Redis
 *     outage MUST NOT convert into a global auth outage).
 *   - `NoopAccessTokenDenylist` / `InMemoryAccessTokenDenylist` — dev + tests.
 *
 * `add()` is idempotent ; callers MUST NOT special-case duplicate `jti`.
 * `has()` SHALL NEVER throw (fail-OPEN contract enforced by every adapter).
 */
export interface IAccessTokenDenylist {
  /**
   * Mark `jti` as revoked for `ttlSec` seconds. `ttlSec <= 0` is a no-op
   * (token already expired naturally — no point burning a Redis key with
   * negative TTL).
   */
  add(jti: string, ttlSec: number): Promise<void>;

  /**
   * Returns `true` iff `jti` is currently denylisted. MUST NOT throw —
   * adapters wrap backing-store errors and return `false` (fail-OPEN, R9).
   */
  has(jti: string): Promise<boolean>;
}
