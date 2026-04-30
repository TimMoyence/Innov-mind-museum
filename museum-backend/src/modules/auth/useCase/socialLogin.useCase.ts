import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { AuthSessionService, AuthSessionResponse } from './authSession.service';
import type { NonceStore } from '../domain/nonce-store.port';
import type { SocialTokenVerifier, SocialProvider } from '../domain/social-token-verifier.port';
import type { ISocialAccountRepository } from '../domain/socialAccount.repository.interface';
import type { IUserRepository } from '../domain/user.repository.interface';

const APPLE_PRIVATE_RELAY_SUFFIX = '@privaterelay.appleid.com';

const invalidNonce = (): AppError =>
  new AppError({
    message: 'Invalid or replayed nonce',
    statusCode: 401,
    code: 'INVALID_NONCE',
  });

/**
 * Orchestrates social sign-in (Apple / Google): verifies the provider ID token,
 * links or creates the user account, and issues an auth session.
 */
export class SocialLoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly socialAccountRepository: ISocialAccountRepository,
    private readonly authSessionService: AuthSessionService,
    private readonly socialTokenVerifier: SocialTokenVerifier,
    private readonly nonceStore?: NonceStore,
  ) {}

  /**
   * F3 — atomically consume the server-issued nonce, or fail fast when
   * enforcement is on and none was provided. Extracted so the main `execute`
   * flow stays under the cyclomatic-complexity ceiling.
   */
  private async assertNonce(nonce: string | undefined): Promise<void> {
    if (nonce === undefined) {
      if (env.auth.oidcNonceEnforce) throw invalidNonce();
      return;
    }
    if (!this.nonceStore) {
      // Wiring error: a nonce was sent but no store exists to validate it.
      throw invalidNonce();
    }
    const consumed = await this.nonceStore.consume(nonce);
    if (!consumed) throw invalidNonce();
  }

  /**
   * Authenticate via a social provider's ID token.
   *
   * Flow: verify token -> find existing link -> link by email -> create new user.
   * Apple private-relay emails are not used for account linking.
   *
   * F3 — when `nonce` is provided, the use case atomically consumes the
   * server-issued nonce *before* the verifier is invoked (single-use
   * revocation, defends against ID-token replay) and threads the same value
   * through to {@link SocialTokenVerifier.verify} so the JWT-claim check
   * runs against the same expected value (defence-in-depth).
   *
   * When `nonce` is absent and `env.auth.oidcNonceEnforce` is `true`, the
   * use case fails fast with `INVALID_NONCE` *before* hitting the verifier.
   *
   * @param provider - The social provider (`"apple"` or `"google"`).
   * @param idToken - The raw ID token from the provider.
   * @param nonce - Optional server-issued nonce (raw value, pre-hash for Apple).
   * @returns Access/refresh tokens and user info.
   * @throws {AppError} 400 if `idToken` is missing, 401 if the linked user is not found,
   *   401 `INVALID_NONCE` on replay / missing-when-enforced.
   */
  async execute(
    provider: SocialProvider,
    idToken: string,
    nonce?: string,
  ): Promise<AuthSessionResponse> {
    if (!idToken.trim()) {
      throw new AppError({
        message: 'idToken is required',
        statusCode: 400,
        code: 'BAD_REQUEST',
      });
    }

    await this.assertNonce(nonce);

    const payload = await this.socialTokenVerifier.verify(provider, idToken, nonce);

    // Look up existing social account
    const existingLink = await this.socialAccountRepository.findByProviderAndProviderUserId(
      provider,
      payload.providerUserId,
    );

    if (existingLink) {
      const user = await this.userRepository.getUserById(existingLink.userId);
      if (!user) {
        throw new AppError({
          message: 'User not found',
          statusCode: 401,
          code: 'USER_NOT_FOUND',
        });
      }
      return await this.authSessionService.socialLogin(user);
    }

    // Check if email matches existing user (account linking)
    const normalizedEmail = payload.email?.trim().toLowerCase();
    const isApplePrivateRelay =
      provider === 'apple' && normalizedEmail?.endsWith(APPLE_PRIVATE_RELAY_SUFFIX);

    if (normalizedEmail && !isApplePrivateRelay && payload.emailVerified) {
      const existingUser = await this.userRepository.getUserByEmail(normalizedEmail);
      if (existingUser) {
        // Link social account to existing user
        await this.socialAccountRepository.create({
          userId: existingUser.id,
          provider,
          providerUserId: payload.providerUserId,
          email: normalizedEmail,
        });
        return await this.authSessionService.socialLogin(existingUser);
      }
    }

    // Create new user + social account
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    const email = normalizedEmail || `${payload.providerUserId}@${provider}.social`;
    const newUser = await this.userRepository.registerSocialUser(
      email,
      payload.firstname,
      payload.lastname,
    );

    await this.socialAccountRepository.create({
      userId: newUser.id,
      provider,
      providerUserId: payload.providerUserId,
      email: normalizedEmail,
    });

    return await this.authSessionService.socialLogin(newUser);
  }
}
