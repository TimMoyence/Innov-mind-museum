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

    expect(audioCleanup.deleteUserAudio).toHaveBeenCalledTimes(1);
    expect(audioCleanup.deleteUserAudio).toHaveBeenCalledWith(42);

    expect(brevoRemoval.removeContact).toHaveBeenCalledTimes(1);
    expect(brevoRemoval.removeContact).toHaveBeenCalledWith('subject@example.com');

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
