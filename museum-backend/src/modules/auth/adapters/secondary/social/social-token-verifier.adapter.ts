import { verifySocialIdToken } from './social-token-verifier';

import type {
  SocialTokenVerifier,
  SocialProvider,
  SocialTokenPayload,
} from '@modules/auth/domain/ports/social-token-verifier.port';

export class SocialTokenVerifierAdapter implements SocialTokenVerifier {
  async verify(
    provider: SocialProvider,
    idToken: string,
    expectedNonce?: string,
  ): Promise<SocialTokenPayload> {
    return await verifySocialIdToken(provider, idToken, expectedNonce);
  }
}
