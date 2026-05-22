/**
 * RED — T1.2 — R2 — `AdminExportRepositoryPg` MUST stop using the literal
 * fallback salt `'musaium-admin-export-v1'`.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R2 + §1.1.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.3 — constructor
 *   reads `env.exportPseudonymSalt` once; absence throws at construction (not
 *   at module-load) so tests stubbing env keep working.
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/jsonwebtoken/PATTERNS.md` §3.12 "DON'T store secrets in source
 *    control" — the literal `'musaium-admin-export-v1'` is functionally a
 *    secret-in-source for the pseudonymisation salt.
 *  - I-SEC5 — committed salt = trivial dictionary attack on pseudonyms
 *    (cf spec.md §1.1).
 *
 * Failure mode at HEAD `00325d81` :
 *  - `admin-export.repository.pg.ts:21` :
 *      const PSEUDONYM_SALT = env.exportPseudonymSalt ?? 'musaium-admin-export-v1';
 *    The literal is present → the source-grep assertion fails.
 *  - The repo accepts construction with `env.exportPseudonymSalt = undefined`
 *    (silently defaults) → the constructor-throws assertion fails.
 *
 * Run scope :
 *   pnpm jest tests/unit/admin/admin-export.repository.pg.no-fallback.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import { pseudonymise } from '@shared/security/pseudonym';

/**
 * Defer the require() so we can mutate the env mock BEFORE the module reads it.
 * `env` is read at module-scope today (line 21) — so we must reset the require
 * cache between tests to re-exercise that import-time read with new env values.
 */
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

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- re-require after doMock to pick up the mocked env shape
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

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- re-require after doMock to pick up the mocked env shape
      const mod = require(REPO_MODULE) as {
        AdminExportRepositoryPg: new (ds: unknown) => unknown;
      };
      expect(() => {
        new mod.AdminExportRepositoryPg(makeFakeDataSource());
      }).not.toThrow();
    });
  });

  describe('pseudonymise utility — key derivation control (cross-check)', () => {
    // Belt-and-braces : ensure the `pseudonymise` helper (sole consumer of the
    // salt) keys SHA-256 by exactly the provided salt and not by any embedded
    // constant. If a future regression re-introduces a hard-coded salt, this
    // sanity check catches the divergence between provided salt and output.
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
