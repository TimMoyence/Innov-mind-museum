import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeUserRepo } from 'tests/helpers/auth/user-repo.mock';
import {
  makeDeleteAccountUseCase,
  type AudioCleanupLike,
  type BrevoRemovalLike,
  type ImageCleanupLike,
  type MarketingErasureFallbackLike,
} from 'tests/helpers/auth/erasure-chain.accessor';
import { logger } from '@shared/logger/logger';

const makeImageStorage = (): jest.Mocked<ImageCleanupLike> => ({
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});
const makeAudioCleanup = (): jest.Mocked<AudioCleanupLike> => ({
  deleteUserAudio: jest.fn().mockResolvedValue(undefined),
});
const makeBrevoRemoval = (): jest.Mocked<BrevoRemovalLike> => ({
  removeContact: jest.fn().mockResolvedValue({ outcome: 'deleted' }),
});
const makeFallback = (): jest.Mocked<MarketingErasureFallbackLike> => ({
  enqueueBrevoErasure: jest.fn().mockResolvedValue(undefined),
});

describe('DeleteAccountUseCase — durable Brevo erasure fallback (R5/R10/R12)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('enqueues a durable Brevo-erasure intent when removeContact throws (R5)', async () => {
    const user = makeUser({ id: 42, email: 'subject@example.com' });
    const repo = makeUserRepo(user);
    const brevoRemoval = makeBrevoRemoval();
    brevoRemoval.removeContact.mockRejectedValue(new Error('Brevo 503'));
    const fallback = makeFallback();

    const useCase = makeDeleteAccountUseCase({
      userRepository: repo,
      imageStorage: makeImageStorage(),
      audioCleanup: makeAudioCleanup(),
      brevoRemoval,
      marketingErasureFallback: fallback,
    });

    await useCase.execute(42);

    expect(fallback.enqueueBrevoErasure).toHaveBeenCalledTimes(1);
    expect(fallback.enqueueBrevoErasure).toHaveBeenCalledWith('subject@example.com');
    expect(repo.deleteUser).toHaveBeenCalledWith(42);
  });

  it('does NOT enqueue a fallback when removeContact succeeds (no spurious leads)', async () => {
    const repo = makeUserRepo(makeUser({ id: 7, email: 'ok@example.com' }));
    const brevoRemoval = makeBrevoRemoval();
    const fallback = makeFallback();

    const useCase = makeDeleteAccountUseCase({
      userRepository: repo,
      imageStorage: makeImageStorage(),
      audioCleanup: makeAudioCleanup(),
      brevoRemoval,
      marketingErasureFallback: fallback,
    });

    await useCase.execute(7);

    expect(fallback.enqueueBrevoErasure).not.toHaveBeenCalled();
    expect(repo.deleteUser).toHaveBeenCalledWith(7);
  });

  it('does not leak the full email to the structured logger on the Brevo failure branch (R12)', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    try {
      const email = 'leak-me@example.com';
      const repo = makeUserRepo(makeUser({ id: 11, email }));
      const brevoRemoval = makeBrevoRemoval();
      brevoRemoval.removeContact.mockRejectedValue(new Error('Brevo 500'));
      const fallback = makeFallback();

      const useCase = makeDeleteAccountUseCase({
        userRepository: repo,
        imageStorage: makeImageStorage(),
        audioCleanup: makeAudioCleanup(),
        brevoRemoval,
        marketingErasureFallback: fallback,
      });

      await useCase.execute(11);

      const serialised = warnSpy.mock.calls.map((c) => JSON.stringify(c)).join(' ');
      expect(serialised).not.toContain(email);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
