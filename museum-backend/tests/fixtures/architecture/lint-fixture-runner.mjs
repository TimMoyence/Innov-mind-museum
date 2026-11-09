#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, '../../..');
const CONFIG_PATH = resolve(BACKEND_ROOT, 'eslint.config.mjs');

const VIRTUAL_DOMAIN_PATH = 'src/modules/_fixture/domain/violating.ts';
const BOUNDARIES_RULE_ID = 'boundaries/dependencies';

async function loadRealBoundariesBlock() {
  const mod = await import(pathToFileURL(CONFIG_PATH).href);
  const arr = mod.default;
  const block = arr.find(
    (c) => c.plugins && Object.prototype.hasOwnProperty.call(c.plugins, 'boundaries'),
  );
  if (!block) {
    throw new Error('could not locate the boundaries config block in eslint.config.mjs');
  }
  return block;
}

async function main() {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    console.error('usage: lint-fixture-runner.mjs <fixtureAbsPath>');
    process.exit(1);
  }

  const boundariesBlock = await loadRealBoundariesBlock();
  const code = readFileSync(fixturePath, 'utf8');

  const eslint = new ESLint({
    cwd: BACKEND_ROOT,
    overrideConfigFile: true,
    overrideConfig: [
      {
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { projectService: false, project: false },
        },
      },
      boundariesBlock,
    ],
  });

  const results = await eslint.lintText(code, { filePath: VIRTUAL_DOMAIN_PATH });
  const messages = results[0]?.messages ?? [];
  const fatals = messages.filter((m) => m.fatal === true).map((m) => m.message);
  const boundariesErrors = messages.filter((m) => m.ruleId === BOUNDARIES_RULE_ID).length;

  process.stdout.write(
    JSON.stringify({
      fixture: fixturePath.split('/').slice(-1)[0],
      boundariesErrors,
      fatals,
    }) + '\n',
  );
}

main().catch((err) => {
  console.error(`lint-fixture-runner error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
