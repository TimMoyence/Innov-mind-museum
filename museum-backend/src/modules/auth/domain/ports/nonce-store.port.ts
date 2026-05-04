/**
 * Port for short-lived, single-use nonces issued during OIDC social login
 * (audit finding F3 — OIDC nonce verification).
 *
 * Mitigates ID-token replay (OIDC Core 1.0 §15.5.2): each social-login attempt
 * is bound to a server-issued nonce. The mobile client passes the nonce to the
 * native SDK (Apple SHA-256-hashes it before embedding) and, on submit, the
 * backend asserts the nonce claim AND atomically removes the stored nonce so
 * the same ID token can never be redeemed twice.
 *
 * Implementations MUST guarantee:
 *   - `issue()` returns ≥128 bits of entropy.
 *   - `consume()` is atomic and idempotent — at most one caller sees `true`.
 *   - Entries expire after `SOCIAL_NONCE_TTL_SECONDS` (default 300s).
 */
export interface NonceStore {
  /**
   * Persist a fresh nonce with a short TTL and return its value to the caller.
   *
   * @returns A base64url-encoded nonce string (≥22 chars / 128 bits).
   */
  issue(): Promise<string>;

  /**
   * Atomically delete the stored nonce. Returns `true` only if the nonce was
   * present and unexpired at call time — subsequent calls (or replays after
   * expiry) MUST return `false`.
   *
   * @param nonce - Nonce value sent by the client (matches the ID-token claim).
   * @returns `true` on first redemption inside TTL, `false` otherwise.
   */
  consume(nonce: string): Promise<boolean>;
}
