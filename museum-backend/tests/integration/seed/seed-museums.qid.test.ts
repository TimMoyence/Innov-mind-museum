/**
 * T-A4 (RED — Wave A / C4 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the seed-museums contract for Q-codes per D-SCOPE-WAVEA (decisions.md) :
 *
 *   - 3 Bordeaux museums seeded with the Wikidata Q-codes verified
 *     2026-05-21 in `c4b-sparql-counts.md` + memory
 *     `reference_bordeaux_museum_qcodes.md` :
 *       · Musée d'Aquitaine        → Q3329534
 *       · CAPC Musée d'art contemp → Q2945071
 *       · Cité du Vin               → Q16964634
 *   - 1 monument seeded (first-class V1 — "dehors") :
 *       · Pont de Pierre (Bordeaux)→ Q1773424 (NOT Q1576946 — that's an
 *         artist, training-data trap documented in c4b-sparql-counts.md).
 *   - The seed is **idempotent** — running twice on the same DB never produces
 *     duplicate rows (spec.md R-C4 acceptance criterion).
 *
 * RED expectation (today) :
 *   (a) `MuseumSeed` (museum-backend/scripts/seed-museums.ts:7-14) has NO
 *       `wikidataQid` field — source-text assertions fail.
 *   (b) `museums.wikidata_qid` column does NOT exist — SQL probe throws.
 *   (c) Pont de Pierre (Q1773424) row is NOT in the seed — source-text fails.
 *
 * Test strategy is a **fast hybrid** :
 *   - Source-text grep against `scripts/seed-museums.ts` (no DB needed) so
 *     the test runs quickly and gives clean RED signals on D-SCOPE-WAVEA
 *     data integrity (Q-codes presence + Pont de Pierre row).
 *   - Schema probe via the integration harness for `wikidata_qid` column,
 *     because the SQL column is a prerequisite for the seed mapping.
 *
 * We deliberately do NOT spawn `pnpm seed:museums` here :
 *   - `seed-museums.ts` runs `main()` at module-top, so it cannot be
 *     `import`ed without side effects (`process.exit(0)`).
 *   - Spawning ts-node in-test against the harness DB is slow (~5-10s startup)
 *     and brittle (env-var leakage). T-A9 green will validate the live seed
 *     via the existing `pnpm seed:museums` smoke path post-deploy (CI auto-
 *     runs it per ci-cd-backend.yml — D-SCOPE-WAVEA / decisions.md).
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const SEED_FILE = path.join(BACKEND_ROOT, 'scripts/seed-museums.ts');

/** Q-codes verified 2026-05-21 via SPARQL — single source of truth here. */
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
      // RED today : `interface MuseumSeed { name; slug; address; description;
      // latitude; longitude; }` — no wikidataQid. Must appear after T-A9.
      // Regex tolerates `wikidataQid?: string` or `wikidataQid: string | null`.
      expect(seedSource).toMatch(/wikidataQid\s*\??\s*:\s*string/);
    });
  });

  describe('source contract — 3 Bordeaux Q-codes + Pont de Pierre', () => {
    it(`seeds Musée d'Aquitaine with Q-code ${BORDEAUX_QIDS.AQUITAINE}`, () => {
      // Pair the slug + Q-code on the same row entry — the regex matches a
      // window that contains BOTH so we cannot accidentally satisfy this by
      // adding the Q-code on an unrelated row.
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
      // Pont de Pierre is a hors-musée monument (first-class V1 — "dehors").
      // The verified Q-code is Q1773424 ; Q1576946 is an artist trap (cf.
      // c4b-sparql-counts.md). The seed entry must have BOTH a Pont de
      // Pierre-ish identity AND the correct Q-code.
      const re = new RegExp(
        `(?:[Pp]ont\\s+de\\s+[Pp]ierre|pont-de-pierre)[\\s\\S]{0,400}wikidataQid:\\s*['"\`]${PONT_DE_PIERRE_QID}['"\`]`,
      );
      expect(seedSource).toMatch(re);
    });

    it('does not seed Pont de Pierre with the artist Q-code Q1576946 (training trap)', () => {
      // Defensive : if a future maintainer copies a Q-code from training data,
      // surface the mistake loudly.
      expect(seedSource).not.toContain('Q1576946');
    });
  });

  describe('idempotence contract — orUpdate on (slug, wikidata_qid)', () => {
    it('uses `.orUpdate(...)` rather than `.orIgnore()` so re-runs propagate Q-codes', () => {
      // .orIgnore() = `ON CONFLICT DO NOTHING` → rows already in prod retain
      // wikidata_qid=NULL after re-run (UPDATE never fires). The fix is to
      // switch to `.orUpdate(['wikidata_qid'], 'slug')` so the Q-code lands
      // on existing rows. Today the file still uses `.orIgnore()`.
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
      // RED today : 0 rows (column does not exist yet).
      expect(rows).toHaveLength(1);
    });
  });
});
