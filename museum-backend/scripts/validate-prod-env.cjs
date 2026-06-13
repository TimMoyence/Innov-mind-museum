#!/usr/bin/env node
/*
 * validate-prod-env.cjs — prove a candidate .env passes the production boot wall.
 *
 * `src/config/env.ts` runs `validateProductionEnv(env)` at import time when
 * NODE_ENV=production (env.ts:595). This harness loads a candidate env file,
 * spawns a child that imports src/config/env under a CONTROLLED environment
 * (only the candidate's vars + NODE_ENV=production), and reports whether the
 * wall throws.
 *
 * Isolation: the child runs with cwd = a fresh temp dir so env.ts's own
 * `dotenv.config()` finds no stray repo `.env` to contaminate the check. The
 * child env contains ONLY the candidate file's keys, so a missing required var
 * is faithfully detected (it can't be masked by your local .env).
 *
 * Usage:
 *   node scripts/validate-prod-env.cjs [path]      # default: .env.production
 *   pnpm validate:prod-env -- .env.production
 *
 * Exit codes: 0 = PASS (boot would succeed), 1 = FAIL (wall rejected it),
 * 2 = harness error (file missing / toolchain).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

function fail(code, msg) {
  console.error(`[validate-prod-env] ${msg}`);
  process.exit(code);
}

let dotenv;
try {
  dotenv = require(path.join(projectRoot, 'node_modules/dotenv'));
} catch {
  fail(2, 'dotenv not found in node_modules — run pnpm install first.');
}

const candidate = path.resolve(process.argv[2] || path.join(projectRoot, '.env.production'));
if (!fs.existsSync(candidate)) {
  fail(2, `candidate env file not found: ${candidate}`);
}

const parsed = dotenv.parse(fs.readFileSync(candidate));

// Controlled child environment: candidate vars + minimal system. NODE_ENV is
// pinned to production so the import triggers validateProductionEnv.
const childEnv = {
  ...parsed,
  NODE_ENV: 'production',
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  // tsconfig-paths resolves aliases relative to the tsconfig's own dir, so the
  // tmp cwd does not break @modules/@shared resolution.
  TS_NODE_PROJECT: path.join(projectRoot, 'tsconfig.json'),
  TS_NODE_TRANSPILE_ONLY: '1',
};

const envModule = path.join(projectRoot, 'src/config/env.ts');
const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'prodenv-'));

const result = spawnSync(
  process.execPath,
  [
    '-r', path.join(projectRoot, 'node_modules/ts-node/register'),
    '-r', path.join(projectRoot, 'node_modules/tsconfig-paths/register'),
    '-e', `require(${JSON.stringify(envModule)}); console.log('__PRODENV_OK__');`,
  ],
  { cwd: tmpCwd, env: childEnv, encoding: 'utf8' },
);

try { fs.rmSync(tmpCwd, { recursive: true, force: true }); } catch { /* best effort */ }

const out = `${result.stdout || ''}${result.stderr || ''}`;

if (result.status === 0 && out.includes('__PRODENV_OK__')) {
  console.log(`✅ PASS — ${path.basename(candidate)} satisfies validateProductionEnv (prod boot would succeed).`);
  process.exit(0);
}

console.error(`❌ FAIL — validateProductionEnv rejected ${path.basename(candidate)}:\n`);
const errLine = out.split('\n').find((l) => /Error:/.test(l));
console.error(errLine ? errLine.trim() : out.trim().split('\n').slice(-8).join('\n'));
console.error('\n(Fix the offending variable in the candidate file and re-run.)');
process.exit(1);
