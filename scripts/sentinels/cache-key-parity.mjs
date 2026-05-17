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

// The parity test is pure (deterministic hash builder, no Redis/BullMQ/DB),
// but its top-level imports transitively load `@src/config/env` which — when
// the developer's `.env` points at the Docker-internal `redis:` hostname
// (resolved inside the dev-backend container but not from the host) — kicks
// off an ioredis retry loop that never resolves and hangs jest before the
// first test runs. Pin the same env defaults the e2e setupFiles uses
// (`tests/helpers/e2e/jest-env.setup.ts`) so the sentinel works regardless
// of which `.env` the host carries.
//
// Override rule: if REDIS_URL points at the Docker-internal hostname
// (`redis://redis:6379` or `redis://:pwd@redis:6379`) we clear it so ioredis
// does not attempt to dial-and-retry on a host that won't resolve. Any other
// explicit value (e.g. `redis://localhost:6379`) is preserved — the user may
// have a working host-side Redis. CACHE_ENABLED / EXTRACTION_WORKER_ENABLED /
// GUARDRAIL_BUDGET_BACKEND are pinned to test-safe defaults if the parent
// shell did not override them explicitly.
const isDockerInternalRedis = /^redis:\/\/(?:[^@]*@)?redis(?::|\/)/.test(
  process.env.REDIS_URL ?? '',
);
const sentinelEnv = {
  ...process.env,
  CACHE_ENABLED: process.env.CACHE_ENABLED ?? 'false',
  EXTRACTION_WORKER_ENABLED: process.env.EXTRACTION_WORKER_ENABLED ?? 'false',
  GUARDRAIL_BUDGET_BACKEND: process.env.GUARDRAIL_BUDGET_BACKEND ?? 'memory',
  ...(isDockerInternalRedis ? { REDIS_URL: '' } : {}),
};

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
  { cwd: backend, stdio: 'inherit', shell: false, env: sentinelEnv },
);

if (result.status !== 0) {
  console.error('[sentinel:cache-key-parity] FAIL — parity test red.');
  process.exit(1);
}

console.log('[sentinel:cache-key-parity] PASS');
process.exit(0);
