import { UpdateContentPreferencesUseCase } from '@modules/auth/useCase/updateContentPreferences.useCase';
import { AppError } from '@shared/errors/app.error';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

describe('UpdateContentPreferencesUseCase', () => {
  it('persists a single valid preference and returns it', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const usecase = new UpdateContentPreferencesUseCase(repo);

    const result = await usecase.execute(42, ['history']);

    expect(result.contentPreferences).toEqual(['history']);
    expect(repo.updateContentPreferences).toHaveBeenCalledWith(42, ['history']);
  });

  it('persists all three preferences in canonical order regardless of input order', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const usecase = new UpdateContentPreferencesUseCase(repo);

    const result = await usecase.execute(42, ['artist', 'history', 'technique']);

    expect(result.contentPreferences).toEqual(['history', 'technique', 'artist']);
    expect(repo.updateContentPreferences).toHaveBeenCalledWith(42, [
      'history',
      'technique',
      'artist',
    ]);
  });

  it('deduplicates repeated values', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const usecase = new UpdateContentPreferencesUseCase(repo);

    const result = await usecase.execute(42, ['history', 'history', 'artist', 'history']);

    expect(result.contentPreferences).toEqual(['history', 'artist']);
  });

  it('persists an empty array (clears preferences)', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const usecase = new UpdateContentPreferencesUseCase(repo);

    const result = await usecase.execute(42, []);

    expect(result.contentPreferences).toEqual([]);
    expect(repo.updateContentPreferences).toHaveBeenCalledWith(42, []);
  });

  it('throws 400 when payload is not an array', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const usecase = new UpdateContentPreferencesUseCase(repo);

    await expect(usecase.execute(42, 'history' as unknown)).rejects.toThrow(AppError);
    await expect(usecase.execute(42, null)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when payload contains an unknown preference', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const usecase = new UpdateContentPreferencesUseCase(repo);

    await expect(usecase.execute(42, ['history', 'politics'])).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repo.updateContentPreferences).not.toHaveBeenCalled();
  });

  it('throws 400 when payload exceeds the anti-DoS cap', async () => {
    const repo = makeUserRepo(makeUser({ id: 42 }));
    const usecase = new UpdateContentPreferencesUseCase(repo);

    // 51 items exceeds the MAX_RAW_PAYLOAD_LENGTH = 50 sanity cap.
    const huge = Array.from({ length: 51 }, () => 'history');
    await expect(usecase.execute(42, huge)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when the user does not exist', async () => {
    const repo = makeUserRepo(null);
    const usecase = new UpdateContentPreferencesUseCase(repo);

    await expect(usecase.execute(999, ['history'])).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.updateContentPreferences).not.toHaveBeenCalled();
  });
});
