#!/usr/bin/env node
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

const childEnv = {
  ...parsed,
  NODE_ENV: 'production',
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TS_NODE_PROJECT: path.join(projectRoot, 'tsconfig.json'),
  TS_NODE_TRANSPILE_ONLY: '1',
};

const envModule = path.join(projectRoot, 'src/config/env.ts');
const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'prodenv-'));

const result = spawnSync(
  process.execPath,
  [
    '-r',
    path.join(projectRoot, 'node_modules/ts-node/register'),
    '-r',
    path.join(projectRoot, 'node_modules/tsconfig-paths/register'),
    '-e',
    `require(${JSON.stringify(envModule)}); console.log('__PRODENV_OK__');`,
  ],
  { cwd: tmpCwd, env: childEnv, encoding: 'utf8' },
);

try {
  fs.rmSync(tmpCwd, { recursive: true, force: true });
} catch {}

const out = `${result.stdout || ''}${result.stderr || ''}`;

if (result.status === 0 && out.includes('__PRODENV_OK__')) {
  console.log(
    `✅ PASS — ${path.basename(candidate)} satisfies validateProductionEnv (prod boot would succeed).`,
  );
  process.exit(0);
}

console.error(`❌ FAIL — validateProductionEnv rejected ${path.basename(candidate)}:\n`);
const errLine = out.split('\n').find((l) => /Error:/.test(l));
console.error(errLine ? errLine.trim() : out.trim().split('\n').slice(-8).join('\n'));
console.error('\n(Fix the offending variable in the candidate file and re-run.)');
process.exit(1);
