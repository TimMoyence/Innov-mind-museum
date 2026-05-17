/**
 * Single-use nonces for OIDC social login (audit F3 — OIDC nonce verification).
 *
 * Mitigates ID-token replay (OIDC Core 1.0 §15.5.2): mobile client passes the
 * server-issued nonce to the native SDK (Apple SHA-256-hashes it before
 * embedding); backend asserts the nonce claim AND atomically removes it.
 *
 * Impls MUST guarantee:
 *   - `issue()` returns ≥128 bits of entropy.
 *   - `consume()` is atomic + idempotent — at most one caller sees `true`.
 *   - Entries expire after `SOCIAL_NONCE_TTL_SECONDS` (default 300s).
 */
export interface NonceStore {
  /** @returns base64url-encoded nonce (≥22 chars / 128 bits). */
  issue(): Promise<string>;

  /** Atomic. `true` only on first redemption inside TTL; subsequent calls + replays after expiry MUST return `false`. */
  consume(nonce: string): Promise<boolean>;
}
