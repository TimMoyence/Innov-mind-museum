/**
 * F3 — `SocialLoginUseCase` nonce orchestration.
 *
 * Asserts the use case:
 *   1. Consumes the stored nonce *before* the verifier is invoked.
 *   2. Threads the same nonce through to `verifier.verify()` so the JWT-claim
 *      check (defence-in-depth) sees the same value.
 *   3. Rejects replays — a nonce returned by `consume() === false` MUST throw
 *      `INVALID_NONCE` without calling the verifier.
 *   4. When `env.auth.oidcNonceEnforce` is `true`, an absent nonce is rejected
 *      at the use-case boundary *before* hitting the verifier.
 */
import { SocialLoginUseCase } from '@modules/auth/useCase/socialLogin.useCase';
import { makeUser } from '../../helpers/auth/user.fixtures';
import {
  makeUserRepo,
  makeSocialAccountRepo,
  makeAuthSessionServiceMock,
} from '../../helpers/auth/user-repo.mock';

import type { NonceStore } from '@modules/auth/domain/nonce-store.port';
import type { SocialTokenVerifier } from '@modules/auth/domain/social-token-verifier.port';

let oidcNonceEnforce = false;

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      get oidcNonceEnforce(): boolean {
        return oidcNonceEnforce;
      },
    },
  },
}));

const makeNonceStore = (): jest.Mocked<NonceStore> => ({
  issue: jest.fn().mockResolvedValue('issued-nonce'),
  consume: jest.fn().mockResolvedValue(true),
});

const makeMocks = () => {
  const userRepo = makeUserRepo();
  const socialAccountRepo = makeSocialAccountRepo();
  const authSessionService = makeAuthSessionServiceMock();
  const verifier: jest.Mocked<SocialTokenVerifier> = { verify: jest.fn() };
  const nonceStore = makeNonceStore();
  return { userRepo, socialAccountRepo, authSessionService, verifier, nonceStore };
};

describe('SocialLoginUseCase — F3 nonce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    oidcNonceEnforce = false;
  });

  it('consumes the nonce and threads it to the verifier on a happy path', async () => {
    const { userRepo, socialAccountRepo, authSessionService, verifier, nonceStore } = makeMocks();
    const user = makeUser();
    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue({
      id: 'sa-1',
      userId: user.id,
      provider: 'google',
      providerUserId: 'goog-1',
      email: user.email,
      createdAt: new Date(),
    });
    userRepo.getUserById.mockResolvedValue(user);
    verifier.verify.mockResolvedValue({
      providerUserId: 'goog-1',
      email: user.email,
      emailVerified: true,
    });

    const useCase = new SocialLoginUseCase(
      userRepo,
      socialAccountRepo,
      authSessionService,
      verifier,
      nonceStore,
    );

    await useCase.execute('google', 'id-token', 'client-nonce');

    expect(nonceStore.consume).toHaveBeenCalledWith('client-nonce');
    expect(nonceStore.consume).toHaveBeenCalledTimes(1);
    expect(verifier.verify).toHaveBeenCalledWith('google', 'id-token', 'client-nonce');
    // Nonce store consumed BEFORE verifier was invoked
    const consumeOrder = nonceStore.consume.mock.invocationCallOrder[0];
    const verifyOrder = verifier.verify.mock.invocationCallOrder[0];
    expect(consumeOrder).toBeLessThan(verifyOrder);
  });

  it('rejects with INVALID_NONCE on replay (consume returns false) without calling the verifier', async () => {
    const { userRepo, socialAccountRepo, authSessionService, verifier, nonceStore } = makeMocks();
    nonceStore.consume.mockResolvedValueOnce(false);

    const useCase = new SocialLoginUseCase(
      userRepo,
      socialAccountRepo,
      authSessionService,
      verifier,
      nonceStore,
    );

    await expect(useCase.execute('google', 'id-token', 'replayed-nonce')).rejects.toMatchObject({
      code: 'INVALID_NONCE',
      statusCode: 401,
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('rejects with INVALID_NONCE when no nonce is provided and enforce=true', async () => {
    oidcNonceEnforce = true;
    const { userRepo, socialAccountRepo, authSessionService, verifier, nonceStore } = makeMocks();

    const useCase = new SocialLoginUseCase(
      userRepo,
      socialAccountRepo,
      authSessionService,
      verifier,
      nonceStore,
    );

    await expect(useCase.execute('google', 'id-token')).rejects.toMatchObject({
      code: 'INVALID_NONCE',
      statusCode: 401,
    });
    expect(nonceStore.consume).not.toHaveBeenCalled();
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('passes through (no nonce check) when nonce is absent and enforce=false', async () => {
    oidcNonceEnforce = false;
    const { userRepo, socialAccountRepo, authSessionService, verifier, nonceStore } = makeMocks();
    const user = makeUser();
    socialAccountRepo.findByProviderAndProviderUserId.mockResolvedValue({
      id: 'sa-1',
      userId: user.id,
      provider: 'google',
      providerUserId: 'goog-1',
      email: user.email,
      createdAt: new Date(),
    });
    userRepo.getUserById.mockResolvedValue(user);
    verifier.verify.mockResolvedValue({
      providerUserId: 'goog-1',
      email: user.email,
      emailVerified: true,
    });

    const useCase = new SocialLoginUseCase(
      userRepo,
      socialAccountRepo,
      authSessionService,
      verifier,
      nonceStore,
    );

    await useCase.execute('google', 'id-token');
    expect(nonceStore.consume).not.toHaveBeenCalled();
    expect(verifier.verify).toHaveBeenCalledWith('google', 'id-token', undefined);
  });
});
