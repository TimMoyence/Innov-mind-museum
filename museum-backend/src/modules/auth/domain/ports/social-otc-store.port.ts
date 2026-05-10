/**
 * Port for short-lived, single-use one-time-codes that ferry an authenticated
 * session payload from the server-mediated OAuth callback to a mobile client
 * (F11-mobile, 2026-05).
 *
 * Why an OTC instead of putting tokens directly in the deeplink:
 *   - Refresh tokens are long-lived; leaking them via a query string on a
 *     URL bar / app-switch handoff would be unrecoverable.
 *   - The OTC is opaque, single-use, and TTL-bounded. Even if the deeplink
 *     leaks (logs, screenshots, app-switch peek), an attacker has at most
 *     a handful of seconds before the legitimate client redeems it first.
 *
 * Implementations MUST guarantee:
 *   - `issue(payload)` returns ≥128 bits of entropy.
 *   - `consume(code)` is atomic and idempotent — at most one caller ever
 *     receives the payload; subsequent calls (or post-TTL replays) return
 *     `null`.
 *   - Entries expire after `SOCIAL_OTC_TTL_SECONDS` (default 60s, override
 *     via env).
 */
export interface SocialOtcStore<TPayload> {
  /**
   * Persist an arbitrary session payload under a fresh code with a short TTL,
   * and return the code to the caller for delivery via the OAuth callback
   * deeplink.
   *
   * @returns A base64url-encoded code string (≥22 chars / 128 bits).
   */
  issue(payload: TPayload): Promise<string>;

  /**
   * Atomically delete the stored entry and return its payload. Returns `null`
   * when the code is unknown, already consumed, or past its TTL.
   *
   * @param code - Code value sent by the client in the redeem call.
   */
  consume(code: string): Promise<TPayload | null>;
}
