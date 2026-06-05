/**
 * W1-REG-09 (RED) — BE↔FE Network Profile Registry byte-identical parity.
 *
 * Spec: master spec §"Authoring home & vendoring" + tasks.md W1-REG-09 (EARS R5).
 * The frozen registry has a single source of truth on the FE
 * (`museum-frontend/shared/infrastructure/connectivity/networkProfiles.ts`); the
 * backend keeps a BYTE-IDENTICAL vendored data region
 * (`museum-backend/src/shared/net-shaping/networkProfiles.ts`). This contract
 * hashes the data region of each (delimited by the load-bearing markers below)
 * and asserts the two sha256 are EQUAL — drift = CI red.
 *
 * This test FAILS today because the BE copy does not exist yet (and the FE file
 * is authored in the same cycle). DRY: it hashes bytes from disk; no inline
 * registry literals.
 *
 * Data-region markers (the green phase MUST wrap the registry literal in both
 * files with these EXACT sentinels so only the data — not imports/comments —
 * is compared):
 *   // >>> NETWORK_PROFILES_DATA_REGION_START
 *   ...the NETWORK_PROFILES literal...
 *   // <<< NETWORK_PROFILES_DATA_REGION_END
 *
 * lib-docs: js-sha256 — not used here; we use node:crypto createHash('sha256')
 *   (zero-dependency, the same primitive the parity sentinel uses, design.md §2).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// __dirname = museum-backend/tests/contract → repo root is three levels up.
const REPO_ROOT = join(__dirname, '..', '..', '..');

const FE_REGISTRY = join(
  REPO_ROOT,
  'museum-frontend',
  'shared',
  'infrastructure',
  'connectivity',
  'networkProfiles.ts',
);
const BE_REGISTRY = join(
  REPO_ROOT,
  'museum-backend',
  'src',
  'shared',
  'net-shaping',
  'networkProfiles.ts',
);

const REGION_START = '// >>> NETWORK_PROFILES_DATA_REGION_START';
const REGION_END = '// <<< NETWORK_PROFILES_DATA_REGION_END';

function extractDataRegion(file: string): string {
  if (!existsSync(file)) {
    throw new Error(`registry file missing: ${file}`);
  }
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf(REGION_START);
  const end = source.indexOf(REGION_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `registry file ${file} is missing the data-region markers ` +
        `(${REGION_START} .. ${REGION_END})`,
    );
  }
  return source.slice(start + REGION_START.length, end);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

describe('Network Profile Registry BE↔FE parity (W1-REG-09)', () => {
  it('the BE vendored copy data region is byte-identical to the FE source', () => {
    const feHash = sha256(extractDataRegion(FE_REGISTRY));
    const beHash = sha256(extractDataRegion(BE_REGISTRY));

    expect(beHash).toBe(feHash);
  });
});
