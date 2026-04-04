/** Supported social OAuth providers. */
export type SocialProvider = 'apple' | 'google';

/** Decoded identity claims extracted from a social provider's ID token. */
export interface SocialTokenPayload {
  /** Provider-specific unique user identifier (`sub` claim). */
  providerUserId: string;
  /** User email from the token, or `null` if unavailable. */
  email: string | null;
  /** Whether the provider has verified the email address. */
  emailVerified: boolean;
  /** First name (may be absent, e.g. Apple only sends name on first auth). */
  firstname?: string;
  /** Last name. */
  lastname?: string;
}

/**
 * Port for verifying social provider ID tokens.
 * Implementations dispatch to the appropriate provider (Apple / Google).
 */
export interface SocialTokenVerifier {
  /**
   * Verifies an ID token from the given social provider.
   *
   * @param provider - Social provider (`apple` or `google`).
   * @param idToken - Raw JWT string from the provider.
   * @returns Decoded identity claims.
   * @throws {Error} For unsupported providers or invalid tokens.
   */
  verify(provider: SocialProvider, idToken: string): Promise<SocialTokenPayload>;
}
