/**
 * Cross-module port for GDPR right-to-erasure (Art.17, B1) TTS audio cleanup.
 * Lives in `shared/` so the auth module's `DeleteAccountUseCase` depends on the
 * contract without a static-type dependency on the chat module. The runtime
 * proxy (auth composition root) resolves the user's audio refs from the chat
 * repository and deletes each via `AudioStorage.deleteByRef`, bridging the two
 * modules via lazy import to avoid circular init.
 *
 * Audio object keys (`chat-audios/YYYY/MM/<uuid>`) carry NO user segment, so a
 * `deleteByPrefix`-style scan is impossible — the per-user resolution is a DB
 * ref lookup, deliberately NOT exposed as a prefix delete (shipping a no-op
 * prefix delete would be dishonest, UFR-013).
 */
export interface AudioCleanupPort {
  /**
   * Deletes every stored TTS audio object owned by the user. Best-effort: the
   * implementation resolves the refs and attempts each deletion; the caller
   * (deletion use case) swallows failures so the DB erasure is never aborted.
   */
  deleteUserAudio(userId: number): Promise<void>;
}

/**
 * Narrow cross-module port for GDPR erasure marketing-contact removal (B2).
 * The auth deletion use case depends on this minimal shape rather than the full
 * leads `BetaSignupNotifier`, so the lazy proxy can bridge to Brevo without auth
 * taking a static-type dependency on the leads adapter.
 */
export interface MarketingContactRemovalPort {
  removeContact(email: string): Promise<unknown>;
}

/**
 * Cycle D (R5) — durable fallback for a FAILED inline Brevo `removeContact`
 * during account deletion. Rather than warn-and-drop (which leaves residual
 * third-party PII), the deletion use case enqueues a durable erasure intent
 * (a `brevo_erasure` lead) the WS-B redelivery cron retries until success/404.
 * The auth use case depends on this minimal shape; the composition root binds
 * it lazily to the leads repository (no static auth→leads dependency).
 */
export interface MarketingErasureFallbackPort {
  /** Persist a durable intent to remove the Brevo contact for `email`. */
  enqueueBrevoErasure(email: string): Promise<void>;
}

/**
 * Cycle D (R6) — narrow projection of `ILeadRepository.deleteByEmail` so the
 * auth deletion use case can purge persisted `leads` rows carrying the account
 * email (GDPR Art.17) BEFORE the DB cascade, without a static-type dependency
 * on the leads adapter.
 */
export interface LeadErasurePort {
  /** Hard-delete every `leads` row whose stored email matches. Returns rows deleted. */
  deleteByEmail(emailNormalized: string): Promise<number>;
}
