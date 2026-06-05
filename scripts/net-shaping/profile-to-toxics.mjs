#!/usr/bin/env node
/**
 * profile-to-toxics — emit Toxiproxy admin-API JSON for a network profile (W3-02).
 *
 * spec.md §EARS R1 + design.md §Architecture (1): turn a ratified network profile
 * (`NETWORK_PROFILES[name]`) into the list of Toxiproxy admin-API toxic objects an
 * operator POSTs to `http://<proxy>:8474/proxies/<name>/toxics` to shape the
 * `museum-backend` upstream into that weak-net condition.
 *
 * SINGLE SOURCE OF TRUTH: the per-toxic shaping (latency/jitter + the kbps→KB/s
 * bandwidth conversion) is computed ONCE in the backend mapper
 * `toToxics` (`@shared/net-shaping/networkProfiles`, the lone `kbpsToKBytesPerSec`
 * site). This script DERIVES its output from `toToxics` — it does NOT re-implement
 * the `/ 8` conversion. We only wrap each `{type, attributes}` the mapper returns
 * into the admin-API envelope `{name, type, stream, attributes}`.
 *
 * The `offline` profile (lossPct=1, bw=0) yields a zero-rate bandwidth toxic from
 * the mapper, which stalls the stream entirely — that is the blocking/timeout-class
 * toxic the offline contract requires (no synthetic toxic is added, so the emitted
 * count/types stay byte-equal to `toToxics`).
 *
 * Usage:
 *   node scripts/net-shaping/profile-to-toxics.mjs <profile>
 *     <profile> ∈ keys(NETWORK_PROFILES): offline | 2g | edge | 3g-lossy | flapping | normal
 *   stdout = JSON array of admin toxics; exit 0. Unknown/missing profile = exit 1.
 *
 * Implementation note (type stripping): the registry is a `.ts` module. Node's
 * default ESM loader cannot import `.ts`; type-stripping needs the
 * `--experimental-strip-types` flag. Rather than push that flag onto every caller
 * (`node profile-to-toxics.mjs <profile>` must Just Work), the script re-execs
 * itself once WITH the flag when `process.features.typescript` is falsy, piping the
 * child's stdout straight through. This keeps the import of `toToxics` real
 * (no re-implementation) while the public CLI invocation stays flag-free.
 *
 * lib-docs: none — node:child_process / node:fs / node:path / node:url (stdlib) +
 *   the local `@shared/net-shaping/networkProfiles` TS module (no external lib).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// scripts/net-shaping → repo root is two up.
const REPO_ROOT = join(__dirname, '..', '..');
const REGISTRY_PATH = join(
  REPO_ROOT,
  'museum-backend',
  'src',
  'shared',
  'net-shaping',
  'networkProfiles.ts',
);

/**
 * Re-exec this script once with `--experimental-strip-types` so the `.ts` registry
 * import resolves. The child inherits argv (minus the node/exec preamble) and its
 * stdout is forwarded verbatim; we exit with the child's status.
 */
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

/** Parse argv, load the mapper, print the admin toxics, exit. */
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

  // DERIVED from toToxics — no inline kbps→KB/s here. We only wrap each toxic the
  // mapper returns into the Toxiproxy admin-API envelope. The `stream` is taken
  // FROM the mapper toxic (NOT hard-coded): the mapper shapes BOTH directions —
  // an `upstream` bandwidth toxic (client→server uploads) AND a `downstream` one
  // (server→client chat SSE / image bytes). A symmetric latency toxic carries no
  // `stream`, so it defaults to `downstream` (Toxiproxy admin-API default).
  // The name is suffixed with the stream to keep the two bandwidth toxics distinct
  // on the same proxy.
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
