import { verifySocialIdToken } from './social-token-verifier';

import type {
  SocialTokenVerifier,
  SocialProvider,
  SocialTokenPayload,
} from '@modules/auth/domain/ports/social-token-verifier.port';

/**
 * Adapter that implements the {@link SocialTokenVerifier} port
 * by delegating to the existing `verifySocialIdToken` function.
 */
export class SocialTokenVerifierAdapter implements SocialTokenVerifier {
  /** Verifies a social login ID token and returns the decoded payload. */
  async verify(
    provider: SocialProvider,
    idToken: string,
    expectedNonce?: string,
  ): Promise<SocialTokenPayload> {
    return await verifySocialIdToken(provider, idToken, expectedNonce);
  }
}
