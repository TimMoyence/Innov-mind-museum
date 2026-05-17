import { AppError } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { NonceStore } from '@modules/auth/domain/ports/nonce-store.port';
import type {
  SocialTokenVerifier,
  SocialProvider,
} from '@modules/auth/domain/ports/social-token-verifier.port';
import type { ISocialAccountRepository } from '@modules/auth/domain/social-account/socialAccount.repository.interface';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type {
  AuthSessionService,
  AuthSessionResponse,
} from '@modules/auth/useCase/session/authSession.service';

const APPLE_PRIVATE_RELAY_SUFFIX = '@privaterelay.appleid.com';

const invalidNonce = (): AppError =>
  new AppError({
    message: 'Invalid or replayed nonce',
    statusCode: 401,
    code: 'INVALID_NONCE',
  });

export class SocialLoginUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly socialAccountRepository: ISocialAccountRepository,
    private readonly authSessionService: AuthSessionService,
    private readonly socialTokenVerifier: SocialTokenVerifier,
    private readonly nonceStore?: NonceStore,
  ) {}

  /** F3 — atomic consume; fail fast when enforcement on but none provided. */
  private async assertNonce(nonce: string | undefined): Promise<void> {
    if (nonce === undefined) {
      if (env.auth.oidcNonceEnforce) throw invalidNonce();
      return;
    }
    if (!this.nonceStore) {
      // Wiring error: nonce sent but no store to validate it.
      throw invalidNonce();
    }
    const consumed = await this.nonceStore.consume(nonce);
    if (!consumed) throw invalidNonce();
  }

  /**
   * Flow: verify → find link → link by email → create. Apple private-relay
   * emails are NOT used for account linking.
   *
   * F3 — `nonce` (when set) is atomically consumed BEFORE verifier invocation
   * (single-use revocation, ID-token replay defence) and threaded through to
   * {@link SocialTokenVerifier.verify} so the JWT-claim check runs against the
   * same value (defence-in-depth). Absent + `oidcNonceEnforce=true` → fail fast
   * INVALID_NONCE before hitting verifier.
   *
   * @throws {AppError} 400 missing idToken, 401 USER_NOT_FOUND on linked user,
   *   401 INVALID_NONCE on replay/missing-when-enforced.
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

    // Email match → link to existing user.
    const normalizedEmail = payload.email?.trim().toLowerCase();
    const isApplePrivateRelay =
      provider === 'apple' && normalizedEmail?.endsWith(APPLE_PRIVATE_RELAY_SUFFIX);

    if (normalizedEmail && !isApplePrivateRelay && payload.emailVerified) {
      const existingUser = await this.userRepository.getUserByEmail(normalizedEmail);
      if (existingUser) {
        await this.socialAccountRepository.create({
          userId: existingUser.id,
          provider,
          providerUserId: payload.providerUserId,
          email: normalizedEmail,
        });
        return await this.authSessionService.socialLogin(existingUser);
      }
    }

    // Create new user + social account.
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
