#!/usr/bin/env node
// @ts-check
/**
 * RED support runner (run 2026-06-04-hexagonal-boundaries-enforcement, T1.1).
 *
 * Loads the REAL `eslint.config.mjs` boundaries block and lints a fixture's
 * CONTENT through it at a virtual domain path, printing the count of
 * `boundaries/dependencies` errors as JSON to stdout. It runs as a child Node
 * process (native ESM) because the Jest `unit-integration` project executes
 * without `--experimental-vm-modules`, so it cannot itself dynamic-`import()` the
 * ESM flat config; the driver test (`tests/unit/architecture/boundaries-rule-bites.test.ts`)
 * spawns this runner via `execFileSync` and asserts on the parsed JSON.
 *
 * Why a virtual path: the `boundaries/elements` domain pattern only classifies
 * files under a module's domain directory. We lint the fixture's text as if it
 * lived at a synthetic module's domain path so the real domain element pattern
 * applies. A non-type-aware TypeScript parser is supplied (the boundaries rule
 * needs no type info; the real config projectService parser would reject a
 * non-existent virtual file path).
 *
 * Importing the REAL boundaries block (not a hand-rolled copy) co-verifies that
 * once T1.3 wires `import/resolver` into that block, the rule fires — and that
 * today, without the resolver, it does NOT (the RED signal: 0 errors on the
 * violating fixture → the driver assertion fails).
 *
 * Output contract (stdout, single JSON line):
 *   { "fixture": "<name>", "boundariesErrors": <int>, "fatals": ["<msg>", ...] }
 * Exit 0 on a successful lint (even with violations — they are the data the test
 * reads); exit 1 only on an internal runner error (bad argv, load failure).
 *
 * Usage: node tests/fixtures/architecture/lint-fixture-runner.mjs <fixtureAbsPath>
 *
 * Frozen-test discipline (UFR-022): sha256-hashed in red-test-manifest.json; the
 * green phase MUST NOT modify it byte-for-byte.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/fixtures/architecture -> museum-backend
const BACKEND_ROOT = resolve(__dirname, '../../..');
const CONFIG_PATH = resolve(BACKEND_ROOT, 'eslint.config.mjs');

// Virtual path under a synthetic module's domain dir so the real
// `boundaries/elements` domain pattern classifies the linted content as domain.
const VIRTUAL_DOMAIN_PATH = 'src/modules/_fixture/domain/violating.ts';
const BOUNDARIES_RULE_ID = 'boundaries/dependencies';

/**
 * @returns {Promise<import('eslint').Linter.Config>}
 */
async function loadRealBoundariesBlock() {
  const mod = await import(pathToFileURL(CONFIG_PATH).href);
  const arr = /** @type {import('eslint').Linter.Config[]} */ (mod.default);
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
