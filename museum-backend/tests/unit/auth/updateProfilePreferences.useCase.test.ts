/**
 * TD-2 — Unit tests for {@link UpdateProfilePreferencesUseCase}.
 *
 * Pattern mirrors `updateTtsVoice-usecase.test.ts` — same fixture + repo mock.
 * Covers: partial patch, full patch, empty patch (use-case-safe / route-blocked),
 * user-not-found 404, and the canonical "patch overrides server" return shape.
 */
import { UpdateProfilePreferencesUseCase } from '@modules/auth/useCase/account/updateProfilePreferences.useCase';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

describe('UpdateProfilePreferencesUseCase', () => {
  it('persists a partial patch and echoes patch fields over server fields', async () => {
    const repo = makeUserRepo(
      makeUser({
        id: 1,
        defaultLocale: 'en-US',
        defaultMuseumMode: true,
        guideLevel: 'beginner',
        dataMode: 'auto',
        audioDescriptionMode: false,
      }),
    );

    const result = await new UpdateProfilePreferencesUseCase(repo).execute(1, {
      defaultLocale: 'fr-FR',
      guideLevel: 'expert',
    });

    expect(repo.updateProfilePreferences).toHaveBeenCalledWith(1, {
      defaultLocale: 'fr-FR',
      guideLevel: 'expert',
    });
    expect(result).toEqual({
      defaultLocale: 'fr-FR',
      defaultMuseumMode: true,
      guideLevel: 'expert',
      dataMode: 'auto',
      audioDescriptionMode: false,
    });
  });

  it('persists a full patch with all 5 fields', async () => {
    const repo = makeUserRepo(makeUser({ id: 1 }));

    const result = await new UpdateProfilePreferencesUseCase(repo).execute(1, {
      defaultLocale: 'fr-FR',
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
      dataMode: 'low',
      audioDescriptionMode: true,
    });

    expect(repo.updateProfilePreferences).toHaveBeenCalledWith(1, {
      defaultLocale: 'fr-FR',
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
      dataMode: 'low',
      audioDescriptionMode: true,
    });
    expect(result).toEqual({
      defaultLocale: 'fr-FR',
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
    // All fields fall through to server defaults.
    expect(result).toEqual({
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      dataMode: 'auto',
      audioDescriptionMode: false,
    });
  });

  it('rejects with 404 when the user does not exist', async () => {
    const repo = makeUserRepo(null);

    await expect(
      new UpdateProfilePreferencesUseCase(repo).execute(99, { defaultLocale: 'fr-FR' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(repo.updateProfilePreferences).not.toHaveBeenCalled();
  });
});
