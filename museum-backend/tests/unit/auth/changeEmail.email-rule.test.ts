import bcrypt from 'bcrypt';

import { ChangeEmailUseCase } from '@modules/auth/useCase/email/changeEmail.useCase';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

jest.mock('bcrypt', () => ({
  ...jest.requireActual('bcrypt'),
  compare: jest.fn(),
}));

describe('TIM-2026-11-08-EMAIL-STRICT · changement d’e-mail', () => {
  beforeEach(() => {
    (bcrypt.compare as jest.Mock).mockReset();
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  it.each(['a@b.c', 'first..last@museum.fr', 'élodie@musée.fr'])(
    '%s : refusé comme à la route',
    async (email) => {
      const repo = makeUserRepo(makeUser(), { getUserByEmail: jest.fn().mockResolvedValue(null) });

      await expect(
        new ChangeEmailUseCase(repo).execute(1, email, 'ValidPass1'),
      ).rejects.toMatchObject({ statusCode: 400, message: 'Invalid email format' });
    },
  );

  it('nouvelle@museum.fr : accepté', async () => {
    const repo = makeUserRepo(makeUser(), { getUserByEmail: jest.fn().mockResolvedValue(null) });

    await expect(
      new ChangeEmailUseCase(repo).execute(1, 'nouvelle@museum.fr', 'ValidPass1'),
    ).resolves.toEqual(expect.any(String));
  });
});
