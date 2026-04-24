import {
  DeleteAccountUseCase,
  type ImageCleanupPort,
  type LegacyImageRefLookup,
} from '@modules/auth/useCase/deleteAccount.useCase';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

/**
 * Suite focused on the image-cleanup pipeline wired into
 * {@link DeleteAccountUseCase} (user-scoped S3 deletion + legacy DB ref lookup).
 *
 * Complements the existing `deleteAccount.useCase.test.ts` — which covers the
 * top-level happy/error paths — with targeted assertions on the legacy fetcher
 * call order and payload.
 */
const makeImageStorage = (): jest.Mocked<ImageCleanupPort> => ({
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});

const makeLegacyLookup = (refs: string[] = []): jest.Mocked<LegacyImageRefLookup> => ({
  findLegacyImageRefsByUserId: jest.fn().mockResolvedValue(refs),
});

describe('DeleteAccountUseCase — image cleanup pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes deleteByPrefix with (userId, legacyFetcher) BEFORE DB cascade', async () => {
    const user = makeUser({ id: 7 });
    const repo = makeUserRepo(user);
    const imageStorage = makeImageStorage();
    const lookup = makeLegacyLookup(['s3://chat-images/orphan-key-1.jpg']);

    const callOrder: string[] = [];
    imageStorage.deleteByPrefix.mockImplementation(async () => {
      callOrder.push('storage:deleteByPrefix');
    });
    repo.deleteUser.mockImplementation(async () => {
      callOrder.push('repo:deleteUser');
    });

    const useCase = new DeleteAccountUseCase(repo, imageStorage, lookup);

    await useCase.execute(7);

    // Order is load-bearing — CASCADE wipes chat_messages, so legacy refs MUST
    // be read (via the fetcher) before the user row is deleted.
    expect(callOrder).toEqual(['storage:deleteByPrefix', 'repo:deleteUser']);

    expect(imageStorage.deleteByPrefix).toHaveBeenCalledTimes(1);
    const [userIdArg, fetcherArg] = imageStorage.deleteByPrefix.mock.calls[0];
    expect(userIdArg).toBe(7);
    expect(typeof fetcherArg).toBe('function');
  });

  it('forwards the legacy fetcher that resolves refs returned by the lookup', async () => {
    const legacyRefs = ['s3://chat-images/legacy-1.jpg', 's3://chat-images/legacy-2.png'];
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const imageStorage = makeImageStorage();
    const lookup = makeLegacyLookup(legacyRefs);

    const useCase = new DeleteAccountUseCase(repo, imageStorage, lookup);
    await useCase.execute(42);

    // Grab the fetcher the use case handed to the storage adapter and exercise
    // it the way the real S3 implementation would.
    const forwardedFetcher = imageStorage.deleteByPrefix.mock.calls[0][1];
    expect(forwardedFetcher).toBeDefined();
    expect(typeof forwardedFetcher).toBe('function');

    const resolvedRefs = await forwardedFetcher!(42);
    expect(resolvedRefs).toEqual(legacyRefs);
    expect(lookup.findLegacyImageRefsByUserId).toHaveBeenCalledWith(42);
  });

  it('swallows lookup failures inside the fetcher without breaking cleanup', async () => {
    const repo = makeUserRepo(makeUser({ id: 13 }));
    const imageStorage = makeImageStorage();
    const lookup = makeLegacyLookup();
    lookup.findLegacyImageRefsByUserId.mockRejectedValue(new Error('DB down'));

    const useCase = new DeleteAccountUseCase(repo, imageStorage, lookup);
    await useCase.execute(13);

    const forwardedFetcher = imageStorage.deleteByPrefix.mock.calls[0][1];
    expect(forwardedFetcher).toBeDefined();

    // A lookup failure must degrade gracefully (empty list) — the S3 prefix
    // scan still removes every user-scoped key, so the deletion flow is safe.
    await expect(forwardedFetcher!(13)).resolves.toEqual([]);
    expect(repo.deleteUser).toHaveBeenCalledWith(13);
  });

  it('passes an undefined fetcher when no legacy lookup is wired', async () => {
    const repo = makeUserRepo(makeUser({ id: 5 }));
    const imageStorage = makeImageStorage();

    const useCase = new DeleteAccountUseCase(repo, imageStorage /* no lookup */);
    await useCase.execute(5);

    expect(imageStorage.deleteByPrefix).toHaveBeenCalledWith(5, undefined);
  });
});
