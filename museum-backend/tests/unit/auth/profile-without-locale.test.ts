import { updateProfilePreferencesSchema } from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import { GetProfileUseCase } from '@modules/auth/useCase/account/getProfile.useCase';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

describe('M3 · le compte ne porte plus de langue', () => {
  it('M3 · le profil renvoie le niveau du guide mais aucune langue', async () => {
    const profile = await new GetProfileUseCase(makeUserRepo(makeUser({ id: 7 }))).execute(7);

    expect(profile).toHaveProperty('guideLevel', 'beginner');
    expect(profile).not.toHaveProperty('defaultLocale');
  });

  it('M3 · PATCH /me/preferences accepte un niveau et refuse une langue seule', () => {
    expect(updateProfilePreferencesSchema.safeParse({ guideLevel: 'expert' }).success).toBe(true);

    const withLocaleOnly = updateProfilePreferencesSchema.safeParse({ defaultLocale: 'fr' });

    expect(withLocaleOnly.success).toBe(false);
  });
});
