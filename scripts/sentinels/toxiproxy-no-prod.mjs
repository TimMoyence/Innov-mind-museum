#!/usr/bin/env node
/**
 * Sentinel: toxiproxy-no-prod  (Wave 3, W3-04)
 *
 * spec.md §EARS R2 + design.md §Architecture (2): Toxiproxy is a DEV/CI-only
 * weak-net shaper (it deliberately MITM-proxies + degrades traffic). Leaking it
 * into a production artifact = shipping a man-in-the-middle proxy. This sentinel
 * guards that NO production docker-compose file and NO EAS build profile ever
 * references:
 *   - the Toxiproxy image (the `toxiproxy` token), OR
 *   - the shaped port `3100`, OR
 *   - the admin port `8474`.
 *
 * It exits 0 when the scanned prod artifacts are clean and exits 1 + a non-empty
 * stderr message when any scanned file trips one of the forbidden tokens.
 *
 * Path overrides via env (so the self-test can point at temp fixtures WITHOUT
 * mutating the real tree — mirrors net-fault-prod-guard.mjs / the parity
 * sentinel's *_PATH precedent):
 *   - TOXIPROXY_PROD_COMPOSE → a prod docker-compose path to scan
 *   - TOXIPROXY_EAS_JSON     → an EAS profile JSON path to scan
 *
 * Wired into `pnpm lint` (`sentinel:toxiproxy-no-prod`, museum-backend) +
 * sentinel-mirror.yml (UFR-020 anti-bypass). Pure-Node structural string checks
 * (no AST/YAML dep; mirrors net-fault-prod-guard.mjs).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/sentinels → repo root is two up.
const REPO_ROOT = join(__dirname, '..', '..');

const PROD_COMPOSE =
  process.env.TOXIPROXY_PROD_COMPOSE ??
  join(REPO_ROOT, 'museum-backend', 'deploy', 'docker-compose.prod.yml');
const EAS_JSON =
  process.env.TOXIPROXY_EAS_JSON ?? join(REPO_ROOT, 'museum-frontend', 'eas.json');

/**
 * Forbidden tokens. Ports are matched on a word boundary so a larger number that
 * merely contains the digits (e.g. `18474`, `31000`) does not false-positive.
 */
const FORBIDDEN = [
  { label: 'the Toxiproxy image/service token "toxiproxy"', re: /toxiproxy/i },
  { label: 'the shaped port 3100', re: /\b3100\b/ },
  { label: 'the admin port 8474', re: /\b8474\b/ },
];

const failures = [];

/**
 * Scan a single file for the forbidden tokens; missing files are skipped (an
 * absent prod artifact is not a leak).
 * @param path - absolute file path.
 * @param kind - human label for the artifact class (compose / EAS).
 */
function scan(path, kind) {
  if (!existsSync(path)) {
    return;
  }
  const source = readFileSync(path, 'utf8');
  for (const { label, re } of FORBIDDEN) {
    if (re.test(source)) {
      failures.push({ path, kind, label });
    }
  }
}

scan(PROD_COMPOSE, 'prod compose');
scan(EAS_JSON, 'EAS profile');

if (failures.length === 0) {
  console.log(
    '[toxiproxy-no-prod] ✓ no prod compose / EAS profile references the toxiproxy image or its ports (:3100 / :8474)',
  );
  process.exit(0);
}

console.error(`[toxiproxy-no-prod] ✗ ${String(failures.length)} prod-leak(s) detected:`);
for (const f of failures) {
  console.error(`  • ${f.kind} (${f.path}) references ${f.label}`);
}
console.error(
  '  fix: Toxiproxy is dev/CI-only (docker-compose.dev.yml profiles:[weaknet]) — remove it from the prod artifact.',
);
process.exit(1);
