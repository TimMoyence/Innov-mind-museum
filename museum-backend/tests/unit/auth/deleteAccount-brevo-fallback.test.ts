/**
 * RED (T2.1 — Cycle D, R5/R10/R12) — a failed Brevo `removeContact` during
 * account deletion must ENQUEUE A DURABLE ERASURE INTENT, not warn-and-drop.
 *
 * Today the Brevo step (`deleteAccount.useCase.ts:108-117`) is warn-and-continue:
 * if `removeContact` throws (5xx / 429 / timeout), the marketing contact
 * SURVIVES the account deletion — residual third-party PII with no recovery
 * (spec §1.3, R5). The fix: on a Brevo-step failure the use case calls a new
 * `marketingErasureFallback.enqueueBrevoErasure(user.email)` port (a durable
 * retry intent, reusing the `leads` redelivery infra, design §1 D3), while still
 * running `deleteUser` (R10 — a third-party outage never blocks DB erasure).
 *
 * R12 — the enqueue/log path must not leak the full email beyond the lead
 * payload itself (assert no full-email argument to the logger on the failure
 * branch).
 *
 * RED at baseline: `DeleteAccountUseCase` has no `marketingErasureFallback`
 * constructor arg and never enqueues anything — `enqueueBrevoErasure` is never
 * called → the assertion fails.
 */
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

    // The intent must be PERSISTED for durable retry, not just warn-logged.
    expect(fallback.enqueueBrevoErasure).toHaveBeenCalledTimes(1);
    expect(fallback.enqueueBrevoErasure).toHaveBeenCalledWith('subject@example.com');
    // R10 — the DB erasure must still run despite the Brevo outage.
    expect(repo.deleteUser).toHaveBeenCalledWith(42);
  });

  it('does NOT enqueue a fallback when removeContact succeeds (no spurious leads)', async () => {
    const repo = makeUserRepo(makeUser({ id: 7, email: 'ok@example.com' }));
    const brevoRemoval = makeBrevoRemoval(); // resolves { outcome: 'deleted' }
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

      // No warn/log argument may contain the full email (PII-safe — userId only).
      const serialised = warnSpy.mock.calls.map((c) => JSON.stringify(c)).join(' ');
      expect(serialised).not.toContain(email);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
