export type SocialProvider = 'apple' | 'google';

export interface SocialTokenPayload {
  /** Provider-specific user id (`sub` claim). */
  providerUserId: string;
  /** `null` if unavailable. */
  email: string | null;
  emailVerified: boolean;
  /** May be absent — Apple only sends name on first auth. */
  firstname?: string;
  lastname?: string;
}

export interface SocialTokenVerifier {
  /**
   * F3 — when `expectedNonce` set, impls MUST assert ID token `nonce` claim:
   * Google directly (claim === expectedNonce), Apple via SHA-256
   * (`claim === sha256(expectedNonce)` lowercase hex). When `undefined`,
   * defers to `env.auth.oidcNonceEnforce` — `true` rejects with `INVALID_NONCE`,
   * `false` skips (migration window).
   *
   * @throws {AppError} `INVALID_NONCE` (401) on nonce mismatch.
   * @throws {Error} unsupported provider or invalid token.
   */
  verify(
    provider: SocialProvider,
    idToken: string,
    expectedNonce?: string,
  ): Promise<SocialTokenPayload>;
}
