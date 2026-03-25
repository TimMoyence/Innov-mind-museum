import type {
  SocialTokenVerifier,
  SocialProvider,
  SocialTokenPayload,
} from '../../core/domain/social-token-verifier.port';
import { verifySocialIdToken } from './social-token-verifier';

/**
 * Adapter that implements the {@link SocialTokenVerifier} port
 * by delegating to the existing `verifySocialIdToken` function.
 */
export class SocialTokenVerifierAdapter implements SocialTokenVerifier {
  async verify(provider: SocialProvider, idToken: string): Promise<SocialTokenPayload> {
    return verifySocialIdToken(provider, idToken);
  }
}
