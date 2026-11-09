import { UpdateProfilePreferencesUseCase } from '@modules/auth/useCase/account/updateProfilePreferences.useCase';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

describe('UpdateProfilePreferencesUseCase', () => {
  it('persists a partial patch and echoes patch fields over server fields', async () => {
    const repo = makeUserRepo(
      makeUser({
        id: 1,
        defaultMuseumMode: true,
        guideLevel: 'beginner',
        dataMode: 'auto',
        audioDescriptionMode: false,
      }),
    );

    const result = await new UpdateProfilePreferencesUseCase(repo).execute(1, {
      guideLevel: 'expert',
    });

    expect(repo.updateProfilePreferences).toHaveBeenCalledWith(1, {
      guideLevel: 'expert',
    });
    expect(result).toEqual({
      defaultMuseumMode: true,
      guideLevel: 'expert',
      dataMode: 'auto',
      audioDescriptionMode: false,
    });
  });

  it('persists a full patch with all 4 fields', async () => {
    const repo = makeUserRepo(makeUser({ id: 1 }));

    const result = await new UpdateProfilePreferencesUseCase(repo).execute(1, {
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
      dataMode: 'low',
      audioDescriptionMode: true,
    });

    expect(repo.updateProfilePreferences).toHaveBeenCalledWith(1, {
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
      dataMode: 'low',
      audioDescriptionMode: true,
    });
    expect(result).toEqual({
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
      dataMode: 'low',
      audioDescriptionMode: true,
    });
  });

  it('safely handles an empty patch (Zod blocks at route — use case stays safe)', async () => {
    const repo = makeUserRepo(makeUser({ id: 1 }));

    const result = await new UpdateProfilePreferencesUseCase(repo).execute(1, {});

    expect(repo.updateProfilePreferences).toHaveBeenCalledWith(1, {});
    expect(result).toEqual({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      dataMode: 'auto',
      audioDescriptionMode: false,
    });
  });

  it('rejects with 404 when the user does not exist', async () => {
    const repo = makeUserRepo(null);

    await expect(
      new UpdateProfilePreferencesUseCase(repo).execute(99, { guideLevel: 'expert' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(repo.updateProfilePreferences).not.toHaveBeenCalled();
  });
});
