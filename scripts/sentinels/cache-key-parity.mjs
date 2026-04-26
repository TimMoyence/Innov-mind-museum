#!/usr/bin/env node
/**
 * Sentinel: cache-key-parity
 *
 * Runs the dedicated parity test in museum-backend that asserts cache key
 * derivation stays in sync between producer (write) and consumer (read).
 *
 *   target: tests/contract/cache-key-parity.test.ts
 *
 * If the test file does not yet exist (W1.T1 in progress) the sentinel
 * SKIPs gracefully, returning 0. Once the file lands the sentinel naturally
 * activates — there is no toggle.
 *
 * Exit 0 = pass / SKIP / 1 = test failed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const backend = path.join(repoRoot, 'museum-backend');
const testFile = path.join(backend, 'tests', 'contract', 'cache-key-parity.test.ts');

if (!fs.existsSync(testFile)) {
  console.log(
    '[sentinel:cache-key-parity] SKIP — test not yet present (tests/contract/cache-key-parity.test.ts). Sentinel auto-activates when file lands.',
  );
  process.exit(0);
}

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'jest',
    '--watchman=false',
    '--runInBand',
    '--silent',
    '--coverage=false',
    '--testPathPattern=tests/contract/cache-key-parity',
  ],
  { cwd: backend, stdio: 'inherit', shell: false },
);

if (result.status !== 0) {
  console.error('[sentinel:cache-key-parity] FAIL — parity test red.');
  process.exit(1);
}

console.log('[sentinel:cache-key-parity] PASS');
process.exit(0);
