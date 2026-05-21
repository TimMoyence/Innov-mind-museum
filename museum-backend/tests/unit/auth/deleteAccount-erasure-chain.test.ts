/**
 * RED (T2.1) — `DeleteAccountUseCase` ordered best-effort erasure chain
 * (B1 + B2, R1–R6, R16–R17).
 *
 * On account deletion the use case must, BEFORE the DB cascade (`deleteUser`):
 *   1. clean up images  (existing port)
 *   2. delete the user's TTS audio   (new AudioCleanupPort.deleteUserAudio)
 *   3. remove the Brevo marketing contact (new removeContact(email))
 * Each external step is best-effort: a failure is logged and swallowed, the
 * remaining steps + `deleteUser` still run (R17). Ordering is load-bearing:
 * all external cleanups precede `deleteUser` (R16) because the DB rows are the
 * source of the refs/email.
 *
 * Does NOT modify `deleteAccount-image-cleanup.test.ts` (which locks the image
 * (userId, legacyFetcher) contract).
 *
 * FAILS at red baseline: the current `DeleteAccountUseCase` ignores the 4th/5th
 * ctor args, so `deleteUserAudio` / `removeContact` are never invoked → the
 * "called once before deleteUser" assertions fail.
 */
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeUserRepo } from 'tests/helpers/auth/user-repo.mock';
import {
  makeDeleteAccountUseCase,
  type AudioCleanupLike,
  type BrevoRemovalLike,
  type ImageCleanupLike,
} from 'tests/helpers/auth/erasure-chain.accessor';

const makeImageStorage = (): jest.Mocked<ImageCleanupLike> => ({
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});
const makeAudioCleanup = (): jest.Mocked<AudioCleanupLike> => ({
  deleteUserAudio: jest.fn().mockResolvedValue(undefined),
});
const makeBrevoRemoval = (): jest.Mocked<BrevoRemovalLike> => ({
  removeContact: jest.fn().mockResolvedValue({ outcome: 'deleted' }),
});

describe('DeleteAccountUseCase — erasure chain ordering (B1 + B2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes audio + removes Brevo contact, both BEFORE deleteUser (R16)', async () => {
    const user = makeUser({ id: 42, email: 'subject@example.com' });
    const repo = makeUserRepo(user);
    const imageStorage = makeImageStorage();
    const audioCleanup = makeAudioCleanup();
    const brevoRemoval = makeBrevoRemoval();

    const order: string[] = [];
    imageStorage.deleteByPrefix.mockImplementation(async () => {
      order.push('image');
    });
    audioCleanup.deleteUserAudio.mockImplementation(async () => {
      order.push('audio');
    });
    brevoRemoval.removeContact.mockImplementation(async () => {
      order.push('brevo');
      return { outcome: 'deleted' };
    });
    repo.deleteUser.mockImplementation(async () => {
      order.push('deleteUser');
    });

    const useCase = makeDeleteAccountUseCase({
      userRepository: repo,
      imageStorage,
      audioCleanup,
      brevoRemoval,
    });

    await useCase.execute(42);

    // Audio cleanup invoked exactly once with the user id.
    expect(audioCleanup.deleteUserAudio).toHaveBeenCalledTimes(1);
    expect(audioCleanup.deleteUserAudio).toHaveBeenCalledWith(42);

    // Brevo removal invoked exactly once with the user's email.
    expect(brevoRemoval.removeContact).toHaveBeenCalledTimes(1);
    expect(brevoRemoval.removeContact).toHaveBeenCalledWith('subject@example.com');

    // Every external cleanup precedes the DB cascade.
    const deleteUserIdx = order.indexOf('deleteUser');
    expect(deleteUserIdx).toBeGreaterThan(-1);
    expect(order.indexOf('image')).toBeLessThan(deleteUserIdx);
    expect(order.indexOf('audio')).toBeLessThan(deleteUserIdx);
    expect(order.indexOf('brevo')).toBeLessThan(deleteUserIdx);
  });

  it('continues + still deletes the user when AUDIO cleanup throws (R17)', async () => {
    const repo = makeUserRepo(makeUser({ id: 7, email: 'a@b.c' }));
    const imageStorage = makeImageStorage();
    const audioCleanup = makeAudioCleanup();
    const brevoRemoval = makeBrevoRemoval();
    audioCleanup.deleteUserAudio.mockRejectedValue(new Error('S3 down'));

    const useCase = makeDeleteAccountUseCase({
      userRepository: repo,
      imageStorage,
      audioCleanup,
      brevoRemoval,
    });

    await expect(useCase.execute(7)).resolves.toBeUndefined();
    expect(brevoRemoval.removeContact).toHaveBeenCalledTimes(1);
    expect(repo.deleteUser).toHaveBeenCalledWith(7);
  });

  it('continues + still deletes the user when BREVO removal throws (R17)', async () => {
    const repo = makeUserRepo(makeUser({ id: 8, email: 'c@d.e' }));
    const imageStorage = makeImageStorage();
    const audioCleanup = makeAudioCleanup();
    const brevoRemoval = makeBrevoRemoval();
    brevoRemoval.removeContact.mockRejectedValue(new Error('Brevo 500'));

    const useCase = makeDeleteAccountUseCase({
      userRepository: repo,
      imageStorage,
      audioCleanup,
      brevoRemoval,
    });

    await expect(useCase.execute(8)).resolves.toBeUndefined();
    expect(audioCleanup.deleteUserAudio).toHaveBeenCalledTimes(1);
    expect(repo.deleteUser).toHaveBeenCalledWith(8);
  });

  it('continues + still deletes the user when IMAGE cleanup throws (R17)', async () => {
    const repo = makeUserRepo(makeUser({ id: 9, email: 'f@g.h' }));
    const imageStorage = makeImageStorage();
    const audioCleanup = makeAudioCleanup();
    const brevoRemoval = makeBrevoRemoval();
    imageStorage.deleteByPrefix.mockRejectedValue(new Error('S3 list 503'));

    const useCase = makeDeleteAccountUseCase({
      userRepository: repo,
      imageStorage,
      audioCleanup,
      brevoRemoval,
    });

    await expect(useCase.execute(9)).resolves.toBeUndefined();
    expect(audioCleanup.deleteUserAudio).toHaveBeenCalledTimes(1);
    expect(brevoRemoval.removeContact).toHaveBeenCalledTimes(1);
    expect(repo.deleteUser).toHaveBeenCalledWith(9);
  });
});
