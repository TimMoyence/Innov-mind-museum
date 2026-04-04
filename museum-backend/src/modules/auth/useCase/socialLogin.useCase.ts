import { AppError } from '@shared/errors/app.error';

import type { AuthSessionService, AuthSessionResponse } from './authSession.service';
import type { SocialTokenVerifier, SocialProvider } from '../domain/social-token-verifier.port';
import type { ISocialAccountRepository } from '../domain/socialAccount.repository.interface';
import type { IUserRepository } from '../domain/user.repository.interface';

const APPLE_PRIVATE_RELAY_SUFFIX = '@privaterelay.appleid.com';

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
  ) {}

  /**
   * Authenticate via a social provider's ID token.
   *
   * Flow: verify token -> find existing link -> link by email -> create new user.
   * Apple private-relay emails are not used for account linking.
   *
   * @param provider - The social provider (`"apple"` or `"google"`).
   * @param idToken - The raw ID token from the provider.
   * @returns Access/refresh tokens and user info.
   * @throws {AppError} 400 if `idToken` is missing, 401 if the linked user is not found.
   */
  async execute(provider: SocialProvider, idToken: string): Promise<AuthSessionResponse> {
    if (!idToken.trim()) {
      throw new AppError({
        message: 'idToken is required',
        statusCode: 400,
        code: 'BAD_REQUEST',
      });
    }

    const payload = await this.socialTokenVerifier.verify(provider, idToken);

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
      return await this.authSessionService.socialLogin(user as unknown as Record<string, unknown>);
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
        return await this.authSessionService.socialLogin(
          existingUser as unknown as Record<string, unknown>,
        );
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

    return await this.authSessionService.socialLogin(newUser as unknown as Record<string, unknown>);
  }
}
