#!/usr/bin/env node
/**
 * Sentinel: net-profiles-parity
 *
 * Guards the contract that the Network Profile Registry has a SINGLE source of
 * truth on the frontend
 * (`museum-frontend/shared/infrastructure/connectivity/networkProfiles.ts`) and
 * that the backend vendored copy
 * (`museum-backend/src/shared/net-shaping/networkProfiles.ts`) carries a
 * BYTE-IDENTICAL data region.
 *
 * The data region of each file is delimited by the load-bearing markers:
 *   // >>> NETWORK_PROFILES_DATA_REGION_START
 *   ...the NETWORK_PROFILES literal...
 *   // <<< NETWORK_PROFILES_DATA_REGION_END
 * Only the bytes between the markers are hashed (so imports / comments / helper
 * functions around the literal can legitimately differ between the two files).
 *
 * The backend path can be overridden via `NET_PROFILES_BE_PATH` (used by the
 * self-test to point at a temp-mutated copy).
 *
 * Exit 0 = parity holds / 1 = drift detected (or a file/marker is missing).
 *
 * Modeled on `scripts/sentinels/sentry-scrubber-parity.mjs` (pure node:crypto,
 * zero dependencies).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const FE_REGISTRY = path.join(
  repoRoot,
  'museum-frontend',
  'shared',
  'infrastructure',
  'connectivity',
  'networkProfiles.ts',
);

const BE_REGISTRY =
  process.env.NET_PROFILES_BE_PATH ??
  path.join(repoRoot, 'museum-backend', 'src', 'shared', 'net-shaping', 'networkProfiles.ts');

const REGION_START = '// >>> NETWORK_PROFILES_DATA_REGION_START';
const REGION_END = '// <<< NETWORK_PROFILES_DATA_REGION_END';

const fail = (msg) => {
  console.error(`[sentinel:net-profiles-parity] FAIL — ${msg}`);
  process.exit(1);
};

function extractDataRegion(file) {
  if (!fs.existsSync(file)) {
    fail(`registry file missing: ${file}`);
  }
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf(REGION_START);
  const end = source.indexOf(REGION_END);
  if (start === -1 || end === -1 || end <= start) {
    fail(
      `registry file ${file} is missing the data-region markers ` +
        `(${REGION_START} .. ${REGION_END})`,
    );
  }
  return source.slice(start + REGION_START.length, end);
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const feHash = sha256(extractDataRegion(FE_REGISTRY));
const beHash = sha256(extractDataRegion(BE_REGISTRY));

if (feHash !== beHash) {
  fail(
    [
      'Network Profile Registry data region drifted between FE and BE.',
      `  FE (${path.relative(repoRoot, FE_REGISTRY)}): ${feHash}`,
      `  BE (${path.relative(repoRoot, BE_REGISTRY)}): ${beHash}`,
      'Action: the FE file is the source of truth — re-copy its data region',
      '(the bytes between the NETWORK_PROFILES_DATA_REGION markers) into the BE file.',
    ].join('\n'),
  );
}

console.log('[sentinel:net-profiles-parity] PASS — FE and BE registry data regions are byte-identical.');
process.exit(0);
