import { AppError } from '@shared/errors/app.error';

import { GrantConsentUseCase } from '@modules/auth/useCase/consent/grantConsent.useCase';
import { RevokeConsentUseCase } from '@modules/auth/useCase/consent/revokeConsent.useCase';

import { makeUserConsentRepo } from '../../helpers/auth/userConsent-repo.mock';

describe('GrantConsentUseCase / RevokeConsentUseCase', () => {
  describe('GrantConsentUseCase', () => {
    it('records a grant with all fields when input is valid', async () => {
      const repo = makeUserConsentRepo();
      const useCase = new GrantConsentUseCase(repo);

      const row = await useCase.execute(7, 'location_to_llm', '2026-04-24', 'ui');

      expect(row.userId).toBe(7);
      expect(row.scope).toBe('location_to_llm');
      expect(row.version).toBe('2026-04-24');
      expect(row.source).toBe('ui');
      expect(row.revokedAt).toBeNull();
      expect(repo.rows).toHaveLength(1);
    });

    it('rejects unknown scope', async () => {
      const repo = makeUserConsentRepo();
      const useCase = new GrantConsentUseCase(repo);

      await expect(useCase.execute(1, 'mining_bitcoin', '1', 'ui')).rejects.toThrow(AppError);
    });

    it('rejects unknown source', async () => {
      const repo = makeUserConsentRepo();
      const useCase = new GrantConsentUseCase(repo);

      await expect(
        useCase.execute(1, 'location_to_llm', '2026-04-24', 'telepathy'),
      ).rejects.toThrow(AppError);
    });

    it('rejects empty or too-long version', async () => {
      const repo = makeUserConsentRepo();
      const useCase = new GrantConsentUseCase(repo);

      await expect(useCase.execute(1, 'location_to_llm', '', 'ui')).rejects.toThrow(AppError);
      await expect(useCase.execute(1, 'location_to_llm', 'x'.repeat(33), 'ui')).rejects.toThrow(
        AppError,
      );
    });
  });

  describe('RevokeConsentUseCase', () => {
    it('stamps revokedAt on the active grant', async () => {
      const repo = makeUserConsentRepo();
      await new GrantConsentUseCase(repo).execute(7, 'location_to_llm', '2026-04-24', 'ui');
      const revoke = new RevokeConsentUseCase(repo);

      await revoke.execute(7, 'location_to_llm');

      expect(await repo.isGranted(7, 'location_to_llm')).toBe(false);
      expect(repo.rows[0].revokedAt).toBeInstanceOf(Date);
    });

    it('is idempotent when no active grant exists', async () => {
      const repo = makeUserConsentRepo();
      const revoke = new RevokeConsentUseCase(repo);

      await expect(revoke.execute(7, 'analytics')).resolves.toBeUndefined();
      expect(repo.rows).toHaveLength(0);
    });

    it('rejects unknown scope', async () => {
      const repo = makeUserConsentRepo();
      const revoke = new RevokeConsentUseCase(repo);

      await expect(revoke.execute(1, 'sell_data_to_aliens')).rejects.toThrow(AppError);
    });
  });

  describe('isGranted lifecycle', () => {
    it('returns true after grant, false after revoke, true again on re-grant', async () => {
      const repo = makeUserConsentRepo();
      const grant = new GrantConsentUseCase(repo);
      const revoke = new RevokeConsentUseCase(repo);

      expect(await repo.isGranted(1, 'location_to_llm')).toBe(false);

      await grant.execute(1, 'location_to_llm', '2026-04-24', 'ui');
      expect(await repo.isGranted(1, 'location_to_llm')).toBe(true);

      await revoke.execute(1, 'location_to_llm');
      expect(await repo.isGranted(1, 'location_to_llm')).toBe(false);

      await grant.execute(1, 'location_to_llm', '2026-04-25', 'ui');
      expect(await repo.isGranted(1, 'location_to_llm')).toBe(true);

      // History preserved: 2 rows, first revoked, second active.
      expect(repo.rows).toHaveLength(2);
      expect(repo.rows[0].revokedAt).toBeInstanceOf(Date);
      expect(repo.rows[1].revokedAt).toBeNull();
    });
  });
});
