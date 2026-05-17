/**
 * Single-use OTC ferrying an authenticated session payload from the
 * server-mediated OAuth callback to a mobile client (F11-mobile, 2026-05).
 *
 * Why OTC instead of tokens in the deeplink: refresh tokens are long-lived —
 * leaking via URL bar / app-switch handoff would be unrecoverable. The OTC is
 * opaque, single-use, TTL-bounded — even on deeplink leak, attacker has a
 * handful of seconds before legitimate client redeems first.
 *
 * Impls MUST guarantee:
 *   - `issue(payload)` returns ≥128 bits of entropy.
 *   - `consume(code)` is atomic + idempotent — at most one caller receives
 *     the payload; subsequent calls + post-TTL replays return `null`.
 *   - Entries expire after `SOCIAL_OTC_TTL_SECONDS` (default 60s).
 */
export interface SocialOtcStore<TPayload> {
  /** @returns base64url-encoded code (≥22 chars / 128 bits). */
  issue(payload: TPayload): Promise<string>;

  /** Atomic. Returns `null` if unknown, already consumed, or past TTL. */
  consume(code: string): Promise<TPayload | null>;
}
