#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');
const REGISTRY_PATH = join(
  REPO_ROOT,
  'museum-backend',
  'src',
  'shared',
  'net-shaping',
  'networkProfiles.ts',
);

function reExecWithTypeStripping() {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', __filename, ...process.argv.slice(2)],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  process.exit(result.status ?? 1);
}

if (process.features.typescript === false) {
  reExecWithTypeStripping();
} else {
  await main();
}

async function main() {
  const profileName = process.argv[2];
  if (profileName === undefined || profileName.length === 0) {
    process.stderr.write('usage: profile-to-toxics.mjs <profile>\n');
    process.exit(1);
  }

  const registry = await import(`file://${REGISTRY_PATH}`);
  const { NETWORK_PROFILES, toToxics } = registry;

  const profile = NETWORK_PROFILES[profileName];
  if (profile === undefined) {
    const valid = Object.keys(NETWORK_PROFILES).join(' | ');
    process.stderr.write(`unknown profile "${profileName}" (expected one of: ${valid})\n`);
    process.exit(1);
  }

  const adminToxics = toToxics(profile).map((toxic) => {
    const stream = toxic.stream ?? 'downstream';
    const nameSuffix = toxic.stream === undefined ? toxic.type : `${toxic.type}_${stream}`;
    return {
      name: `${profileName}_${nameSuffix}`,
      type: toxic.type,
      stream,
      attributes: toxic.attributes,
    };
  });

  process.stdout.write(`${JSON.stringify(adminToxics)}\n`);
  process.exit(0);
}
