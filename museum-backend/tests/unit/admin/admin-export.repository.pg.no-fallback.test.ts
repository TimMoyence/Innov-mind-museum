import fs from 'node:fs';
import path from 'node:path';

import { pseudonymise } from '@shared/security/pseudonym';

const REPO_MODULE = '@modules/admin/adapters/secondary/pg/admin-export.repository.pg';
const ENV_MODULE = '@src/config/env';

interface FakeDataSource {
  getRepository: jest.Mock;
}

const makeFakeDataSource = (): FakeDataSource => ({
  getRepository: jest.fn(() => ({
    createQueryBuilder: jest.fn(),
  })),
});

const SOURCE_PATH = path.resolve(
  __dirname,
  '../../../src/modules/admin/adapters/secondary/pg/admin-export.repository.pg.ts',
);

describe('AdminExportRepositoryPg — no-fallback salt (R2, I-SEC5)', () => {
  describe('source-level invariant', () => {
    it('source file has 0 occurrence of the literal "musaium-admin-export-v1"', () => {
      const source = fs.readFileSync(SOURCE_PATH, 'utf8');
      expect(source).not.toMatch(/musaium-admin-export-v1/);
    });
  });

  describe('runtime invariant — constructor', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    afterEach(() => {
      jest.resetModules();
    });

    it('throws at construction when env.exportPseudonymSalt is undefined (R2.a)', () => {
      jest.doMock(ENV_MODULE, () => ({
        env: {
          exportPseudonymSalt: undefined,
        },
      }));

      const mod = require(REPO_MODULE) as {
        AdminExportRepositoryPg: new (ds: unknown) => unknown;
      };
      expect(() => {
        new mod.AdminExportRepositoryPg(makeFakeDataSource());
      }).toThrow(/EXPORT_PSEUDONYM_SALT|exportPseudonymSalt/);
    });

    it('constructs cleanly when env.exportPseudonymSalt is a non-empty string (R2.b)', () => {
      jest.doMock(ENV_MODULE, () => ({
        env: {
          exportPseudonymSalt: 'x'.repeat(48),
        },
      }));

      const mod = require(REPO_MODULE) as {
        AdminExportRepositoryPg: new (ds: unknown) => unknown;
      };
      expect(() => {
        new mod.AdminExportRepositoryPg(makeFakeDataSource());
      }).not.toThrow();
    });
  });

  describe('pseudonymise utility — key derivation control (cross-check)', () => {
    it('produces different outputs for two different salts on the same value', () => {
      const a = pseudonymise('alice@example.com', 'salt-A-secret-32-chars-padding-xx');
      const b = pseudonymise('alice@example.com', 'salt-B-secret-32-chars-padding-xx');
      expect(a).not.toEqual(b);
    });

    it('produces stable output across calls for the same (value, salt) tuple', () => {
      const salt = 'stable-salt-32chars-padding-xxxx';
      const a = pseudonymise('alice@example.com', salt);
      const b = pseudonymise('alice@example.com', salt);
      expect(a).toEqual(b);
    });
  });
});
