#!/usr/bin/env node
/**
 * Sentinel: idor-smoke
 *
 * Runs the IDOR matrix integration test in museum-backend.
 *
 *   target: tests/integration/security/idor-matrix.test.ts
 *
 * If the test file is not present (e.g. removed during refactor — should not
 * happen) the sentinel SKIPs gracefully. Re-introducing the file re-arms it.
 *
 * Exit 0 = pass / SKIP / 1 = IDOR coverage failed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const backend = path.join(repoRoot, 'museum-backend');
const testFile = path.join(backend, 'tests', 'integration', 'security', 'idor-matrix.test.ts');

if (!fs.existsSync(testFile)) {
  console.log(
    '[sentinel:idor-smoke] SKIP — tests/integration/security/idor-matrix.test.ts missing. Sentinel auto-activates when file lands.',
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
    '--passWithNoTests',
    '--testPathPattern=tests/integration/security/idor-matrix',
  ],
  { cwd: backend, stdio: 'inherit', shell: false },
);

if (result.status !== 0) {
  console.error('[sentinel:idor-smoke] FAIL — IDOR matrix red. Authorization regression likely.');
  process.exit(1);
}

console.log('[sentinel:idor-smoke] PASS');
process.exit(0);
