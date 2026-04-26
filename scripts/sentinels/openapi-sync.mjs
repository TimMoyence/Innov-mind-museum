#!/usr/bin/env node
/**
 * Sentinel: openapi-sync
 *
 * Runs the backend OpenAPI spec validator and the frontend "generated types
 * are up to date" check. Both are reused from the apps' own scripts so this
 * sentinel inherits any rules upgraded there.
 *
 *   - cd museum-backend && pnpm openapi:validate
 *   - cd museum-frontend && npm run check:openapi-types
 *
 * Exit 0 = both pass / 1 = either fails.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function run(label, cmd, args, cwd) {
  console.log(`[sentinel:openapi-sync] -> ${label} (${cmd} ${args.join(' ')})`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    console.error(`[sentinel:openapi-sync] FAIL: ${label} exited with status ${result.status}`);
    return false;
  }
  return true;
}

const backendOk = run(
  'backend openapi:validate',
  'pnpm',
  ['openapi:validate'],
  path.join(repoRoot, 'museum-backend'),
);

const frontendOk = run(
  'frontend check:openapi-types',
  'npm',
  ['run', '--silent', 'check:openapi-types'],
  path.join(repoRoot, 'museum-frontend'),
);

if (!backendOk || !frontendOk) {
  console.error(
    '[sentinel:openapi-sync] Fix: regenerate types `cd museum-frontend && npm run generate:openapi-types`, ensure backend openapi.json is up to date.',
  );
  process.exit(1);
}

console.log('[sentinel:openapi-sync] PASS');
process.exit(0);
