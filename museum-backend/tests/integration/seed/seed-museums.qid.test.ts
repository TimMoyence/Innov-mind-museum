import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const SEED_FILE = path.join(BACKEND_ROOT, 'scripts/seed-museums.ts');

const BORDEAUX_QIDS = {
  AQUITAINE: 'Q3329534',
  CAPC: 'Q2945071',
  CITE_DU_VIN: 'Q16964634',
} as const;
const PONT_DE_PIERRE_QID = 'Q1773424';

describe('seed-museums Q-code seeding (T-A4 — Wave A C4)', () => {
  jest.setTimeout(300_000);

  let seedSource: string;

  beforeAll(async () => {
    seedSource = await fs.readFile(SEED_FILE, 'utf8');
  });

  describe('source contract — MuseumSeed.wikidataQid field', () => {
    it('declares a `wikidataQid` property on the MuseumSeed interface', () => {
      expect(seedSource).toMatch(/wikidataQid\s*\??\s*:\s*string/);
    });
  });

  describe('source contract — 3 Bordeaux Q-codes + Pont de Pierre', () => {
    it(`seeds Musée d'Aquitaine with Q-code ${BORDEAUX_QIDS.AQUITAINE}`, () => {
      const re = new RegExp(
        `slug:\\s*['"\`]musee-d-aquitaine['"\`][\\s\\S]{0,400}wikidataQid:\\s*['"\`]${BORDEAUX_QIDS.AQUITAINE}['"\`]`,
      );
      expect(seedSource).toMatch(re);
    });

    it(`seeds CAPC Musée d'art contemporain with Q-code ${BORDEAUX_QIDS.CAPC}`, () => {
      const re = new RegExp(
        `slug:\\s*['"\`]capc-musee-d-art-contemporain['"\`][\\s\\S]{0,400}wikidataQid:\\s*['"\`]${BORDEAUX_QIDS.CAPC}['"\`]`,
      );
      expect(seedSource).toMatch(re);
    });

    it(`seeds La Cité du Vin with Q-code ${BORDEAUX_QIDS.CITE_DU_VIN}`, () => {
      const re = new RegExp(
        `slug:\\s*['"\`]la-cite-du-vin['"\`][\\s\\S]{0,400}wikidataQid:\\s*['"\`]${BORDEAUX_QIDS.CITE_DU_VIN}['"\`]`,
      );
      expect(seedSource).toMatch(re);
    });

    it(`seeds Pont de Pierre (Bordeaux monument) with Q-code ${PONT_DE_PIERRE_QID}`, () => {
      const re = new RegExp(
        `(?:[Pp]ont\\s+de\\s+[Pp]ierre|pont-de-pierre)[\\s\\S]{0,400}wikidataQid:\\s*['"\`]${PONT_DE_PIERRE_QID}['"\`]`,
      );
      expect(seedSource).toMatch(re);
    });

    it('does not seed Pont de Pierre with the artist Q-code Q1576946 (training trap)', () => {
      expect(seedSource).not.toContain('Q1576946');
    });
  });

  describe('idempotence contract — orUpdate on (slug, wikidata_qid)', () => {
    it('uses `.orUpdate(...)` rather than `.orIgnore()` so re-runs propagate Q-codes', () => {
      expect(seedSource).toMatch(/\.orUpdate\s*\(\s*\[\s*['"`]wikidata_qid['"`]/);
    });
  });

  describe('schema prerequisite — museums.wikidata_qid column exists', () => {
    let harness: IntegrationHarness;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
    });

    it('exposes a `wikidata_qid` column on the museums table (M1 migration shipped)', async () => {
      const rows = await harness.dataSource.query<{ column_name: string }[]>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'museums'
            AND column_name = 'wikidata_qid'`,
      );
      expect(rows).toHaveLength(1);
    });
  });
});
